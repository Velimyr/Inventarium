// Пошук у реєстрі: текстовий запит + фільтри адмінподілу, років, шифру й типу.
//
// Один запит на двох споживачів: сторінку /search і MCP-сервер
// (lib/mcp/tools/search.ts). Якщо правила розійдуться, агент знаходитиме не те,
// що бачить людина на сайті за тим самим запитом.

import type { SupabaseClient } from '@supabase/supabase-js';
import { apostropheTolerant, orIlikeTerm } from './textSearch';

/** Мінімальна довжина текстового запиту — коротший б'є по всій таблиці. */
export const MIN_SEARCH_LENGTH = 3;

export type RecordSearchFilters = {
  search?: string | null;
  inventory_year_from?: string | number | null;
  inventory_year_to?: string | number | null;
  case_signature?: string | null;
  current_country?: string | null;
  current_region?: string | null;
  current_district?: string | null;
  current_community?: string | null;
  inventory_type?: string | null;
};

/** Поля, у яких шукає текстовий запит. */
export const SEARCH_TEXT_FIELDS = [
  'old_settlement_name',
  'current_settlement_name',
  'case_title',
  'notes',
  'case_signature',
] as const;

/**
 * Запит до підтверджених записів із фільтрами, сортуванням за роком (новіші
 * першими) і діапазоном рядків. Кількість рахується точно (`count: 'exact'`).
 *
 * Фільтри адмінподілу — входження, толерантне до апострофа: назва в записі
 * («Кам’янець-Подільський») може бути набрана іншим апострофом, ніж у запиті.
 */
export function buildRecordSearchQuery(
  supabase: SupabaseClient,
  filters: RecordSearchFilters,
  { columns, from, to }: { columns: string; from: number; to: number }
) {
  let query = supabase
    .from('records')
    .select(columns, { count: 'exact' })
    .eq('approved', true);

  const adminFields = ['current_country', 'current_region', 'current_district', 'current_community'] as const;
  for (const field of adminFields) {
    if (filters[field]) {
      query = query.ilike(field, `%${apostropheTolerant(filters[field])}%`);
    }
  }

  if (filters.inventory_year_from) {
    query = query.gte('inventory_year', Number(filters.inventory_year_from));
  }
  if (filters.inventory_year_to) {
    query = query.lte('inventory_year', Number(filters.inventory_year_to));
  }

  if (filters.case_signature) {
    query = query.ilike('case_signature', `%${filters.case_signature}%`);
  }

  if (filters.inventory_type) {
    query = query.eq('inventory_type', filters.inventory_type);
  }

  if (filters.search) {
    const term = orIlikeTerm(filters.search);
    query = query.or(SEARCH_TEXT_FIELDS.map((field) => `${field}.ilike.%${term}%`).join(','));
  }

  return query.order('inventory_year', { ascending: false }).range(from, to);
}
