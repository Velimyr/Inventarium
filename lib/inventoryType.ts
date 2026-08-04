// Тип документа, описаного записом: інвентар, люстрація, фасія чи урбар.
//
// Тип майже завжди виводиться з інших полів запису — архіву й фонду, регіону й
// шифру, назви справи. Тому форма підставляє його сама, а якщо користувач обрав
// щось інше — не забороняє, а показує попередження. Правила зібрані тут, щоб
// форма, адмінка й SQL-міграція наявних даних говорили про одне й те саме.

export const INVENTORY_TYPES = ['Інвентар', 'Люстрація', 'Фасія', 'Урбар'] as const;

export type InventoryType = (typeof INVENTORY_TYPES)[number];

/** Тип, який ставимо, коли жодне правило не спрацювало. */
export const DEFAULT_INVENTORY_TYPE: InventoryType = 'Інвентар';

const text = (value: any) => (value === null || value === undefined ? '' : String(value).trim());

// Поля, зміна яких може змінити підказаний тип. Форма стежить саме за ними.
export const INVENTORY_TYPE_SOURCE_FIELDS = [
  'archive',
  'fonds',
  'current_region',
  'case_signature',
  'case_title',
] as const;

// Правило: коли `matches` істинне, запис майже напевно має тип `type`.
// Порядок масиву = пріоритет: перше правило, що спрацювало, визначає підказку.
type InventoryTypeRule = {
  type: InventoryType;
  matches: (record: any) => boolean;
};

const RULES: InventoryTypeRule[] = [
  {
    type: 'Фасія',
    matches: (record) => text(record?.archive) === 'ЦДІАЛ' && text(record?.fonds) === '146',
  },
  {
    type: 'Урбар',
    matches: (record) =>
      text(record?.current_region) === 'Закарпатська область' &&
      text(record?.case_signature).toUpperCase().startsWith('HU'),
  },
  {
    type: 'Люстрація',
    // Стем покриває всі відмінки й похідні: люстрація, люстрації, люстрацій,
    // люстраційний тощо.
    matches: (record) => text(record?.case_title).toLowerCase().includes('люстрац'),
  },
];

/**
 * Тип, який форма підставляє сама: перше правило за пріоритетом
 * (Фасія → Урбар → Люстрація), інакше «Інвентар».
 */
export function suggestInventoryType(record: any): InventoryType {
  const rule = RULES.find((r) => r.matches(record));
  return rule ? rule.type : DEFAULT_INVENTORY_TYPE;
}

/**
 * Чи розходиться обраний тип із даними запису.
 *
 * Перевірка двобічна:
 *   правило спрацювало, а тип інший   → ЦДІАЛ 146, але не фасія;
 *   обрано тип правила, а воно ні     → ЦДІАЛ 134, але фасія.
 *
 * Це підстава лише для попередження: збереження воно не блокує.
 */
export function hasInventoryTypeMismatch(record: any): boolean {
  const chosen = text(record?.inventory_type);
  if (chosen === '') return false;

  return RULES.some((rule) => rule.matches(record) !== (chosen === rule.type));
}
