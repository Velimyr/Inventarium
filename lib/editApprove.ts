// Спільна логіка підтвердження редагувань (таблиця records_edit).
//
// Використовується двома сторінками адмінки:
//   /admin_editapprove      — поштучно, одне редагування за раз,
//   /admin_editapprove_mass — масово, згрупованими пачками.
//
// Тримати це в одному місці критично: правила запису шифру справи
// (див. caseSignature.ts) мусять бути однакові на обох сторінках, інакше
// масове підтвердження почне писати в базу не те, що поштучне.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageType } from './messageUtils';
import {
  SIGNATURE_FIELDS,
  buildCaseSignature,
  fromSignatureList,
  hasAllArchiveParts,
  isSignatureField,
  normalizeSignature,
  resolveIsUkrainianArchive,
  validateCaseSignature,
  validateSignatureFormats,
} from './caseSignature';
import { SERVICE_FIELDS, sameFieldValue } from './recordFields';

// Словник полів спільний із чергою нових справ — див. lib/recordFields.ts
export {
  ADDITIONAL_SIGNATURE_FIELD,
  UKRAINIAN_ARCHIVE_FIELD,
  FIELD_LABELS,
  displayValue,
  fieldLabel,
} from './recordFields';
import { ADDITIONAL_SIGNATURE_FIELD, fieldLabel } from './recordFields';

// Поля шифру підтверджуються одним чекбоксом: підтвердити, скажімо, фонд
// окремо від case_signature означає лишити запис із шифром від однієї
// справи і координатами від іншої.
export const SIGNATURE_BLOCK_KEY = '__signature_block';

// Службові поля records_edit — не показуємо і не переносимо в records.
export const EXCLUDED_FIELDS = SERVICE_FIELDS;

/**
 * Чи змінилося поле — заперечення рівності значень (див. sameFieldValue).
 * Виділене ім'я лишається, бо в контексті редагувань читається точніше.
 */
export const fieldChanged = (field: string, edited: any, original: any) =>
  !sameFieldValue(field, edited, original);

export type EditChange = {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
};

