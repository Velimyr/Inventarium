import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRecordSearchQuery } from '../../recordSearch';
import { INVENTORY_TYPES } from '../../inventoryType';
import { RECORD_SUMMARY_COLUMNS } from '../publicColumns';
import { searchUrl } from '../links';
import { L } from '../labels';
import {
  compact,
  errorResult,
  formatRecordSummary,
  isPastLastPage,
  jsonResult,
  must,
  pastLastPageResult,
  run,
} from '../format';
import {
  beyondDepthMessage,
  cleanText,
  isNarrowSignature,
  MAX_REACHABLE_RESULTS,
  meaningfulChars,
  MIN_MEANINGFUL_CHARS,
  reachablePagination,
  reachableRange,
  resolveAdminName,
} from '../filters';

export function registerSearchTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'search_inventories',
    {
      title: 'Пошук інвентарів',
      description:
        'Пошук підтверджених записів реєстру. Текстовий запит шукає входження в сучасній і давній ' +
        'назві населеного пункту, назві справи, примітках і шифрі; апостроф може бути будь-яким. ' +
        'Потрібен хоча б один вузький критерій: текст (щонайменше 3 літери чи цифри), район, громада або шифр ' +
        'справи з номером. Країна, регіон, роки й тип документа — лише додаткові фільтри. Назви регіону, району ' +
        `й громади мають однозначно впізнаватися в довіднику («Житомирська» → «Житомирська область»). Гортати можна ` +
        `перші ${MAX_REACHABLE_RESULTS} результатів — далі треба уточнити запит. Результати від новіших років до старіших. ` +
        'Для однозначного населеного пункту краще find_settlement → get_settlement_inventories.',
      inputSchema: {
        query: z.string().trim().optional().describe('Текст: назва населеного пункту (сучасна чи давня), слово з назви справи, шифр.'),
        country: z.string().trim().optional().describe('Сучасна країна: «Україна», «Польща», «Білорусь»…'),
        region: z.string().trim().optional().describe('Сучасна область / воєводство / край.'),
        district: z.string().trim().optional().describe('Сучасний район / повіт / округ.'),
        community: z.string().trim().optional().describe('Сучасна громада / ґміна / сільрада.'),
        year_from: z.number().int().optional().describe('Рік складання інвентаря — від (включно).'),
        year_to: z.number().int().optional().describe('Рік складання інвентаря — до (включно).'),
        case_signature: z.string().trim().optional().describe('Частина шифру справи з номером, наприклад «ЦДІАК 11-1».'),
        inventory_type: z.enum(INVENTORY_TYPES).optional().describe('Тип документа.'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const query = cleanText(args.query);
        const caseSignature = cleanText(args.case_signature);

        if (query && meaningfulChars(query) < MIN_MEANINGFUL_CHARS) {
          return errorResult(`Запит має містити щонайменше ${MIN_MEANINGFUL_CHARS} літери чи цифри.`);
        }

        const range = reachableRange(args.page, args.limit);
        if (!range) return errorResult(beyondDepthMessage());

        // Назви адмінподілу — лише однозначні (див. lib/mcp/filters.ts)
        const admin: { region?: string; district?: string; community?: string } = {};
        const country = cleanText(args.country);
        for (const level of ['region', 'district', 'community'] as const) {
          const value = cleanText(args[level]);
          if (!value) continue;
          const resolved = await resolveAdminName(level, value, { country, ...admin });
          if ('error' in resolved) return errorResult(resolved.error);
          admin[level] = resolved.name;
        }

        const hasNarrowCriterion =
          Boolean(query) || Boolean(admin.district) || Boolean(admin.community) || isNarrowSignature(caseSignature);
        if (!hasNarrowCriterion) {
          return errorResult(
            `Потрібен хоча б один вузький критерій: текст запиту (щонайменше ${MIN_MEANINGFUL_CHARS} літери чи цифри), ` +
              'район, громада або шифр справи з номером. Країна, регіон, роки й тип документа — лише додаткові фільтри.'
          );
        }

        const result = await buildRecordSearchQuery(
          supabase,
          {
            search: query,
            current_country: country,
            current_region: admin.region,
            current_district: admin.district,
            current_community: admin.community,
            inventory_year_from: args.year_from,
            inventory_year_to: args.year_to,
            case_signature: caseSignature,
            inventory_type: args.inventory_type,
          },
          { columns: RECORD_SUMMARY_COLUMNS, ...range }
        );
        if (isPastLastPage(result.error)) return pastLastPageResult(args.page);
        const rows = must(result);
        if (args.page > 1 && (rows || []).length === 0) return pastLastPageResult(args.page);

        return jsonResult(
          compact({
            ...reachablePagination(result.count ?? 0, args.page, args.limit),
            [L.appliedAdminFilters]: {
              [L.region]: admin.region,
              [L.district]: admin.district,
              [L.community]: admin.community,
            },
            [L.results]: (rows || []).map(formatRecordSummary),
            [L.siteSearchUrl]: query ? searchUrl(query) : null,
          })
        );
      })
  );
}
