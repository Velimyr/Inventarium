// Єдине місце, де живе логіка шифру справи.
//
// Шифр справи описують п'ять полів, які насправді є однією сутністю:
//   is_ukrainian_archive — «Так» → шифр складається з архів/фонд/опис/справа,
//                          «Ні»  → шифр вводиться вручну (іноземний архів),
//   archive, fonds, series, record — складові українського шифру,
//   case_signature — сам шифр.
//
// Записувати їх нарізно не можна: саме так у базі з'явилися записи з іноземним
// шифром і чужими українськими координатами (шифр від однієї справи, архівні
// поля — від попередньо збереженої).

export const ARCHIVE_PART_FIELDS = ['archive', 'fonds', 'series', 'record'] as const;

// Усі поля, що описують шифр. Пишуться в базу тільки разом.
export const SIGNATURE_FIELDS = [
  'is_ukrainian_archive',
  ...ARCHIVE_PART_FIELDS,
  'case_signature',
] as const;

export const isArchivePartField = (field: string) =>
  (ARCHIVE_PART_FIELDS as readonly string[]).includes(field);

export const isSignatureField = (field: string) =>
  (SIGNATURE_FIELDS as readonly string[]).includes(field);

const text = (value: any) => (value === null || value === undefined ? '' : String(value).trim());

// ---------------------------------------------------------------------------
// Додаткові сигнатури — та сама справа в інших архівах.
//
// У базі це text[]: справа може лежати одночасно в кількох архівах, і одним
// рядком їх не описати. Записи, додані до міграції, лишалися рядком, тому
// toSignatureList приймає і рядок теж — розбиваючи його за тими самими
// роздільниками, що й міграція (крапка з комою та перенос рядка). Кома
// роздільником НЕ вважається: вона зустрічається всередині самих сигнатур.
// ---------------------------------------------------------------------------

const SIGNATURE_LIST_SEPARATORS = /[;\r\n]+/;

/** Значення поля (масив, рядок, null) → масив непорожніх сигнатур. */
export function toSignatureList(value: any): string[] {
  if (value === null || value === undefined) return [];
  const parts = Array.isArray(value) ? value : String(value).split(SIGNATURE_LIST_SEPARATORS);
  return parts.map(text).filter((item) => item !== '');
}

/** Те, що пишемо в базу: масив або null, якщо не заповнено жодної сигнатури. */
export function fromSignatureList(value: any): string[] | null {
  const list = toSignatureList(value);
  return list.length > 0 ? list : null;
}

/** Список сигнатур одним рядком — для таблиць і карток. */
export function formatSignatureList(value: any, separator = ', '): string {
  return toSignatureList(value).join(separator);
}

/** Чи однакові два значення поля. Для масивів `!==` завжди істинний. */
export function sameSignatureList(a: any, b: any): boolean {
  const left = toSignatureList(a);
  const right = toSignatureList(b);
  return left.length === right.length && left.every((item, i) => item === right[i]);
}

/** Чи заповнені всі чотири складові українського шифру. */
export function hasAllArchiveParts(record: any): boolean {
  return ARCHIVE_PART_FIELDS.every((field) => text(record?.[field]) !== '');
}

/** Чи заповнена хоч одна складова українського шифру. */
export function hasAnyArchivePart(record: any): boolean {
  return ARCHIVE_PART_FIELDS.some((field) => text(record?.[field]) !== '');
}

/** Шифр, зібраний зі складових. Порожній рядок, якщо заповнені не всі. */
export function buildCaseSignature(record: any): string {
  if (!hasAllArchiveParts(record)) return '';
  return `${text(record.archive)} ${text(record.fonds)}-${text(record.series)}-${text(record.record)}`;
}

/** Чи узгоджений шифр зі складовими (для записів з усіма чотирма полями). */
export function signatureMatchesParts(record: any): boolean {
  if (!hasAllArchiveParts(record)) return true;
  return text(record?.case_signature) === buildCaseSignature(record);
}

// ---------------------------------------------------------------------------
// Формат шифру справи.
//
// Регекси й пороги виведені з аналізу 15 186 наявних шифрів робочої бази.
//   SANITY   — базова перевірка (проходить 99.85% наявних значень): є хоча б
//              одна літера і одна цифра, лише дозволені символи, довжина 3–90.
//              Відкидає реальне сміття: зворотний слеш, «?», рядки без цифр,
//              завеликий текст. Застосовується до case_signature (іноземний,
//              вводиться руками) і до КОЖНОЇ додаткової сигнатури.
//   UA       — строга маска українського дефісного шифру «АРХІВ Ф-О-С».
//              Автоскладені шифри (buildCaseSignature) проходять її завжди;
//              це асерт-гарантія для нових українських записів.
// ---------------------------------------------------------------------------

export const CASE_SIGNATURE_SANITY =
  /^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N} .,:;()\/\-–‑—'’ʼ«»"№]{3,90}$/u;

