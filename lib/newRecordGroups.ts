// Групування нових справ (таблиця records_unverified) за спільною частиною.
//
// Та сама ідея, що й у черзі редагувань, але спільним тут є не набір правок,
// а набір ЗНАЧЕНЬ: нові записи ні з чим не порівнюються, вони просто описують
// одну архівну справу для десятків сіл. Тож спільна частина групи — це поля,
// однакові в усіх її записах (шифр, назва справи, дати, скани, к-ть сторінок),
// а варіативна — ті, що зобов'язані різнитися (село, координати, сторінка
// початку інвентаря).
//
// Показувати опис справи один раз замість 44 разів — увесь сенс подання.

import {
  SERVICE_FIELDS,
  byCaseFieldOrder,
  fieldLabel,
  isBlank,
  sameFieldValue,
} from './recordFields';

export type SharedField = {
  field: string;
  label: string;
  value: any;
};

export type NewRecordGroupBasis = 'signature' | 'settlement' | 'none';

export type NewRecordGroup = {
  id: string;
  basis: NewRecordGroupBasis;
  /** Спільне значення — шифр або назва населеного пункту. */
  keyText: string;
  keySub: string;
  /** Поля, однакові в усіх записах групи. Показуються один раз. */
  shared: SharedField[];
  /** Поля, що різняться між записами. Стають колонками таблиці. */
  variantFields: string[];
  /** Чим записи різняться передусім: населеним пунктом чи шифром. */
  variantBy: 'place' | 'signature';
  items: any[];
};

export const settlementName = (record: any) =>
  [record?.current_settlement_type, record?.current_settlement_name].filter(Boolean).join(' ').trim();

export const settlementPath = (record: any) =>
  [record?.current_region, record?.current_district, record?.current_community].filter(Boolean).join(' · ');

const dataFields = (records: any[]) => {
  const fields = new Set<string>();
  for (const record of records) {
    for (const field of Object.keys(record)) {
      if (!SERVICE_FIELDS.includes(field)) fields.add(field);
    }
  }
  return Array.from(fields);
};

/**
 * Розкладає поля групи на спільні й варіативні.
 *
 * Поле, порожнє в усіх записах, не потрапляє нікуди: показувати «Примітки — »
 * двадцять разів немає сенсу, а варіативним воно не є.
 */
export function splitFields(records: any[]): { shared: SharedField[]; variantFields: string[] } {
  const shared: SharedField[] = [];
  const variantFields: string[] = [];

  for (const field of dataFields(records)) {
    const first = records[0]?.[field];
    const same = records.every((record) => sameFieldValue(field, record[field], first));

    if (!same) {
      variantFields.push(field);
      continue;
    }
    if (isBlank(first)) continue;

    shared.push({ field, label: fieldLabel(field), value: first });
  }

  shared.sort((a, b) => byCaseFieldOrder(a.field, b.field));
  variantFields.sort(byCaseFieldOrder);

  return { shared, variantFields };
}

const placeKey = (record: any) => `${settlementName(record)}|${settlementPath(record)}`;

export function groupNewRecords(records: any[]): NewRecordGroup[] {
  const groups: NewRecordGroup[] = [];
  let rest = records;

  const describe = (
    list: any[],
    head: Pick<NewRecordGroup, 'basis' | 'keyText' | 'keySub'>
  ): NewRecordGroup => ({
    ...head,
    ...splitFields(list),
    id: `group-${groups.length}`,
    // спільне — шифр, отже варіативне — населений пункт, і навпаки
    variantBy: head.basis === 'signature' ? 'place' : 'signature',
    items: list,
  });

  const take = (
    keyOf: (record: any) => string,
    head: (list: any[]) => Pick<NewRecordGroup, 'basis' | 'keyText' | 'keySub'>
  ) => {
    const buckets = new Map<string, any[]>();
    for (const record of rest) {
      const key = keyOf(record);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(record);
    }

    const used = new Set<string>();
    for (const list of Array.from(buckets.values())) {
      if (list.length < 2) continue;
      groups.push(describe(list, head(list)));
      for (const record of list) used.add(record.id);
    }
    rest = rest.filter((record) => !used.has(record.id));
  };

  // 1. Одна справа на багато сіл — найчастіший спосіб масового додавання.
  take((record) => record.case_signature || '—', (list) => ({
    basis: 'signature',
    keyText: list[0].case_signature || '—',
    keySub: list[0].case_title || '',
  }));

  // 2. Одне село в кількох справах.
  take(placeKey, (list) => ({
    basis: 'settlement',
    keyText: settlementName(list[0]),
    keySub: settlementPath(list[0]),
  }));

  // 3. Решта — без спільної частини.
  if (rest.length > 0) {
    groups.push({
      id: `group-${groups.length}`,
      basis: 'none',
      keyText: 'Поодинокі записи',
      keySub: 'Спільної частини немає — розглядаються по одному',
      shared: [],
      variantFields: dataFields(rest).sort(byCaseFieldOrder),
      variantBy: 'signature',
      items: rest,
    });
  }

  return groups.sort((a, b) => b.items.length - a.items.length);
}
