// Підписи полів у відповідях MCP.
//
// Агент переказує відповідь людині й часто бере назви полів як є, тож ключі
// відповідей — українською, а не назвами колонок бази. Термінологія — зі
// спільного словника lib/recordFields.ts («Шифр справи», а не «сигнатура»),
// але повними словами: абревіатури на кшталт «К-ть сторінок» придатні для
// заголовків таблиць адмінки, а не для відповіді дослідникові.
//
// Усі ключі живуть тут, щоб різні інструменти не назвали одне поле по-різному.
// Параметри на вході (query, region, code…) лишаються латиницею: цього
// вимагає протокол, а людина їх не бачить.

export const L = {
  id: 'id',
  url: 'Посилання',
  warning: 'Увага',
  message: 'Повідомлення',
  note: 'Примітка',

  // Пагінація
  total: 'Знайдено',
  page: 'Сторінка',
  pages: 'Сторінок',
  nextPage: 'Наступна сторінка',
  results: 'Результати',

  // Документ
  inventoryYear: 'Рік складання інвентаря',
  inventoryType: 'Тип документа',
  inventoryStartPage: 'Сторінка початку інвентаря',
  markType: 'Тип позначки',
  inventories: 'Інвентарі',
  inventoriesCount: 'Кількість інвентарів',
  notes: 'Примітки',

  // Справа
  caseGroup: 'Архівна справа',
  caseSignature: 'Шифр справи',
  caseUrl: 'Посилання на справу',
  additionalSignatures: 'Додаткові шифри справи',
  mainCaseSignature: 'Основний шифр справи',
  ukrainianArchive: 'Справа в українському архіві',
  archive: 'Архів',
  fonds: 'Фонд',
  series: 'Опис',
  record: 'Справа',
  caseTitle: 'Назва справи',
  caseDates: 'Дати справи',
  pagesCount: 'Кількість сторінок у справі',
  scans: 'Скани',
  scansUrl: 'Посилання на скани',
  cases: 'Справи',
  similarSignatures: 'Схожі шифри',
  listedAsAdditional: 'Вказано як додатковий шифр у записах',

  // Населений пункт
  settlement: 'Населений пункт',
  settlementCurrent: 'Населений пункт (сучасний)',
  settlementHistorical: 'Населений пункт (на час складання)',
  settlementUrl: 'Посилання на населений пункт',
  settlements: 'Населені пункти',
  settlementCode: 'Код населеного пункту',
  settlementType: 'Тип населеного пункту',
  name: 'Назва',
  country: 'Країна',
  region: 'Регіон',
  district: 'Район',
  community: 'Громада',
  province: 'Воєводство (губернія)',
  oldDistrict: 'Повіт',
  oldCommunity: 'Ключ (староство)',
  coordinates: 'Координати',
  latitude: 'Широта',
  longitude: 'Довгота',
  inventoriesInRegistry: 'Інвентарів у реєстрі',
  match: 'Збіг',
  candidates: 'Кандидати',
  appliedAdminFilters: 'Застосовані фільтри адмінподілу',
  siteSearchUrl: 'Пошук на сайті',

  // CoBook
  cobook: 'CoBook',
  cobookProject: 'Проєкт транскрибування',
  cobookTranscript: 'Транскрипція',

  // Історичний адмінподіл (підписи — як у картці історичної карти)
  point: 'Точка',
  periods: 'Періоди',
  year: 'Рік',
  state: 'Держава',
  higherDivision: 'Вища одиниця адмінподілу',
  division: 'Одиниця адмінподілу',
  nameOriginal: 'Оригінальна назва',
  nameLatin: 'Назва латиною',
  center: 'Центр',
  existed: 'Роки існування',
  description: 'Додатково',

  // Ключі
  keys: 'Ключі',
  keyName: 'Назва ключа',
  source: 'Джерело',
  keyDescription: 'Опис',
  settlementsCount: 'Населених пунктів',
  matchedSettlements: 'Збіглися населені пункти',

  // Неідентифіковані справи
  status: 'Статус',

  // Архіви
  archives: 'Архіви',
  shortName: 'Скорочена назва',
  fullName: 'Повна назва',
  nativeName: 'Назва мовою оригіналу',
  site: 'Сайт',
} as const;
