import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSignature } from '../../caseSignature';
import { groupSameExceptYear, rowKey } from '../../yearRows';
import { findSettlementByCode } from '../../../components/keys/regionData';
import { loadRegionStructure } from '../../server/publicData';
import { PUBLIC_RECORD_COLUMNS } from '../publicColumns';
import { cleanText, meaningfulChars, MIN_MEANINGFUL_CHARS } from '../filters';
import { caseUrl, recordUrl } from '../links';
import {
  compact,
  currentPlaceLabel,
  currentSettlementUrl,
  errorResult,
  formatCaseFields,
  formatRecord,
  historicalPlaceLabel,
  jsonResult,
  markType,
  must,
  placeLabel,
  run,
  UUID_PATTERN,
} from '../format';

// Стеля, як на сторінці /settlement: населених пунктів із сотнями записів немає
// (медіана 2, максимум 60), але мовчки обрізати гірше, ніж сказати про це.
const MAX_SETTLEMENT_RECORDS = 1000;

/** Один інвентар у складі справи чи населеного пункту. */
const inventoryItem = (row: any) =>
  compact({
    id: row.id,
    url: recordUrl(row.id),
    inventory_year: row.inventory_year,
    inventory_type: row.inventory_type,
    inventory_start_page: row.inventory_start_page,
  });

// Рядки справи відрізняє населений пункт — сучасний і давній разом з
// адмінподілом (той самий ключ, що в pages/case.tsx). Рік до ключа не входить:
// саме за ним рядки й зводяться.
const caseSettlementKey = (row: any) =>
  rowKey([
    row.current_settlement_type, row.current_settlement_name,
    row.old_settlement_type, row.old_settlement_name,
    row.current_country, row.current_region, row.current_district, row.current_community,
    row.old_province, row.old_district, row.old_community,
  ]);

// Рядки населеного пункту відрізняє справа (той самий ключ, що в pages/settlement.tsx).
const settlementCaseKey = (row: any) =>
  rowKey([row.case_signature, row.case_title, row.scans_url ? 'scans' : 'no-scans']);

