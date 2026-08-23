// Спільний словник полів інвентаря: підписи, показ значень і порівняння.
//
// Використовується і чергою редагувань (lib/editApprove.ts), і чергою нових
// справ (lib/newRecordGroups.ts). Тримати підписи в одному місці треба тому,
// що обидві черги показують ті самі колонки таблиці records, і розбіжність у
// назві поля між двома сторінками адмінки читається як помилка даних.

import { formatSignatureList, sameSignatureList } from './caseSignature';

export const ADDITIONAL_SIGNATURE_FIELD = 'additional_case_signature';
export const UKRAINIAN_ARCHIVE_FIELD = 'is_ukrainian_archive';

/** Службові колонки — не показуємо і не переносимо між таблицями. */
export const SERVICE_FIELDS = [
  'id', 'approved', 'email', 'created_by', 'created_at',
  'comment', 'json_full_data', 'cobook_link',
];

export const FIELD_LABELS: Record<string, string> = {
  old_province: 'Воєводство (Губернія)',
  old_district: 'Повіт (Район)',
  old_community: 'Ключ (Староство)',
  old_settlement_type: 'Тип н.п. (давній)',
  old_settlement_name: 'Назва н.п. (давня)',
  current_country: 'Країна',
  current_region: 'Сучасна область',
  current_district: 'Сучасний район',
  current_community: 'Сучасна громада',
  current_settlement_type: 'Тип н.п. (сучасний)',
  current_settlement_name: 'Назва н.п. (сучасна)',
  latitude: 'Широта',
  longitude: 'Довгота',
  mark_type: 'Тип позначки',
  is_ukrainian_archive: 'Справа в українському архіві',
  case_signature: 'Шифр справи',
  archive: 'Архів',
  fonds: 'Фонд',
  series: 'Опис',
  record: 'Справа',
  additional_case_signature: 'Шифри дод. справ',
  case_date: 'Дати справи',
  inventory_year: 'Рік складання інвентаря',
  inventory_type: 'Тип документа',
  pages_count: 'К-ть сторінок',
  inventory_start_page: 'Сторінка поч. інвентаря',
  scans_url: 'Посилання на скани',
  case_title: 'Назва справи',
  notes: 'Примітки',
};

export const fieldLabel = (field: string) => FIELD_LABELS[field] || field;

/**
 * Порядок показу полів справи.
 *
 * Спершу те, що ідентифікує саму справу (шифр, назва, дати, скани), далі
 * географія. У картці групи вгорі стоїть саме опис справи, тож починати
 * зі старого воєводства, як у порядку колонок таблиці, було б дивно.
 */
export const CASE_FIELD_ORDER = [
  'case_signature',
  'additional_case_signature',
  'is_ukrainian_archive',
  'archive',
  'fonds',
  'series',
  'record',
  'case_title',
  'case_date',
  'inventory_year',
  'inventory_type',
  'pages_count',
  'inventory_start_page',
  'scans_url',
  'old_province',
  'old_district',
  'old_community',
  'old_settlement_type',
  'old_settlement_name',
  'current_country',
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
  'latitude',
  'longitude',
  'mark_type',
  'notes',
];

export const byCaseFieldOrder = (a: string, b: string) => {
  const ia = CASE_FIELD_ORDER.indexOf(a);
  const ib = CASE_FIELD_ORDER.indexOf(b);
  return (ia === -1 ? CASE_FIELD_ORDER.length : ia) - (ib === -1 ? CASE_FIELD_ORDER.length : ib);
};

/** Значення поля для показу. Дод. сигнатури — масив, і його треба зібрати в рядок:
 *  React вивів би елементи масиву впритул один до одного. */
export const displayValue = (field: string, value: any) => {
  if (field === ADDITIONAL_SIGNATURE_FIELD) return formatSignatureList(value) || '—';
  return value === null || value === undefined || value === '' ? '—' : String(value);
};

export const isBlank = (value: any) => value === null || value === undefined || value === '';

/**
 * Порожній прапорець «український архів» означає «Ні».
 *
 * Колонки колись не було, тож у старих записах лишився null. Без цього
 * правила будь-яка пропозиція до такого запису показувала б зміну «— → Ні»,
 * якої автор не робив: форма завжди надсилає прапорець заповненим.
 */
const ukrainianArchiveValue = (value: any) => (isBlank(value) ? 'Ні' : String(value).trim());

/**
 * Чи однакові два значення одного поля.
 *
 * Просте `===` тут не працює:
 *   - дод. сигнатура — масив, у якого `===` завжди хибний, тож порівнюємо вміст;
 *   - порожній прапорець «український архів» дорівнює «Ні» (див. вище);
 *   - порожнє поле приходить то як null, то як '' (залежно від форми й колонки);
 *   - числові колонки (широта, рік) повертаються числом, а з форми приходять
 *     рядком, тож «50.1194691» і 50.1194691 — те саме значення.
 */
export function sameFieldValue(field: string, a: any, b: any): boolean {
  if (field === ADDITIONAL_SIGNATURE_FIELD) return sameSignatureList(a, b);
  if (field === UKRAINIAN_ARCHIVE_FIELD) {
    return ukrainianArchiveValue(a) === ukrainianArchiveValue(b);
  }
  if (isBlank(a) && isBlank(b)) return true;
  if (isBlank(a) || isBlank(b)) return false;
  return String(a).trim() === String(b).trim();
}
