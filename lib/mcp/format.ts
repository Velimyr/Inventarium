// Рядки бази → відповіді інструментів MCP.
//
// Агент читає відповідь як текст, тож кожне порожнє поле — зайві токени й
// привід «домислити» значення. Порожнє (null, '', [], «Немає») викидаємо, а
// кожен запис супроводжуємо посиланням на сторінку сайту.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatAdminPath, isNamedLevel } from '../../components/keys/regionData';
import { toSignatureList } from '../caseSignature';
import { caseUrl, cobookProjectUrl, recordUrl, settlementUrl } from './links';

const isEmpty = (value: any) =>
  value === null ||
  value === undefined ||
  value === '' ||
  value === 'Немає' ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

/** Глибока копія без порожніх значень (див. коментар угорі). */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(compact).filter((item) => !isEmpty(item)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      const cleaned = compact(item);
      if (!isEmpty(cleaned)) out[key] = cleaned;
    }
    return out as T;
  }
  return value;
}

/** «село Махнівка» — тип і назва без заглушок. */
export const placeName = (type?: string | null, name?: string | null) =>
  [type, name].filter(isNamedLevel).join(' ');

/** «село Махнівка, Махнівська громада, Бердичівський район, Житомирська область». */
export const placeLabel = (
  type: string | null | undefined,
  name: string | null | undefined,
  ...adminPath: (string | null | undefined)[]
) => [placeName(type, name), formatAdminPath(...adminPath)].filter(Boolean).join(', ');

export const currentPlaceLabel = (row: any) =>
  placeLabel(
    row.current_settlement_type,
    row.current_settlement_name,
    row.current_community,
    row.current_district,
    row.current_region,
    row.current_country
  );

export const historicalPlaceLabel = (row: any) =>
  placeLabel(row.old_settlement_type, row.old_settlement_name, row.old_community, row.old_district, row.old_province);

export const currentSettlementUrl = (row: any) =>
  settlementUrl({
    country: row.current_country,
    region: row.current_region,
    district: row.current_district,
    community: row.current_community,
    name: row.current_settlement_name,
  });

/** mark_type у формі: 1 — «Місце», 0 — «Регіон». */
export function markType(value: any): 'місце' | 'регіон' | null {
  if (value === 0 || value === '0') return 'регіон';
  if (value === 1 || value === '1') return 'місце';
  return null;
}

const REGION_MARK_NOTE =
  'Запис прив’язано до околиць населеного пункту: у справі можуть бути інвентарі й сусідніх населених пунктів.';

/** Рядок списку: лише те, за чим обирають запис. */
export function formatRecordSummary(row: any) {
  return compact({
    id: row.id,
    url: recordUrl(row.id),
    settlement: currentPlaceLabel(row),
    settlement_historical: historicalPlaceLabel(row),
    inventory_year: row.inventory_year,
    inventory_type: row.inventory_type,
    case_signature: row.case_signature,
    case_title: row.case_title,
    has_scans: Boolean(row.scans_url),
    mark_type: markType(row.mark_type),
  });
}

/** Поля рівня справи — однакові для всіх інвентарів одного шифру. */
export function formatCaseFields(row: any) {
  return compact({
    case_signature: row.case_signature,
    case_url: row.case_signature ? caseUrl(row.case_signature) : null,
    additional_signatures: toSignatureList(row.additional_case_signature),
    is_ukrainian_archive: row.is_ukrainian_archive,
    archive: row.archive,
    fonds: row.fonds,
    series: row.series,
    record: row.record,
    case_title: row.case_title,
    case_dates: row.case_date,
    pages_count: row.pages_count,
    scans_url: row.scans_url,
  });
}

/** Повна картка запису (як на сторінці /record/[id]). */
export function formatRecord(row: any) {
  const mark = markType(row.mark_type);
  return compact({
    id: row.id,
    url: recordUrl(row.id),
    removed_as_duplicate: row.approved === false ? true : null,
    inventory_year: row.inventory_year,
    inventory_type: row.inventory_type,
    inventory_start_page: row.inventory_start_page,
    mark_type: mark,
    mark_type_note: mark === 'регіон' ? REGION_MARK_NOTE : null,
    settlement: {
      label: currentPlaceLabel(row),
      country: row.current_country,
      region: row.current_region,
      district: row.current_district,
      community: row.current_community,
      type: row.current_settlement_type,
      name: row.current_settlement_name,
      url: currentSettlementUrl(row),
    },
    settlement_historical: {
      label: historicalPlaceLabel(row),
      province: row.old_province,
      district: row.old_district,
      community: row.old_community,
      type: row.old_settlement_type,
      name: row.old_settlement_name,
    },
    coordinates:
      row.latitude !== null && row.longitude !== null ? { latitude: row.latitude, longitude: row.longitude } : null,
    case: formatCaseFields(row),
    notes: row.notes,
    cobook: {
      project_url: row.cobook_link ? cobookProjectUrl(row.cobook_link) : null,
      transcript_url: row.cobook_transcript,
    },
  });
}

// --- Відповіді інструментів -------------------------------------------------

// id у базі — uuid; невалідний рядок PostgREST відхиляє помилкою 22P02, яку
// агент побачив би як «сервер недоступний». Перевіряємо ще у схемі входу.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const jsonResult = (data: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});

export const errorResult = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

/** Результат Supabase-запиту або виняток (його перехопить run). */
export function must<T>({ data, error }: { data: T; error: any }): T {
  if (error) throw error;
  return data;
}

/**
 * PGRST103: сторінка за межами знайденого (offset більший за кількість). Для
 * агента це не збій, а неправильний номер сторінки — кажемо так і не видаємо
 * «знайдено 0», бо загальної кількості PostgREST у цій відповіді не повертає.
 */
export const isPastLastPage = (error: any) => error?.code === 'PGRST103';

export const pastLastPageResult = (page: number) =>
  errorResult(`На сторінці ${page} результатів немає — їх менше. Почніть з page: 1.`);

/**
 * Обгортка обробника: будь-який виняток стає помилкою інструмента, а не
 * обірваним запитом. Подробиці — лише в серверний лог, агентові вони ні до чого.
 */
export async function run(handler: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await handler();
  } catch (err) {
    console.error('[mcp] Помилка інструмента:', err);
    return errorResult('Не вдалося отримати дані з реєстру Інвентаріум. Спробуйте ще раз пізніше.');
  }
}