export function registerRecordTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'get_inventory',
    {
      title: 'Картка інвентаря',
      description:
        'Повна картка запису реєстру за id: населений пункт за сучасним і давнім адмінподілом, рік і тип ' +
        'документа, сторінка початку інвентаря, справа (шифр, додаткові шифри, назва, дати, к-ть сторінок, скани), ' +
        'примітки, проєкт транскрибування CoBook.',
      inputSchema: {
        id: z.string().trim().regex(UUID_PATTERN, 'id має бути UUID').describe('id запису (з результатів пошуку).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) =>
      run(async () => {
        const row = must(await supabase.from('records').select(PUBLIC_RECORD_COLUMNS).eq('id', id).maybeSingle());
        if (!row) return errorResult(`Запису з id ${id} у реєстрі немає.`);
        return jsonResult(formatRecord(row));
      })
  );

  server.registerTool(
    'get_case',
    {
      title: 'Архівна справа',
      description:
        'Усе, що є в реєстрі по одній архівній справі (шифру): поля справи і населені пункти, інвентарі яких ' +
        'у ній містяться, з роками. Показує також записи, де цей шифр указано як додатковий (та сама справа ' +
        'в іншому архіві). Якщо точного збігу немає — повертає схожі шифри.',
      inputSchema: {
        case_signature: z
          .string()
          .trim()
          .min(1)
          .describe('Шифр справи точно, як у реєстрі: «ЦДІАК 11-1-123», «AGAD ASK 1/7/0/9/4».'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const signature = normalizeSignature(args.case_signature);

        const [rows, listedAsAdditional] = await Promise.all([
          supabase
            .from('records')
            .select(PUBLIC_RECORD_COLUMNS)
            .eq('approved', true)
            .eq('case_signature', signature)
            .order('current_settlement_name', { ascending: true })
            .order('inventory_year', { ascending: true })
            .then(must),
          supabase
            .from('records')
            .select('id, case_signature, current_settlement_type, current_settlement_name, current_community, current_district, current_region, current_country, inventory_year')
            .eq('approved', true)
            .contains('additional_case_signature', [signature])
            .limit(50)
            .then(must),
        ]);

        const alsoAdditional = (listedAsAdditional || []).map((row: any) =>
          compact({
            id: row.id,
            url: recordUrl(row.id),
            main_case_signature: row.case_signature,
            settlement: currentPlaceLabel(row),
            inventory_year: row.inventory_year,
          })
        );

        if (!rows || rows.length === 0) {
          // Схожі шифри шукаємо лише за осмисленим фрагментом: «%» чи «ab» дали б
          // «схожими» довільні справи реєстру
          const fragment = cleanText(signature);
          const similar =
            meaningfulChars(fragment) >= MIN_MEANINGFUL_CHARS
              ? must(
                  await supabase
                    .from('records')
                    .select('case_signature')
                    .eq('approved', true)
                    .ilike('case_signature', `%${fragment}%`)
                    .limit(100)
                )
              : [];
          const signatures = Array.from(new Set((similar || []).map((r: any) => r.case_signature))).slice(0, 10);

          return jsonResult(
            compact({
              found: false,
              message: `Справи з шифром «${signature}» серед основних шифрів реєстру немає.`,
              listed_as_additional_signature_in: alsoAdditional,
              similar_signatures: signatures.map((s) => ({ case_signature: s, url: caseUrl(s) })),
            })
          );
        }

        const groups = groupSameExceptYear(rows, caseSettlementKey);
        return jsonResult(
          compact({
            found: true,
            ...formatCaseFields(rows[0]),
            inventories_count: rows.length,
            settlements: groups.map(({ items }) => ({
              settlement: currentPlaceLabel(items[0]),
              settlement_url: currentSettlementUrl(items[0]),
              settlement_historical: historicalPlaceLabel(items[0]),
              inventories: items.map((row: any) => compact({ ...inventoryItem(row), mark_type: markType(row.mark_type) })),
            })),
            listed_as_additional_signature_in: alsoAdditional,
          })
        );
      })
  );

  server.registerTool(
    'get_settlement_inventories',
    {
      title: 'Інвентарі населеного пункту',
      description:
        'Усі підтверджені інвентарі одного населеного пункту, згруповані за справами. Населений пункт задається ' +
        'кодом із find_settlement (надійніше) або точним сучасним шляхом: регіон, район, громада, назва — ' +
        'саме так, як їх повертає find_settlement.',
      inputSchema: {
        code: z.string().trim().optional().describe('Код населеного пункту з find_settlement, наприклад «UA18040170010074377».'),
        region: z.string().trim().optional(),
        district: z.string().trim().optional(),
        community: z.string().trim().optional(),
        name: z.string().trim().optional().describe('Сучасна назва населеного пункту.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        let place: { region: string; district: string; community: string; name: string; type?: string; country?: string };

        if (args.code) {
          const found = findSettlementByCode(await loadRegionStructure(), args.code);
          if (!found) return errorResult(`Населеного пункту з кодом ${args.code} у довіднику немає.`);
          place = found;
        } else if (args.region && args.district && args.community && args.name) {
          place = { region: args.region, district: args.district, community: args.community, name: args.name };
        } else {
          return errorResult('Вкажіть code з find_settlement або всі чотири поля: region, district, community, name.');
        }

        // Країну не звіряємо: назви регіонів у довіднику унікальні між країнами,
        // а в старих записах current_country ще NULL (див. lib/duplicateCheck.ts).
        const rows = must(
          await supabase
            .from('records')
            .select(PUBLIC_RECORD_COLUMNS)
            .eq('approved', true)
            .match({
              current_settlement_name: place.name,
              current_community: place.community,
              current_district: place.district,
              current_region: place.region,
            })
            .order('inventory_year', { ascending: false })
            .limit(MAX_SETTLEMENT_RECORDS)
        );

        const settlement = compact({
          label: placeLabel(place.type, place.name, place.community, place.district, place.region, place.country),
          url: rows?.length ? currentSettlementUrl(rows[0]) : null,
        });

        if (!rows || rows.length === 0) {
          return jsonResult({
            settlement,
            inventories_count: 0,
            message:
              'За цим населеним пунктом підтверджених інвентарів у реєстрі немає. Спробуйте search_inventories ' +
              'за давньою назвою або search_keys: інвентар міг бути прив’язаний до сусіднього пункту чи ключа.',
          });
        }

        const groups = groupSameExceptYear(rows, settlementCaseKey);
        return jsonResult(
          compact({
            settlement,
            inventories_count: rows.length,
            truncated: rows.length === MAX_SETTLEMENT_RECORDS ? true : null,
            cases: groups.map(({ items }) => ({
              ...formatCaseFields(items[0]),
              has_scans: Boolean(items[0].scans_url),
              inventories: items.map((row: any) =>
                compact({
                  ...inventoryItem(row),
                  settlement_historical: historicalPlaceLabel(row),
                  mark_type: markType(row.mark_type),
                })
              ),
            })),
          })
        );
      })
  );
}
