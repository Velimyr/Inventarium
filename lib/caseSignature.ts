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
    return null;
  }

  // Іноземний архів: шифр вводиться вручну, українських координат бути не повинно.
  if (text(record?.case_signature) === '') {
    return 'Поле "Шифр справи" обов\'язкове.';
  }
  if (hasAnyArchivePart(record)) {
    return 'Для справи в іноземному архіві поля архів/фонд/опис/справа мають бути порожні. Якщо ця ж справа є і в українському архіві, вкажіть її в полі "Сигнатура додаткової справи".';
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
