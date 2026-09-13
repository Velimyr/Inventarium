import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlatSettlement } from '../../../components/keys/regionData';
import { searchKey } from '../../textSearch';
import { loadFlatSettlements } from '../../server/publicData';
import { settlementUrl } from '../links';
import { rowKey } from '../../yearRows';
import { compact, errorResult, jsonResult, must, placeLabel, run } from '../format';

const SETTLEMENT_TYPES = ['село', 'селище', 'місто', 'містечко'] as const;

type MatchKind = 'exact' | 'prefix' | 'substring';

/**
 * Кандидати за назвою: спершу точний збіг, якщо його немає — початок назви,
 * далі входження. Змішувати рівні не можна: на «Кам’янка» точних збігів
 * десятки, і «Кам’янка-Бузька» серед них лише заважала б.
 */
function matchByName(pool: FlatSettlement[], name: string): { kind: MatchKind; matches: FlatSettlement[] } {
  const key = searchKey(name);
  const exact = pool.filter((s) => searchKey(s.name) === key);
  if (exact.length > 0) return { kind: 'exact', matches: exact };

  const prefix = pool.filter((s) => searchKey(s.name).startsWith(key));
  if (prefix.length > 0 || key.length < 3) return { kind: 'prefix', matches: prefix };

  return { kind: 'substring', matches: pool.filter((s) => searchKey(s.name).includes(key)) };
}

const includesKey = (value: string, filter?: string) => !filter || searchKey(value).includes(searchKey(filter));

// Скільки збігів ранжуємо за кількістю інвентарів. Назви йдуть в URL запиту
// (in.(...)), тож стеля тримає його в межах ліміту довжини. Більше збігів
// буває лише на короткий префікс, і тоді список однаково треба звужувати регіоном.
const MAX_RANKED = 100;

// Той самий збіг шляху, що й у get_settlement_inventories
const pathKey = (p: { name: string; community: string; district: string; region: string }) =>
  rowKey([p.name, p.community, p.district, p.region]);

/** Кількість підтверджених інвентарів для кожного шляху — одним запитом за назвами. */
async function countInventories(supabase: SupabaseClient, settlements: FlatSettlement[]) {
  const names = Array.from(new Set(settlements.map((s) => s.name)));
  const rows = must(
    await supabase
      .from('records')
      .select('current_settlement_name, current_community, current_district, current_region')
      .eq('approved', true)
      .in('current_settlement_name', names)
      .limit(10000)
  );

  const counts = new Map<string, number>();
  for (const row of rows || []) {
    const key = pathKey({
      name: row.current_settlement_name,
      community: row.current_community,
      district: row.current_district,
      region: row.current_region,
    });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function registerSettlementTools(server: McpServer, supabase: SupabaseClient) {
  server.registerTool(
    'find_settlement',
    {
      title: 'Знайти населений пункт',
      description:
        'Пошук населеного пункту в довіднику сучасного адмінподілу (Україна, Польща, Білорусь, Словаччина, ' +
        'Молдова, Московія) за назвою; апостроф і регістр не мають значення. Повертає кандидатів із повним шляхом, ' +
        'кодом, координатами й кількістю інвентарів у реєстрі. Назви часто повторюються — якщо кандидатів кілька, ' +
        'уточніть регіон/район у користувача. Код далі передається в get_settlement_inventories і historical_divisions. ' +
        'Шукає лише сучасні назви; давні — через search_inventories.',
      inputSchema: {
        name: z.string().trim().min(2).describe('Сучасна назва населеного пункту: «Махнівка», «Кам’янка».'),
        country: z.string().trim().optional().describe('Країна для звуження: «Україна», «Польща»…'),
        region: z.string().trim().optional().describe('Частина назви області / воєводства: «Житомирська».'),
        district: z.string().trim().optional().describe('Частина назви району / повіту.'),
        type: z.enum(SETTLEMENT_TYPES).optional(),
        limit: z.number().int().min(1).max(30).default(10),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run(async () => {
        const pool = (await loadFlatSettlements()).filter(
          (s) =>
            includesKey(s.country, args.country) &&
            includesKey(s.region, args.region) &&
            includesKey(s.district, args.district) &&
            (!args.type || s.type === args.type)
        );

        const { kind, matches } = matchByName(pool, args.name);
        if (matches.length === 0) {
          return errorResult(
            `У довіднику немає населеного пункту «${args.name}» з такими умовами. Перевірте написання або спробуйте search_inventories — там шукається й давня назва.`
          );
        }

        // Однойменних пунктів бувають десятки, а про більшість у реєстрі нічого
        // немає. Тому рахуємо інвентарі для всіх збігів і ставимо першими ті,
        // про які щось є (у межах одного рівня — порядок довідника).
        const ranked = matches.slice(0, MAX_RANKED);
        const counts = await countInventories(supabase, ranked);
        const top = ranked
          .map((s) => ({ s, count: counts.get(pathKey(s)) ?? 0 }))
          .sort((a, b) => b.count - a.count)
          .slice(0, args.limit);

        return jsonResult({
          match: kind,
          total_matches: matches.length,
          candidates: top.map(({ s, count }) =>
            compact({
              label: placeLabel(s.type, s.name, s.community, s.district, s.region, s.country),
              name: s.name,
              type: s.type,
              code: s.code,
              country: s.country,
              region: s.region,
              district: s.district,
              community: s.community,
              latitude: s.lat,
              longitude: s.lon,
              inventories_in_registry: count,
              settlement_url: count > 0 ? settlementUrl(s) : null,
            })
          ),
        });
      })
  );
}
