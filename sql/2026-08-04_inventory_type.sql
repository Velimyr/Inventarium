-- Тип документа, описаного записом: інвентар / люстрація / фасія / урбар.
--
-- Досі всі записи реєстру трактувалися як «інвентар», хоча серед них є й
-- люстрації, і фасії, і урбарі. Розрізнити їх можна тільки вручну, читаючи
-- назву справи й архівний шифр.
--
-- Тип майже завжди виводиться з інших полів запису — саме ці правила й
-- застосовує бекфіл нижче. Ті самі правила живуть у lib/inventoryType.ts, за
-- ними форма підставляє тип новим записам. Змінюєте одне — змінюйте й друге.
--
-- Виконати ДО деплою коду: після зміни коду форми пишуть inventory_type, і без
-- колонки insert упаде з PGRST204.

begin;

-- ---------------------------------------------------------------------------
-- 1. Колонка + дозволені значення на всіх п'яти таблицях, якими ходить запис:
--    records_unverified → records, правки через records_edit, неідентифіковані
--    інвентарі — records_notidentify → records_notidentify_points.
--
--    text + CHECK, а не enum: так само зроблено для is_ukrainian_archive
--    (2026-07-23_case_signature_consistency.sql), і додати значення потім
--    можна одним alter constraint.
--
--    DEFAULT 'Інвентар' — це п.3 вимог («за замовчуванням інвентар») і водночас
--    бекфіл наявних рядків: у PG 11+ ADD COLUMN ... DEFAULT проставляє значення
--    всім наявним рядкам через attmissingval, без перезапису таблиці й без
--    перевірки інших обмежень. Це важливо — див. коментар у п.2.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'records',
    'records_unverified',
    'records_edit',
    'records_notidentify',
    'records_notidentify_points'
  ] loop
    execute format(
      'alter table public.%I add column if not exists inventory_type text default ''Інвентар''',
      t
    );
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_inventory_type_values'
    );
    execute format(
      'alter table public.%I add constraint %I check (
         inventory_type is null
         or inventory_type in (''Інвентар'', ''Люстрація'', ''Фасія'', ''Урбар'')
       )',
      t, t || '_inventory_type_values'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Правила типізації — рівно ті самі, що в suggestInventoryType().
--    Порядок гілок case = пріоритет: Фасія → Урбар → Люстрація → Інвентар.
--
--    'люстрац' як стем: покриває люстрація/люстрації/люстрацій/люстраційний.
-- ---------------------------------------------------------------------------
create or replace function public.inv_suggest_type(
  p_archive   text,
  p_fonds     text,
  p_region    text,
  p_signature text,
  p_title     text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when btrim(coalesce(p_archive, '')) = 'ЦДІАЛ'
     and btrim(coalesce(p_fonds,   '')) = '146'                      then 'Фасія'
    when btrim(coalesce(p_region,  '')) = 'Закарпатська область'
     and upper(btrim(coalesce(p_signature, ''))) like 'HU%'          then 'Урбар'
    when lower(coalesce(p_title, '')) like '%люстрац%'               then 'Люстрація'
    else 'Інвентар'
  end;
$$;

-- records.
--
-- IS DISTINCT FROM: чіпаємо лише ті рядки, яким правило дає НЕ 'Інвентар' —
-- решта вже отримали своє значення з DEFAULT у п.1. Це не оптимізація, а
-- необхідність: 2026-07-23_case_signature_consistency.sql додав обмеження
-- records_signature_matches_parts і records_foreign_archive_has_no_parts як
-- NOT VALID. Наявні неузгоджені рядки (59 на 2026-07-23) вони пропустили, але
-- блокують по таких рядках БУДЬ-ЯКИЙ update — навіть цей.
--
-- Другий фільтр (not exists ... where <порушення>) прибирає й ті неузгоджені
-- рядки, яким правило все ж дало б Фасію/Урбар/Люстрацію: update по них упав
-- би і зупинив усю міграцію. Вони лишаються з 'Інвентар' — список у кінці файлу.
update public.records r
set inventory_type = public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title)
where r.inventory_type is distinct from public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title)
  -- рядок узгоджений зі своїми складовими
  and (
    btrim(coalesce(r.archive, '')) = ''
    or btrim(coalesce(r.fonds,  '')) = ''
    or btrim(coalesce(r.series, '')) = ''
    or btrim(coalesce(r.record, '')) = ''
    or btrim(coalesce(r.case_signature, '')) =
       btrim(r.archive) || ' ' || btrim(r.fonds) || '-' || btrim(r.series) || '-' || btrim(r.record)
  )
  -- іноземний архів не тягне за собою українських складових
  and (
    r.is_ukrainian_archive is distinct from 'Ні'
    or (btrim(coalesce(r.archive, '')) = '' and btrim(coalesce(r.fonds,  '')) = ''
        and btrim(coalesce(r.series, '')) = '' and btrim(coalesce(r.record, '')) = '')
  );

