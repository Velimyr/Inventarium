// Зведення рядків, які відрізняються лише роком складання інвентаря.
//
// Одна архівна справа часто містить кілька інвентарів того самого населеного
// пункту за різні роки. У таблицях /case і /settlement це десяток рядків,
// однакових у кожній видимій колонці, крім року — стіна, у якій не видно
// власне різних записів. Тут вони зводяться в один рядок, а роки показуються
// переліком, де кожен лишається окремим посиланням на свій запис.
//
// На робочій базі таких пар «шифр + населений пункт» 556 (1579 записів).

export type YearRow<T> = {
  key: string;
  /** Записи групи в тому порядку, у якому їх повернув запит. */
  items: T[];
};

/**
 * Ключ рядка з видимих значень.
 *
 * Порівнюються саме ті поля, які таблиця показує: рядки зводяться тільки тоді,
 * коли вони справді відмальовуються однаково. Регістр НЕ нормалізуємо — інакше
 * «Село» і «село» злилися б в один рядок, і зведений рядок показував би не те,
 * що було в частині записів.
 */
export const rowKey = (parts: (string | number | null | undefined)[]) =>
  parts.map((part) => (part === null || part === undefined ? '' : String(part).trim())).join('|');

/** Групує записи за ключем, зберігаючи порядок першої появи. */
export function groupSameExceptYear<T>(records: T[], keyOf: (record: T) => string): YearRow<T>[] {
  const groups = new Map<string, YearRow<T>>();

  for (const record of records) {
    const key = keyOf(record);
    const existing = groups.get(key);
    if (existing) existing.items.push(record);
    else groups.set(key, { key, items: [record] });
  }

  return Array.from(groups.values());
}
