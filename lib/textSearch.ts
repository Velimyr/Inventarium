// Апостроф у пошуку.
//
// У довіднику населених пунктів апостроф скрізь один — «’» (U+2019). Але з
// клавіатури набирають прямий «'», а в старих записах трапляється зворотний «`».
// Через це «Кам'янка» не знаходила «Кам’янку». Тому:
//   • для порівнянь на клієнті зводимо всі варіанти до «’»;
//   • для ilike підставляємо «_» — у LIKE це будь-який один символ, тож запит
//     збігається незалежно від того, який апостроф лежить у самій колонці.

export const APOSTROPHE = '’';

const APOSTROPHES = /['’`ʼ´]/g;

/** Зводить усі варіанти апострофа до «’». Для порівнянь у пам'яті. */
export function normalizeApostrophes(value: string): string {
    return value.replace(APOSTROPHES, APOSTROPHE);
}

/** Готує рядок до підстановки в ilike: апостроф → «_». */
export function apostropheTolerant(value: string): string {
    return value.replace(APOSTROPHES, '_');
}

// Кома, дужки й лапки — синтаксис фільтра or() у PostgREST. Потрапивши в
// значення, вони розривають умову, і запит падає з помилкою замість
// результатів. Їх теж замінюємо на «_»: символ у колонці однаково збігається.
const OR_SYNTAX = /[,()"\\]/g;

/** apostropheTolerant для ilike, вкладеного в or(...). */
export function orIlikeTerm(value: string): string {
    return apostropheTolerant(value).replace(OR_SYNTAX, '_');
}

/** normalizeApostrophes + toLowerCase — для includes() у фільтрах списків. */
export function searchKey(value: string): string {
    return normalizeApostrophes(value).toLowerCase();
}
