import { supabase } from './supabaseClient';

// Поля, що визначають «той самий населений пункт».
const SETTLEMENT_FIELDS = [
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
] as const;

type SettlementKey = {
  [K in (typeof SETTLEMENT_FIELDS)[number]]?: string | null;
};

/**
 * Шукає в реєстрі (records) запис ТОГО САМОГО населеного пункту, у якого шифр
 * `signature` присутній серед додаткових шифрів справи (масив
 * additional_case_signature). Тобто та сама справа вже додана для цього
 * населеного пункту, але як додатковий шифр іншого запису.
 *
 * Населений пункт відрізняється — не дубль (повертаємо null).
 * Повертає знайдений запис (id + його основний шифр) або null.
 */
export async function findRecordWithAdditionalSignature(
  signature: string | null | undefined,
  settlement: SettlementKey
): Promise<{ id: string; case_signature: string | null } | null> {
  const sig = (signature ?? '').trim();
  if (sig === '') return null;

  let query = supabase
    .from('records')
    .select('id, case_signature')
    .contains('additional_case_signature', [sig]);

  // Той самий населений пункт. NULL порівнюємо через .is(), бо PostgREST-фільтр
  // eq.null не знаходить справді NULL-рядки (як у findDuplicateVerifiedRecord).
  for (const field of SETTLEMENT_FIELDS) {
    const raw = settlement[field];
    const value = raw === '' || raw === undefined ? null : raw;
    query = value === null ? query.is(field, null) : query.eq(field, value);
  }

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}