-- records_unverified і records_edit: NOT VALID-обмежень немає, фільтр-виняток
-- не потрібен.
update public.records_unverified r
set inventory_type = public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title)
where r.inventory_type is distinct from public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title);

update public.records_edit r
set inventory_type = public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title)
where r.inventory_type is distinct from public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title);

-- records_notidentify: населений пункт ще не визначений, тож правило «Урбар»
-- (Закарпатська область + шифр з HU) до нього не застосовне — передаємо null.
update public.records_notidentify r
set inventory_type = public.inv_suggest_type(
      r.archive, r.fonds, null, r.case_signature, r.case_title)
where r.inventory_type is distinct from public.inv_suggest_type(
      r.archive, r.fonds, null, r.case_signature, r.case_title);

-- records_notidentify_points: тут регіон уже проставлений адміном.
update public.records_notidentify_points r
set inventory_type = public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title)
where r.inventory_type is distinct from public.inv_suggest_type(
      r.archive, r.fonds, r.current_region, r.case_signature, r.case_title);

commit;

-- PostgREST кешує схему: без цього перші запити після міграції ще не бачать
-- нову колонку і insert падає з PGRST204.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ПЕРЕВІРКА (після міграції)
--
-- Розподіл типів:
--
--   select inventory_type, count(*) from public.records group by 1 order by 2 desc;
--
-- Чи збігається збережений тип з правилом (мають лишитися тільки пропущені
-- неузгоджені рядки — див. нижче):
--
--   select id, inventory_type, archive, fonds, current_region, case_signature, case_title
--   from public.records
--   where inventory_type is distinct from public.inv_suggest_type(
--           archive, fonds, current_region, case_signature, case_title);
--
-- Рядки, яких бекфіл НЕ торкнувся через NOT VALID-обмеження: вони лишилися з
-- 'Інвентар', хоча правило дає інший тип. Тип у них проставиться сам при
-- першому ж збереженні через форму — або виправте шифр і повторіть update з
-- п.2 без фільтра-винятку:
--
--   select id, inventory_type, case_signature, archive, fonds, series, record, case_title
--   from public.records
--   where inventory_type = 'Інвентар'
--     and public.inv_suggest_type(archive, fonds, current_region, case_signature, case_title)
--         <> 'Інвентар'
--   order by created_at;
-- ---------------------------------------------------------------------------
-- ВІДКАТ:
--
--   alter table public.records                    drop column if exists inventory_type;
--   alter table public.records_unverified         drop column if exists inventory_type;
--   alter table public.records_edit               drop column if exists inventory_type;
--   alter table public.records_notidentify        drop column if exists inventory_type;
--   alter table public.records_notidentify_points drop column if exists inventory_type;
--   drop function if exists public.inv_suggest_type(text, text, text, text, text);
--   notify pgrst, 'reload schema';
--
-- inv_suggest_type() лишається в базі й після міграції — вона потрібна запитам
-- перевірки вище і зручна, щоб перевірити типи ще раз через якийсь час.
