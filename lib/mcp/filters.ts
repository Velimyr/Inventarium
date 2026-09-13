// Фільтри інструментів MCP, які не дають вивантажити реєстр масово.
//
// Дані публічні, тож мета не заборонити копіювання, а зробити його довгим:
// один запит має знаходити небагато, а широкий запит — не гортатися до кінця.
// Кожне правило тут закриває конкретний обхід:
//   • стеля глибини — без неї будь-який широкий фільтр гортається до кінця;
//   • шаблони LIKE — «%%%» чи «___» пройшли б перевірку довжини і збіглися б з усім;
//   • назви адмінподілу — лише однозначні: «район» чи «а» як підрядок збігаються
//     з усіма районами, і разом із вікнами років нарізали б усю базу за сотню викликів;
//   • вузький критерій — самі лише роки, тип чи регіон теж ріжуть базу на шматки.

import type { FlatSettlement } from '../../components/keys/regionData';
import { searchKey } from '../textSearch';
import { loadFlatSettlements } from '../server/publicData';
import { L } from './labels';

/** Скільки результатів одного запиту можна переглянути, гортаючи сторінки. */
export const MAX_REACHABLE_RESULTS = 100;

/** Мінімум значущих символів (літер і цифр) у текстовому критерії. */
export const MIN_MEANINGFUL_CHARS = 3;

/**
 * Діапазон рядків сторінки в межах стелі або null, якщо сторінка за стелею.
 * Сторінки рахуються з 1.
 */
export function reachableRange(page: number, limit: number): { from: number; to: number } | null {
  const from = (page - 1) * limit;
  if (from >= MAX_REACHABLE_RESULTS) return null;
  return { from, to: Math.min(from + limit, MAX_REACHABLE_RESULTS) - 1 };
}

export const beyondDepthMessage = () =>
  `Гортати можна лише перші ${MAX_REACHABLE_RESULTS} результатів запиту. Уточніть його: населений пункт, громада, район, шифр справи чи роки.`;

/** Пагінація з урахуванням стелі: скільки всього знайдено і скільки з цього можна переглянути. */
export function reachablePagination(total: number, page: number, limit: number) {
  const reachable = Math.min(total, MAX_REACHABLE_RESULTS);
  const pages = Math.ceil(reachable / limit);
  return {
    [L.total]: total,
    [L.page]: page,
    [L.pages]: pages,
    ...(page < pages ? { [L.nextPage]: page + 1 } : {}),
    ...(total > MAX_REACHABLE_RESULTS
      ? {
          [L.note]: `Знайдено ${total}, переглянути можна перші ${MAX_REACHABLE_RESULTS}. Уточніть запит, щоб побачити решту.`,
        }
      : {}),
  };
}

// % і _ — шаблони LIKE, а * PostgREST теж перетворює на %. У запиті від агента
// вони не потрібні, а збіг «з усім» дають гарантовано.
const LIKE_WILDCARDS = /[%_*]/g;

/** Текст без шаблонних символів; порожній рядок → undefined. */
export function cleanText(value?: string | null): string | undefined {
  const cleaned = (value ?? '').replace(LIKE_WILDCARDS, '').trim();
  return cleaned === '' ? undefined : cleaned;
}

/** Кількість літер і цифр: пробіли, апострофи й розділові знаки не рахуються. */
export const meaningfulChars = (value?: string | null) => (value ?? '').match(/[\p{L}\p{N}]/gu)?.length ?? 0;

const hasDigit = (value?: string | null) => /\p{N}/u.test(value ?? '');

/**
 * Шифр вузький, лише коли в ньому є номер: «ЦДІАК» збігається з тисячами справ,
 * «ЦДІАК 11-1» — вже з одним фондом і описом.
 */
export const isNarrowSignature = (value?: string | null) =>
  meaningfulChars(value) >= MIN_MEANINGFUL_CHARS && hasDigit(value);

type AdminLevel = 'region' | 'district' | 'community';

const LEVEL_LABELS: Record<AdminLevel, string> = {
  region: 'Регіон',
  district: 'Район',
  community: 'Громада',
};

/**
 * Назва рівня адмінподілу, однозначно впізнана за довідником.
 *
 * Шукаємо входження без урахування регістру й апострофа — агент може передати
 * «Житомирська» замість «Житомирська область». Точний збіг перемагає; кілька
 * різних назв — помилка з підказкою, а не фільтр «з усім».
 */
export async function resolveAdminName(
  level: AdminLevel,
  value: string,
  scope: { country?: string; region?: string; district?: string } = {}
): Promise<{ name: string } | { error: string }> {
  const key = searchKey(value);
  const inScope = (s: FlatSettlement) =>
    (!scope.country || searchKey(s.country).includes(searchKey(scope.country))) &&
    (!scope.region || searchKey(s.region) === searchKey(scope.region)) &&
    (!scope.district || searchKey(s.district) === searchKey(scope.district));

  const names = new Set<string>();
  for (const s of await loadFlatSettlements()) {
    const name = s[level];
    if (name && name !== 'Немає' && inScope(s) && searchKey(name).includes(key)) names.add(name);
  }

  const candidates = Array.from(names);
  const exact = candidates.find((name) => searchKey(name) === key);
  if (exact) return { name: exact };
  if (candidates.length === 1) return { name: candidates[0] };

  const label = LEVEL_LABELS[level];
  if (candidates.length === 0) {
    return { error: `${label} «${value}» не знайдено в довіднику. Перевірте назву або скористайтеся find_settlement.` };
  }
  const shown = candidates.slice(0, 8).map((name) => `«${name}»`).join(', ');
  const more = candidates.length > 8 ? ` та ще ${candidates.length - 8}` : '';
  return { error: `${label} «${value}» неоднозначний: ${shown}${more}. Вкажіть назву точніше.` };
}
