import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toSignatureList } from '../../caseSignature';
import { orIlikeTerm } from '../../textSearch';
import { PUBLIC_UNIDENTIFIED_COLUMNS } from '../publicColumns';
import { unidentifiedUrl } from '../links';
import { compact, errorResult, isPastLastPage, jsonResult, must, pastLastPageResult, run } from '../format';
import { beyondDepthMessage, cleanText, reachablePagination, reachableRange } from '../filters';

// Ті самі статуси, що показує публічна сторінка /unidentified: «done» — уже
// розібрані справи, їхні інвентарі перенесено в реєстр.
const OPEN_STATUSES = ['new', 'review'];

export function registerUnidentifiedTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'list_unidentified',
    {
      title: 'Неідентифіковані інвентарі',
      description:
        'Архівні справи, у яких є інвентарі, але ще не встановлено, яких населених пунктів вони стосуються. ' +
        'Дослідник, який упізнав населений пункт, може запропонувати його на сторінці справи (url). ' +
        'Фільтри архів/фонд/опис/справа шукають входження; query — у шифрі й назві справи.',
      inputSchema: {
        query: z.string().trim().optional().describe('Частина шифру або назви справи.'),
        archive: z.string().trim().optional().describe('Архів: «ЦДІАК», «AGAD»…'),
        fonds: z.string().trim().optional(),
        series: z.string().trim().optional().describe('Опис.'),
        record: z.string().trim().optional().describe('Справа.'),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const range = reachableRange(args.page, args.limit);
        if (!range) return errorResult(beyondDepthMessage());

        let query = supabase
          .from('records_notidentify')
          .select(PUBLIC_UNIDENTIFIED_COLUMNS, { count: 'exact' })
          .in('status', OPEN_STATUSES)
          .order('created_at', { ascending: false });

        for (const field of ['archive', 'fonds', 'series', 'record'] as const) {
          const value = cleanText(args[field]);
          if (value) query = query.ilike(field, `%${value}%`);
        }
        const text = cleanText(args.query);
        if (text) {
          const term = orIlikeTerm(text);
          query = query.or(`case_signature.ilike.%${term}%,case_title.ilike.%${term}%`);
        }

        const result = await query.range(range.from, range.to);
        if (isPastLastPage(result.error)) return pastLastPageResult(args.page);
        const rows = must(result) || [];
        if (args.page > 1 && rows.length === 0) return pastLastPageResult(args.page);

        return jsonResult({
          ...reachablePagination(result.count ?? 0, args.page, args.limit),
          results: rows.map((row: any) =>
            compact({
              id: row.id,
              url: unidentifiedUrl(row.id),
              // Підписи — як на сторінці /unidentified
              status: row.status === 'review' ? 'Обробляється адміністратором' : 'Очікує ідентифікації',
              case_signature: row.case_signature,
              additional_signatures: toSignatureList(row.additional_case_signature),
              archive: row.archive,
              fonds: row.fonds,
              series: row.series,
              record: row.record,
              case_title: row.case_title,
              case_dates: row.case_date,
              inventory_year: row.inventory_year,
              inventory_type: row.inventory_type,
              pages_count: row.pages_count,
              scans_url: row.scans_url,
              notes: row.notes,
            })
          ),
        });
      })
  );
}
