-- Узгодженість шифру справи в public.records.
--
-- Проблема: у базі є записи, де case_signature описує одну справу, а
-- archive/fonds/series/record — іншу. Причина — форма додавання не чистила
-- приховані архівні поля при перемиканні «Справа в українському архіві?» на
-- «Ні», а сама форма між збереженнями не скидається. Через це шифр іноземного
-- архіву потрапляв у базу разом з координатами попередньо збереженої справи.
--
-- Виконати ДО деплою коду: після зміни коду записи в public.records містять
-- колонку is_ukrainian_archive, і без неї insert впаде з PGRST204.
--
-- Наявні рядки не чіпаємо. Прапорець у них лишається NULL, і код виводить його
-- з даних (resolveIsUkrainianArchive) — рівно за тією ж формулою, за якою його
-- проставив би бекфіл. Реальне значення запишеться при першому ж збереженні
-- запису.

begin;

-- 1. Прапорець «український архів» зберігаємо, а не виводимо з даних.
--    Він уже є в records_unverified і records_edit — губився лише при записі
--    в records.
alter table public.records
  add column if not exists is_ukrainian_archive text;

alter table public.records
  drop constraint if exists records_is_ukrainian_archive_values;

alter table public.records
  add constraint records_is_ukrainian_archive_values
  check (is_ukrainian_archive is null or is_ukrainian_archive in ('Так', 'Ні'));

-- 2. Якщо всі чотири складові заповнені — шифр основної справи мусить із них
--    складатися. Складові описують саме основну справу; та сама справа в
--    іншому архіві йде в additional_case_signature окремим рядком.
--
--    NOT VALID: наявні 59 неузгоджених рядків не перевіряємо разово, але кожен
--    новий insert і кожен update перевіряються.
alter table public.records
  drop constraint if exists records_signature_matches_parts;

alter table public.records
  add constraint records_signature_matches_parts check (
    btrim(coalesce(archive, '')) = ''
    or btrim(coalesce(fonds,  '')) = ''
    or btrim(coalesce(series, '')) = ''
    or btrim(coalesce(record, '')) = ''
    or btrim(coalesce(case_signature, '')) =
       btrim(archive) || ' ' || btrim(fonds) || '-' || btrim(series) || '-' || btrim(record)
  ) not valid;

-- 3. Іноземний архів — українських координат бути не повинно.
--    Для старих рядків прапорець NULL, тож обмеження на них мовчить; воно
--    працює для всього, що пише новий код.
alter table public.records
  drop constraint if exists records_foreign_archive_has_no_parts;

alter table public.records
  add constraint records_foreign_archive_has_no_parts check (
    is_ukrainian_archive is distinct from 'Ні'
    or (btrim(coalesce(archive, '')) = ''
        and btrim(coalesce(fonds,  '')) = ''
        and btrim(coalesce(series, '')) = ''
        and btrim(coalesce(record, '')) = '')
  ) not valid;

commit;

-- ---------------------------------------------------------------------------
-- Неузгоджені записи, які лишаються в базі: 59 на 2026-07-23.
--
-- Обмеження з п.2 блокує по них будь-який update — навіть не пов'язаний із
-- шифром (позначення дубля, cobook_link) — доки їх не полагодять.
--
-- 26 з них заповнені навпаки: у case_signature іноземний шифр, а український
-- (той, що складається зі складових) лежить в additional_case_signature.
--
-- Решта 33 однорідними не є:
--
--   ~7  ДАКО 11-1- 162 … 11-1- 168 — зайвий пробіл у шифрі, складові правильні.
--   ~3  'ЦДІАК КМФ 15-3-332' — те саме, що й у 26, але з пробілом замість дефіса.
--   ~4  record містить піддіапазон ('126/1-2', '9-11'), якого немає в шифрі.
--   ~10 APP/AZSK, ZNO, AGAD — слід бага форми: складові належать іншій справі.
--    ~9 розбіжності в номері (321 vs 322, фонд 1251 vs 181) — потрібна звірка
--       з архівом.
--
-- Список:
--
--   select id, case_signature, additional_case_signature,
--          archive, fonds, series, record, case_title,
--          current_settlement_name, inventory_year, created_by, created_at
--   from public.records
--   where btrim(coalesce(archive,'')) <> '' and btrim(coalesce(fonds,'')) <> ''
--     and btrim(coalesce(series,'')) <> '' and btrim(coalesce(record,'')) <> ''
--     and btrim(coalesce(case_signature,'')) <>
--         btrim(archive) || ' ' || btrim(fonds) || '-' || btrim(series) || '-' || btrim(record)
--   order by created_by, created_at;
--
-- Коли список спорожніє:
--
--   alter table public.records validate constraint records_signature_matches_parts;
--   alter table public.records validate constraint records_foreign_archive_has_no_parts;