/** Поля, які редагування справді змінює відносно чинного запису. */
export function computeChanges(edit: any, original: any): EditChange[] {
  if (!edit) return [];
  return Object.keys(edit)
    .filter((field) => !EXCLUDED_FIELDS.includes(field))
    .filter((field) => fieldChanged(field, edit[field], original?.[field]))
    .map((field) => ({
      field,
      label: fieldLabel(field),
      oldValue: original?.[field] ?? null,
      newValue: edit[field],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}

/**
 * Дані для upsert у records — з тих полів редагування, які адмін підтвердив.
 *
 * `isConfirmed(field)` відповідає на питання «це поле підтверджене?»;
 * для блоку шифру перевіряється ключ SIGNATURE_BLOCK_KEY.
 * Повертає помилку валідації замість даних, якщо шифр вийшов би суперечливим.
 */
export function buildEditUpdate(
  edit: any,
  original: any,
  isConfirmed: (field: string) => boolean
): { updateData: Record<string, any> | null; error: string | null } {
  const value = (field: string) => {
    if (field === ADDITIONAL_SIGNATURE_FIELD) return fromSignatureList(edit[field]);
    return edit[field] === '' ? null : edit[field];
  };

  const updateData: Record<string, any> = { id: edit.id };

  for (const field of Object.keys(edit)) {
    // поля шифру обробляємо нижче, одним блоком
    if (field === SIGNATURE_BLOCK_KEY || isSignatureField(field)) continue;
    if (EXCLUDED_FIELDS.includes(field)) continue;
    if (isConfirmed(field)) updateData[field] = value(field);
  }

  // Блок шифру: або всі п'ять полів разом, або жодного
  const signatureChanged = SIGNATURE_FIELDS.some((field) => edit[field] !== original?.[field]);
  if (signatureChanged && isConfirmed(SIGNATURE_BLOCK_KEY)) {
    for (const field of SIGNATURE_FIELDS) updateData[field] = value(field);
    updateData.is_ukrainian_archive = resolveIsUkrainianArchive(edit);

    // Шифр збираємо зі складових, а не довіряємо тому, що прийшло у формі
    if (updateData.is_ukrainian_archive === 'Так' && hasAllArchiveParts(updateData)) {
      updateData.case_signature = buildCaseSignature(updateData);
    }

    // Шифр іноземного архіву вводять руками, тож у ньому трапляються зайві
    // пробіли. Згортаємо їх до валідації, щоб перевірка працювала з тим самим
    // значенням, що ляже в базу.
    updateData.case_signature = normalizeSignature(updateData.case_signature) || null;

    const signatureError = validateCaseSignature(updateData);
    if (signatureError) return { updateData: null, error: signatureError };
  }

  if (Object.keys(updateData).length <= 1) {
    return { updateData: null, error: 'Оберіть хоча б одне поле для підтвердження' };
  }

  // Формат шифру/додаткових сигнатур серед підтверджених полів. Блок шифру
  // вже пройшов validateCaseSignature вище; тут ловимо випадок, коли
  // змінилась лише additional_case_signature (вона не в SIGNATURE_FIELDS).
  const formatError = validateSignatureFormats(updateData);
  if (formatError) return { updateData: null, error: formatError };

  return { updateData, error: null };
}

// ---------------------------------------------------------------------------
// Групування редагувань для масової сторінки.
//
// Ідея: показати спільну частину пачки один раз, а нижче — тільки те, чим
// записи різняться. Спільним буває або шифр справи (одна справа описує
// десятки сіл), або населений пункт (одне село згадане в десятках справ).
// ---------------------------------------------------------------------------

export type EditItem = {
  id: string;
  edit: any;
  original: any;
  changes: EditChange[];
};

export type EditGroupTone = 'ready' | 'warn' | 'manual';
export type EditGroupBasis = 'signature' | 'settlement' | 'change' | 'none';

export type EditGroup = {
  id: string;
  tone: EditGroupTone;
  basis: EditGroupBasis;
  /** Спільне значення — шифр або назва населеного пункту. */
  keyText: string;
  keySub: string;
  /** Правки, наявні в УСІХ записах групи. Показуються один раз. */
  shared: EditChange[];
  /** Чи має бодай один запис власні правки понад спільні. */
  hasExtras: boolean;
  /** Чим записи різняться: населеним пунктом чи шифром. */
  variantBy: 'place' | 'signature';
  items: EditItem[];
};

/**
 * Спільна підмножина правок — перетин наборів змін усіх записів групи.
 *
 * Ключ перетину — пара (поле, нове значення), а не сама лише назва поля.
 * Інакше «Сторінка поч. інвентаря», яку всі записи справді змінюють, але
 * кожен на своє число, потрапила б у спільний блок — і картка стверджувала б,
 * що всі села починаються на одній сторінці. Різні значення того самого поля
 * — це варіативна частина за визначенням.
 */
export function commonChanges(items: EditItem[]): EditChange[] {
  const first = items[0];
  if (!first || items.length < 2) return [];

  const sameChange = (a: EditChange, b: EditChange) =>
    a.field === b.field && !fieldChanged(a.field, a.newValue, b.newValue);

  return first.changes.filter((change) =>
    items.every((item) => item.changes.some((other) => sameChange(other, change)))
  );
}

export const settlementName = (record: any) =>
  [record?.current_settlement_type, record?.current_settlement_name].filter(Boolean).join(' ').trim();

export const settlementPath = (record: any) =>
  [record?.current_region, record?.current_district, record?.current_community].filter(Boolean).join(' · ');

/** Відбиток змін: однаковий у записів, які міняють ті самі поля на ті самі значення. */
const changesKey = (item: EditItem) =>
  JSON.stringify(item.changes.map((change) => [change.field, change.newValue]));

const placeKey = (item: EditItem) =>
  `${settlementName(item.original)}|${settlementPath(item.original)}`;

export function groupEdits(items: EditItem[]): EditGroup[] {
  const groups: EditGroup[] = [];
  let rest = items;

  const bucket = (list: EditItem[], keyOf: (item: EditItem) => string) => {
    const map = new Map<string, EditItem[]>();
    for (const item of list) {
      const key = keyOf(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  };

  // Спільний блок і колір рахуються однаково для будь-якої групи, незалежно
  // від того, що її зібрало — однакова правка, шифр чи населений пункт.
  const describe = (list: EditItem[], head: Pick<EditGroup, 'basis' | 'keyText' | 'keySub'>): EditGroup => {
    const shared = commonChanges(list);
    const hasExtras = list.some((item) => item.changes.length > shared.length);
    const noChanges = list.every((item) => item.changes.length === 0);

    return {
      ...head,
      id: `group-${groups.length}`,
      tone: noChanges ? 'warn' : hasExtras ? 'manual' : 'ready',
      shared,
      hasExtras,
      // спільне — шифр, отже варіативне — населений пункт, і навпаки
      variantBy: head.basis === 'signature' ? 'place' : 'signature',
      items: list,
    };
  };

  const take = (
    keyOf: (item: EditItem) => string,
    head: (list: EditItem[]) => Pick<EditGroup, 'basis' | 'keyText' | 'keySub'>
  ) => {
    const used = new Set<string>();
    for (const list of Array.from(bucket(rest, keyOf).values())) {
      if (list.length < 2) continue;
      groups.push(describe(list, head(list)));
      for (const item of list) used.add(item.id);
    }
    rest = rest.filter((item) => !used.has(item.id));
  };

  // 1. Повний збіг правок. Забираємо такі пачки першими: якщо частина записів
  //    справи змінена один в один, це найцінніший сигнал — його не можна
  //    розчинити у більшій групі, де перетин зіб'ють поодинокі відхилення.
  take(changesKey, (list) => {
    const first = list[0];
    const samePlace = list.every((item) => placeKey(item) === placeKey(first));
    const sameSignature = list.every(
      (item) => item.original?.case_signature === first.original?.case_signature
    );

    if (first.changes.length === 0) {
      return {
        basis: samePlace ? 'settlement' : 'none',
        keyText: samePlace ? settlementName(first.original) : 'Редагування без змін',
        keySub: samePlace ? settlementPath(first.original) : 'Жодне поле не відрізняється від чинного запису',
      };
    }

    return {
      basis: sameSignature ? 'signature' : 'change',
      keyText: sameSignature ? first.original?.case_signature || '—' : 'Однакова правка в різних справах',
      keySub: sameSignature ? first.original?.case_title || '' : '',
    };
  });

  // 2. Спільний шифр справи. Правки можуть частково різнитися — те, що збіглося,
  //    покаже спільний блок, решта лишиться хвостами в таблиці.
  take((item) => item.original?.case_signature || '—', (list) => ({
    basis: 'signature',
    keyText: list[0].original?.case_signature || '—',
    keySub: list[0].original?.case_title || '',
  }));

  // 3. Спільний населений пункт.
  take(placeKey, (list) => ({
    basis: 'settlement',
    keyText: settlementName(list[0].original),
    keySub: settlementPath(list[0].original),
  }));

  // 4. Решта — без спільної частини, тільки поштучно.
  if (rest.length > 0) {
    // Спільного блоку тут не рахуємо: ці записи не пов'язані нічим, і перетин
    // між ними був би випадковим збігом, а не спільною правкою автора.
    groups.push({
      id: `group-${groups.length}`,
      tone: 'manual',
      basis: 'none',
      keyText: 'Поодинокі редагування',
      keySub: 'Спільної частини немає — розглядаються по одному',
      shared: [],
      hasExtras: rest.some((item) => item.changes.length > 0),
      variantBy: 'signature',
      items: rest,
    });
  }

  return groups.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Власні правки запису — ті, що не входять у спільний блок групи.
 *
 * Порівнюємо за полем І значенням: одне й те саме поле може бути частково
 * спільним (усі виправили шифр однаково) і водночас мати власне значення
 * в конкретному записі — тоді воно має лишитися хвостом.
 */
export function extraChanges(group: EditGroup, item: EditItem): EditChange[] {
  if (group.shared.length === 0) return item.changes;
  return item.changes.filter(
    (change) =>
      !group.shared.some(
        (s) => s.field === change.field && !fieldChanged(change.field, s.newValue, change.newValue)
      )
  );
}

// ---------------------------------------------------------------------------
// Запис у базу
// ---------------------------------------------------------------------------

export type Notifier = (params: {
  toUserId: string;
  messageType: MessageType;
  messageText: string;
}) => Promise<unknown>;

export type BulkResult = {
  applied: string[];
  failed: { id: string; place: string; message: string }[];
};

/** user_id авторів редагувань за їхніми email. */
async function profilesByEmail(supabase: SupabaseClient, emails: string[]) {
  const unique = Array.from(new Set(emails.filter(Boolean)));
  if (unique.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email')
    .in('email', unique);

  if (error) {
    console.error('Не вдалося знайти профілі редакторів:', error);
    return new Map<string, string>();
  }

  return new Map<string, string>((data || []).map((row: any) => [row.email, row.user_id]));
}

/**
 * Одне повідомлення на автора, а не на кожен запис: пачка з 26 редагувань
 * інакше перетворюється на 26 сповіщень і 26 пінгів у Telegram.
 */
async function notifyAuthors(
  supabase: SupabaseClient,
  items: EditItem[],
  notify: Notifier | undefined,
  build: (count: number, places: string[]) => string,
  messageType: MessageType
) {
  if (!notify || items.length === 0) return;

  const profiles = await profilesByEmail(supabase, items.map((item) => item.edit.email));
  const byAuthor = new Map<string, EditItem[]>();
  for (const item of items) {
    const email = item.edit.email;
    if (!byAuthor.has(email)) byAuthor.set(email, []);
    byAuthor.get(email)!.push(item);
  }

  for (const [email, authorItems] of Array.from(byAuthor.entries())) {
    const toUserId = profiles.get(email);
    if (!toUserId) continue;

    const places = authorItems.map((item) => settlementName(item.original)).filter(Boolean);
    await notify({ toUserId, messageType, messageText: build(authorItems.length, places) });
  }
}

const placesLine = (places: string[]) => {
  const shown = places.slice(0, 5).join(', ');
  const hidden = places.length - 5;
  return hidden > 0 ? `${shown} та ще ${hidden}` : shown;
};

/**
 * Підтверджує пачку редагувань: переносить підтверджені поля в records,
 * прибирає рядки з records_edit і сповіщає авторів.
 *
 * Записи обробляються по одному — так помилка валідації шифру в одному
 * редагуванні не блокує решту пачки.
 */
export async function approveEdits(
  supabase: SupabaseClient,
  items: EditItem[],
  options: { notify?: Notifier; isConfirmed?: (item: EditItem, field: string) => boolean } = {}
): Promise<BulkResult> {
  // За замовчуванням переносимо ТІЛЬКИ змінені поля. Поштучна сторінка показує
  // адміну кожне поле окремо, тож там можна писати весь рядок; у масовому
  // режимі ніхто не дивиться на незмінені значення, і записувати їх назад —
  // зайвий ризик затерти те, чого автор не чіпав.
  const isConfirmed =
    options.isConfirmed ||
    ((item: EditItem, field: string) =>
      field === SIGNATURE_BLOCK_KEY
        ? item.changes.some((change) => isSignatureField(change.field))
        : item.changes.some((change) => change.field === field));
  const result: BulkResult = { applied: [], failed: [] };
  const applied: EditItem[] = [];

  for (const item of items) {
    const place = settlementName(item.original) || item.id;

    if (item.changes.length === 0) {
      result.failed.push({ id: item.id, place, message: 'немає змін для підтвердження' });
      continue;
    }

    const { updateData, error } = buildEditUpdate(item.edit, item.original, (field) =>
      isConfirmed(item, field)
    );
    if (error || !updateData) {
      result.failed.push({ id: item.id, place, message: error || 'не вдалося зібрати дані' });
      continue;
    }

    const { error: updateError } = await supabase
      .from('records')
      .upsert([updateData], { onConflict: 'id' });

    if (updateError) {
      console.error(updateError);
      result.failed.push({ id: item.id, place, message: 'помилка оновлення запису' });
      continue;
    }

    const { error: deleteError } = await supabase.from('records_edit').delete().eq('id', item.id);
    if (deleteError) {
      console.error(deleteError);
      result.failed.push({ id: item.id, place, message: 'запис оновлено, але зміни лишились у черзі' });
      continue;
    }

    result.applied.push(item.id);
    applied.push(item);
  }

  await notifyAuthors(
    supabase,
    applied,
    options.notify,
    (count, places) =>
      count === 1
        ? `Ваше редагування інвентарю успішно підтверджено адміністратором.\n\nНаселений пункт: ${places[0] || '—'}`
        : `Підтверджено ваших редагувань: ${count}.\n\nНаселені пункти: ${placesLine(places)}`,
    'edit_approve'
  );

  return result;
}

/** Відхиляє пачку редагувань: прибирає з черги і сповіщає авторів із причиною. */
export async function rejectEdits(
  supabase: SupabaseClient,
  items: EditItem[],
  options: { notify?: Notifier; reason?: string } = {}
): Promise<BulkResult> {
  const result: BulkResult = { applied: [], failed: [] };
  const rejected: EditItem[] = [];

  for (const item of items) {
    const { error } = await supabase.from('records_edit').delete().eq('id', item.id);
    if (error) {
      console.error(error);
      result.failed.push({
        id: item.id,
        place: settlementName(item.original) || item.id,
        message: 'помилка видалення з черги',
      });
      continue;
    }
    result.applied.push(item.id);
    rejected.push(item);
  }

  const reason = (options.reason || '').trim();
  await notifyAuthors(
    supabase,
    rejected,
    options.notify,
    (count, places) => {
      const head =
        count === 1
          ? `Ваше редагування інвентарю відхилено адміністратором.\n\nНаселений пункт: ${places[0] || '—'}`
          : `Відхилено ваших редагувань: ${count}.\n\nНаселені пункти: ${placesLine(places)}`;
      return reason ? `${head}\n\nПричина:\n${reason}` : head;
    },
    'edit_reject'
  );

  return result;
}
