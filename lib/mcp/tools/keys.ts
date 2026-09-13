import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KeyPoint } from '../../../components/keys/geometry';
import { searchKey } from '../../textSearch';
import { PUBLIC_KEY_COLUMNS } from '../publicColumns';
import { keyUrl, settlementUrl } from '../links';
import { compact, errorResult, jsonResult, must, placeLabel, run, UUID_PATTERN } from '../format';
import { meaningfulChars, MIN_MEANINGFUL_CHARS } from '../filters';

const MAX_KEY_RESULTS = 20;

// Частина ключів подана до перекодування довідника: у їхніх точках немає
// країни, а назви рівнів без слова-типу («Вінницька»). Підпис терпить обидва.
const pointLabel = (p: Partial<KeyPoint>) =>
  placeLabel(p.type, p.name, p.community, p.district, p.region, p.country);

const pointItem = (p: Partial<KeyPoint>) =>
  compact({
    label: pointLabel(p),
    code: p.code,
    settlement_url: settlementUrl(p),
  });

const keyPoints = (key: any): Partial<KeyPoint>[] => [key.center, ...(key.points || [])].filter(Boolean);

export function registerKeyTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'search_keys',
    {
      title: 'Пошук ключів',
      description:
        'Ключі — історичні комплекси маєтків (кілька населених пунктів під одним центром), нанесені волонтерами на карту ' +
        'з джерелом. Пошук підтверджених ключів за назвою/описом/джерелом або за населеним пунктом, що до ключа входить ' +
        `(code з find_settlement чи назва). Потрібен хоча б один критерій; повертає до ${MAX_KEY_RESULTS} ключів.`,
      inputSchema: {
        query: z.string().trim().optional().describe('Частина назви, опису чи джерела ключа: «Махнівський».'),
        settlement_code: z.string().trim().optional().describe('Код населеного пункту з find_settlement.'),
        settlement_name: z.string().trim().optional().describe('Сучасна назва населеного пункту, якщо коду немає.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const query = args.query ? searchKey(args.query) : null;
        const name = args.settlement_name ? searchKey(args.settlement_name) : null;

        // Без критерію інструмент віддав би всі ключі разом (див. lib/mcp/filters.ts)
        if (query && meaningfulChars(query) < MIN_MEANINGFUL_CHARS) {
          return errorResult(`Запит має містити щонайменше ${MIN_MEANINGFUL_CHARS} літери чи цифри.`);
        }
        if (!query && !name && !args.settlement_code) {
          return errorResult('Вкажіть query, settlement_code або settlement_name.');
        }

        // Ключів сотні, а фільтр іде по jsonb-масиву точок — простіше в пам'яті
        const keys = must(await supabase.from('map_keys').select(PUBLIC_KEY_COLUMNS).eq('status', 'approved').order('name')) || [];

        const results = keys
          .map((key: any) => {
            const points = keyPoints(key);
            const matchedPoints = points.filter(
              (p) =>
                (args.settlement_code && p.code === args.settlement_code) ||
                (name && p.name && searchKey(p.name) === name)
            );
            const textMatch =
              !query || [key.name, key.description, key.source].some((v) => v && searchKey(v).includes(query));
            const placeFilter = Boolean(args.settlement_code || name);
            if (!textMatch || (placeFilter && matchedPoints.length === 0)) return null;

            return compact({
              id: key.id,
              url: keyUrl(key.id),
              name: key.name,
              source: key.source,
              center: key.center ? pointLabel(key.center) : null,
              settlements_count: points.length,
              matched_settlements: matchedPoints.map(pointLabel),
            });
          })
          .filter(Boolean);

        return jsonResult({
          total: results.length,
          keys: results.slice(0, MAX_KEY_RESULTS),
          ...(results.length > MAX_KEY_RESULTS
            ? { note: `Показано перші ${MAX_KEY_RESULTS} із ${results.length}. Уточніть запит.` }
            : {}),
        });
      })
  );

  server.registerTool(
    'get_key',
    {
      title: 'Картка ключа',
      description: 'Підтверджений ключ за id: назва, джерело, опис, центр і перелік населених пунктів з кодами й посиланнями.',
      inputSchema: {
        id: z.string().trim().regex(UUID_PATTERN, 'id має бути UUID').describe('id ключа з search_keys.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) =>
      run(async () => {
        const key: any = must(
          await supabase.from('map_keys').select(PUBLIC_KEY_COLUMNS).eq('status', 'approved').eq('id', id).maybeSingle()
        );
        if (!key) return errorResult(`Підтвердженого ключа з id ${id} немає.`);

        return jsonResult(
          compact({
            id: key.id,
            url: keyUrl(key.id),
            name: key.name,
            source: key.source,
            description: key.description,
            center: key.center ? pointItem(key.center) : null,
            settlements: (key.points || []).map(pointItem),
          })
        );
      })
  );
}
