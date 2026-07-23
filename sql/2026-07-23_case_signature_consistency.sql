-- Узгодженість шифру справи в public.records.
--
-- Проблема: у базі є записи, де case_signature описує одну справу, а
-- archive/fonds/series/record — іншу. Причина — форма додавання не чистила
-- приховані архівні поля при перемиканні «Справа в українському архіві?» на
-- «Ні», а сама форма між збереженнями не скидається. Через це шифр іноземного
-- архіву потрапляв у базу разом з координатами попередньо збереженої справи.
--
-- ВАЖЛИВО: виконати ЦЕЙ файл ДО деплою коду. Після зміни коду записи в
-- public.records містять колонку is_ukrainian_archive, і без неї insert впаде
-- з PGRST204.

begin;

-- 1. Прапорець «український архів» більше не виводимо з даних, а зберігаємо.
--    Він уже є в records_unverified і records_edit — губився лише при записі
--    в records.
alter table public.records
  add column if not exists is_ukrainian_archive text;

alter table public.records
  drop constraint if exists records_is_ukrainian_archive_values;

alter table public.records
  add constraint records_is_ukrainian_archive_values
  check (is_ukrainian_archive is null or is_ukrainian_archive in ('Так', 'Ні'));

-- 2. Backfill. «Так» ставимо тільки там, де шифр справді зібраний зі складових.
--    Записам з іноземним шифром і заповненими архівними полями ставимо «Ні»:
--    достовірна частина в них — саме шифр, а архівні поля — сміття від
--    попередньо збереженого запису.
--    Очікуваний результат на 2026-07-23: 8489 × 'Так', 6619 × 'Ні'.
update public.records
set is_ukrainian_archive = case
    when btrim(coalesce(archive, '')) <> ''
     and btrim(coalesce(fonds,   '')) <> ''
     and btrim(coalesce(series,  '')) <> ''
     and btrim(coalesce(record,  '')) <> ''
     and btrim(coalesce(case_signature, '')) =
         btrim(archive) || ' ' || btrim(fonds) || '-' || btrim(series) || '-' || btrim(record)
    then 'Так'
    else 'Ні'
  end
where is_ukrainian_archive is null;

-- 3. Якщо всі чотири складові заповнені — шифр мусить із них складатися.
--    NOT VALID: наявні рядки не перевіряємо разово, але кожен новий insert і
--    кожен update перевіряються.
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

-- 4. Іноземний архів — українських координат бути не повинно.
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
-- Що залишиться після міграції
--
-- 67 записів порушують обмеження з п.4 (59 із усіма чотирма архівними полями
-- і 8 із частково заповненими). Вони лишаються в базі, але будь-який update по
-- них тепер впаде, доки архівні поля не приберуть. Це навмисно: полагодити їх
-- можна тільки вручну, звіривши з архівом, чиї насправді ці координати.
--
-- Список для розбору:
--
--   select id, case_signature, archive, fonds, series, record, case_title,
--          current_settlement_name, created_at
--   from public.records
--   where is_ukrainian_archive = 'Ні'
--     and (btrim(coalesce(archive,'')) <> '' or btrim(coalesce(fonds,'')) <> ''
--       or btrim(coalesce(series,'')) <> '' or btrim(coalesce(record,'')) <> '')
--   order by created_by, created_at;
--
-- Типове виправлення (архівні поля належать іншій справі — прибрати):
--
--   update public.records
--   set archive = null, fonds = null, series = null, record = null
--   where id = '...';
--
-- Після того, як список спорожніє:
--
--   alter table public.records validate constraint records_signature_matches_parts;
--   alter table public.records validate constraint records_foreign_archive_has_no_parts;
