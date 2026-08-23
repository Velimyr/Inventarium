// Спільна логіка пропозицій редагування (таблиця records_edit) на боці користувача.
//
// Використовується двома сторінками:
//   /edit/[id]  — створення пропозиції змін до чинного запису,
//   /my_edits   — перегляд і правка власних, ще не підтверджених пропозицій.
//
// Рядок records_edit — це повна копія запису з внесеними змінами (плюс email
// автора, пояснення змін і json_full_data — знімок форми). Збирати його треба
// однаково в обох місцях: інакше правка власної пропозиції клала б у чергу
// інший набір полів, ніж її створення, і адмін бачив би «зміни» там, де автор
// нічого не чіпав.
//
// Підтвердження цих пропозицій адміном — у lib/editApprove.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeSignatureFields,
  resolveIsUkrainianArchive,
  toSignatureList,
} from './caseSignature';
import { computeChanges, type EditChange } from './editApprove';

/**
 * Поля, за якими запис упізнається в реєстрі: два записи з однаковим набором —
 * це дублікат. Ті самі поля перевіряють чернетки (/edit_drafts) і додавання.
 */
export const RECORD_KEY_FIELDS = [
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
  'case_signature',
  'inventory_year',
];

/** Рядок records / records_edit → стан для EditableInventoryForm. */
export function toEditForm(row: any) {
  return {
    ...row,
    // Беремо збережене значення; для старих записів, де колонки ще не було,
    // виводимо його з даних (див. resolveIsUkrainianArchive)
    is_ukrainian_archive: resolveIsUkrainianArchive(row),
    // Записи, збережені до міграції поля в text[], лишилися рядком
    additional_case_signature: toSignatureList(row.additional_case_signature),
  };
}

/** Стан форми → рядок records_edit. */
export function buildEditRow(formLike: any, rowId: string) {
  // json_full_data — знімок самої форми. Якщо лишити його у вхідних даних,
  // кожне наступне збереження вкладало б попередній знімок у новий.
  const { json_full_data: _snapshot, ...form } = formLike;

  // Шифри чистимо від зайвих пробілів: інакше порівняння «що змінилось»
  // на сторінці підтвердження показувало б правку там, де змінився
  // лише пробіл.
  const normalized = normalizeSignatureFields(form);
  const row: any = {};
  for (const key in normalized) {
    const value = normalized[key];
    row[key] = value === '' ? null : value;
  }
  return { ...row, id: rowId, json_full_data: normalized };
}

/**
 * Чи є в реєстрі ІНШИЙ запис із тими самими ключовими полями.
 *
 * Порожні поля в match не потрапляють: у Postgres `null = null` — не істина,
 * тож рядок із незаповненим районом інакше не знайшовся б ніколи.
 */
export async function findRecordDuplicate(
  supabase: SupabaseClient,
  formLike: any,
  excludeId: string
): Promise<{ duplicate: any | null; error: any | null }> {
  const matchQuery: Record<string, any> = {};
  for (const field of RECORD_KEY_FIELDS) {
    let value = formLike[field];
    if (value === '') value = null;
    if (value !== null && value !== undefined) matchQuery[field] = value;
  }

  if (Object.keys(matchQuery).length === 0) return { duplicate: null, error: null };

  const { data, error } = await supabase
    .from('records')
    .select('id')
    .match(matchQuery)
    .neq('id', excludeId)
    .maybeSingle();

  return { duplicate: data ?? null, error };
}

/** Пропозиція редагування разом із чинним записом і переліком змін. */
export type MyEdit = {
  id: string;
  edit: any;
  original: any;
  changes: EditChange[];
};

/** Населений пункт запису одним рядком — для заголовків і списків. */
export function settlementLabel(row: any): string {
  return (
    [
      row?.current_region,
      row?.current_district,
      row?.current_community,
      [row?.current_settlement_type, row?.current_settlement_name].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ') || '—'
  );
}

/**
 * Пропозиції редагування, подані цим користувачем.
 *
 * Автор пропозиції зберігається в records_edit.email: окремої колонки з
 * user_id немає, а created_by в цьому рядку — автор САМОГО запису, скопійований
 * разом з рештою колонок, і до редагування стосунку не має. За тим самим email
 * адмінка знаходить автора, щоб надіслати сповіщення про підтвердження чи
 * відхилення (див. notifyAuthors у lib/editApprove.ts).
 */
export async function fetchMyEdits(
  supabase: SupabaseClient,
  email: string
): Promise<MyEdit[]> {
  const address = (email || '').trim();
  if (!address) return [];

  const { data: edits, error: editError } = await supabase
    .from('records_edit')
    .select('*')
    .eq('email', address);

  if (editError) throw editError;
  if (!edits || edits.length === 0) return [];

  // Чинні записи потрібні, щоб показати «було → стало»: сам рядок records_edit
  // містить повну копію запису, і без оригіналу не видно, що саме змінено.
  const { data: originals, error: originalError } = await supabase
    .from('records')
    .select('*')
    .in(
      'id',
      edits.map((row: any) => row.id)
    );

  if (originalError) throw originalError;

  const originalsById = new Map<string, any>((originals || []).map((row: any) => [row.id, row]));

  return edits
    .map((edit: any) => {
      const original = originalsById.get(edit.id) ?? null;
      return { id: edit.id, edit, original, changes: computeChanges(edit, original) };
    })
    .sort((a: MyEdit, b: MyEdit) =>
      settlementLabel(a.original ?? a.edit).localeCompare(
        settlementLabel(b.original ?? b.edit),
        'uk'
      )
    );
}
