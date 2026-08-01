import { supabase } from './supabaseClient';
import { sameSignatureList } from './caseSignature';

// Поля, що визначають «той самий населений пункт».
// current_country не додаємо: назви областей у довіднику унікальні між країнами,
// тож current_region уже визначає країну, а зайве поле лише ламало б звірку
// зі старими записами, де країна ще NULL.
const SETTLEMENT_FIELDS = [
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
] as const;

// Характеристики справи, що мають збігатися для записів з одним case_signature.
export const CASE_DETAIL_FIELDS = [
  { key: 'case_title', label: 'Назва справи' },
  { key: 'case_date', label: 'Дати справи' },
  { key: 'pages_count', label: 'Кількість сторінок' },
  { key: 'additional_case_signature', label: 'Додатковий шифр справи' },
  { key: 'scans_url', label: 'Посилання на скани' },
] as const;

const text = (v: any) => (v === null || v === undefined ? '' : String(v).trim());

// Чи однакове значення поля у кандидата й наявного запису.
function sameDetail(field: string, a: any, b: any): boolean {
  if (field === 'additional_case_signature') return sameSignatureList(a, b);
  return text(a) === text(b);
}

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

/**
 * Наявні в реєстрі записи ТОГО САМОГО населеного пункту (сучасний адмін поділ)
 * і ТОГО САМОГО року складання інвентаря. Кандидата (за id) виключаємо.
 * Якщо в кандидата не заповнені всі поля населеного пункту — повертаємо [].
 */
export async function findSettlementYearMatches(record: any): Promise<any[]> {
  if (SETTLEMENT_FIELDS.some((f) => text(record[f]) === '')) return [];

  let query = supabase.from('records').select('*').eq('approved', true);
  for (const field of SETTLEMENT_FIELDS) query = query.eq(field, record[field]);

  const yearRaw = text(record.inventory_year);
  const year = yearRaw === '' ? null : parseInt(yearRaw, 10);
  query = year === null || Number.isNaN(year) ? query.is('inventory_year', null) : query.eq('inventory_year', year);

  if (record.id) query = query.neq('id', record.id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * «Цифровий ключ» шифру: відкидаємо літери й усе, крім цифр і роздільників,
 * будь-який набір роздільників зводимо до одного «-». Так «ANK 29/637/0/1.2/1138»
 * і «ANK AS 29/637/0/1.2/1138» дають однаковий ключ «29-637-0-1-2-1138».
 */
export function signatureDigitKey(sig: string | null | undefined): string {
  return text(sig)
    .replace(/[^\d.\/-]/g, '')
    .replace(/[.\/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Наявні в реєстрі записи ТОГО САМОГО населеного пункту, чий шифр має той самий
 * цифровий ключ, але ПОВНИЙ шифр відрізняється (тобто відмінність лише в
 * літерах) — ймовірно та сама справа з різним написанням архівного коду.
 */
export async function findSimilarSignatureMatches(record: any): Promise<any[]> {
  const candKey = signatureDigitKey(record.case_signature);
  if (candKey === '') return [];
  if (SETTLEMENT_FIELDS.some((f) => text(record[f]) === '')) return [];

  let query = supabase.from('records').select('*').eq('approved', true);
  for (const field of SETTLEMENT_FIELDS) query = query.eq(field, record[field]);
  if (record.id) query = query.neq('id', record.id);

  const { data, error } = await query;
  if (error) throw error;

  const candFull = text(record.case_signature);
  return (data || []).filter(
    (r) => signatureDigitKey(r.case_signature) === candKey && text(r.case_signature) !== candFull
  );
}

/**
 * Наявні в реєстрі записи з ТИМ САМИМ case_signature, у яких відрізняється хоча б
 * одна характеристика справи (назва, дати, к-ть сторінок, додатковий шифр,
 * посилання). Повертає записи разом зі списком полів, що розходяться.
 */
export async function findSignatureDetailDiffs(
  record: any
): Promise<{ record: any; diffs: string[] }[]> {
  const sig = text(record.case_signature);
  if (sig === '') return [];

  let query = supabase.from('records').select('*').eq('approved', true).eq('case_signature', sig);
  if (record.id) query = query.neq('id', record.id);

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .map((existing) => ({
      record: existing,
      diffs: CASE_DETAIL_FIELDS.filter((f) => !sameDetail(f.key, record[f.key], existing[f.key])).map(
        (f) => f.key
      ),
    }))
    .filter((x) => x.diffs.length > 0);
}