export const CASE_SIGNATURE_UA =
  /^[\p{L}][\p{L}.'’ʼ]*(?: [\p{L}.'’ʼ]+)*\s[\p{L}\p{N}]+(?:\s?\([\p{L}\p{N}]+\))?(?:-[\p{L}\p{N}()]+(?:\/[\p{L}\p{N}]+)?){2,}$/u;

// Єдиний текст-підказка: і у формі (тултіп), і в повідомленнях про помилку.
export const SIGNATURE_HINT =
  'Приклади: «ЦДІАК 1-2-3» (український архів) або «AGAD ASK 1/7/0/9/4» (іноземний). ' +
  'Потрібні щонайменше одна літера й одна цифра; без символів \\ та ?, без лапок і надто довгого тексту.';

/**
 * Формат ОДНОГО шифру (case_signature або елемент additional_case_signature).
 * Повертає текст помилки або null. Порожній рядок вважається валідним —
 * обов'язковість перевіряється окремо.
 */
export function validateSignatureValue(value: string, label: string): string | null {
  const sig = text(value);
  if (sig === '') return null;
  if (!CASE_SIGNATURE_SANITY.test(sig)) {
    return `${label} «${sig}» має недопустимий формат. ${SIGNATURE_HINT}`;
  }
  return null;
}

/**
 * Формат усіх шифрів запису: case_signature + кожна непорожня additional-сигнатура.
 * Не перевіряє узгодженість зі складовими — лише формат (для точкових місць,
 * як-от підтвердження редагування адміном, де перевіряються саме змінені поля).
 */
export function validateSignatureFormats(record: any): string | null {
  const caseErr = validateSignatureValue(text(record?.case_signature), 'Шифр справи');
  if (caseErr) return caseErr;

  for (const extra of toSignatureList(record?.additional_case_signature)) {
    const extraErr = validateSignatureValue(extra, 'Додаткова сигнатура');
    if (extraErr) return extraErr;
  }
  return null;
}

/**
 * Перевіряє, що шифр і його складові несуперечливі.
 * Повертає текст помилки для тоста або null, якщо все гаразд.
 *
 * Викликати перед КОЖНИМ записом у records / records_unverified / records_edit.
 */
export function validateCaseSignature(record: any): string | null {
  const isUkrainian = text(record?.is_ukrainian_archive) === 'Так';

  if (isUkrainian) {
    if (!hasAllArchiveParts(record)) {
      return 'Для справи в українському архіві потрібно заповнити архів, фонд, опис і справу.';
    }
    if (!signatureMatchesParts(record)) {
      return `Шифр справи не збігається з архівом/фондом/описом/справою. Очікується "${buildCaseSignature(record)}".`;
    }
    // Асерт формату автоскладеного шифру. UA перевіряє структуру АРХІВ Ф-О-С,
    // але дозволяє літери в частинах (для «КМФ-15» тощо), тож додаємо SANITY —
    // він вимагає хоча б одну цифру й відсікає складові без номерів («ц-ц-ц»).
    const built = buildCaseSignature(record);
    if (!CASE_SIGNATURE_UA.test(built) || !CASE_SIGNATURE_SANITY.test(built)) {
      return `Складений шифр «${built}» виглядає незвично — перевірте архів/фонд/опис/справу. ${SIGNATURE_HINT}`;
    }
  } else {
    // Іноземний архів: шифр вводиться вручну, українських координат бути не повинно.
    if (text(record?.case_signature) === '') {
      return 'Поле "Шифр справи" обов\'язкове.';
    }
    if (hasAnyArchivePart(record)) {
      return 'Для справи в іноземному архіві поля архів/фонд/опис/справа мають бути порожні. Якщо ця ж справа є і в українському архіві, вкажіть її в полі "Сигнатура додаткової справи".';
    }
    const caseErr = validateSignatureValue(text(record?.case_signature), 'Шифр справи');
    if (caseErr) return caseErr;
  }

  // Додаткові сигнатури — будь-якого архіву, тож лише базова перевірка формату.
  for (const extra of toSignatureList(record?.additional_case_signature)) {
    const extraErr = validateSignatureValue(extra, 'Додаткова сигнатура');
    if (extraErr) return extraErr;
  }
  return null;
}

/**
 * Прапорець «український архів» для вже збереженого запису.
 *
 * Для записів, доданих до появи колонки is_ukrainian_archive, значення
 * доводиться виводити з даних. Робимо це обережно: «Так» тільки тоді, коли
 * шифр справді зібраний зі складових — інакше форма вважає українським
 * запис з іноземним шифром і перезаписує його при першому ж редагуванні.
 */
export function resolveIsUkrainianArchive(record: any): 'Так' | 'Ні' {
  const stored = text(record?.is_ukrainian_archive);
  if (stored === 'Так' || stored === 'Ні') return stored;
  return hasAllArchiveParts(record) && signatureMatchesParts(record) ? 'Так' : 'Ні';
}
