-- Новий тип документа: «Дефтер» — османський податковий реєстр.
--
-- Правило (те саме, що в lib/inventoryType.ts): шифр справи містить слова
-- «Кирила» і «Мефодія» в будь-якому порядку — дефтери зберігаються в
-- Національній бібліотеці святих Кирила і Мефодія. Перевірка двобічна:
-- такий шифр → тип «Дефтер», тип «Дефтер» → шифр має містити обидва слова.
--
-- Виконати ДО деплою коду: без розширеного CHECK insert/update з
-- inventory_type = 'Дефтер' впаде.

begin;

-- ---------------------------------------------------------------------------
-- 1. Дозволені значення на всіх п'яти таблицях (див. 2026-08-04_inventory_type.sql).
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
      'alter table public.%I drop constraint if exists %I',
      t, t || '_inventory_type_values'
    );
    execute format(
      'alter table public.%I add constraint %I check (
         inventory_type is null
         or inventory_type in (''Інвентар'', ''Люстрація'', ''Фасія'', ''Урбар'', ''Дефтер'')
       )',
      t, t || '_inventory_type_values'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Правила типізації — рівно ті самі, що в suggestInventoryType().
--    Порядок гілок case = пріоритет: Дефтер → Фасія → Урбар → Люстрація → Інвентар.
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
    when lower(coalesce(p_signature, '')) like '%кирила%'
     and lower(coalesce(p_signature, '')) like '%мефодія%'           then 'Дефтер'
    when btrim(coalesce(p_archive, '')) = 'ЦДІАЛ'
     and btrim(coalesce(p_fonds,   '')) = '146'                      then 'Фасія'
    when btrim(coalesce(p_region,  '')) = 'Закарпатська область'
     and upper(btrim(coalesce(p_signature, ''))) like 'HU%'          then 'Урбар'
    when lower(coalesce(p_title, '')) like '%люстрац%'               then 'Люстрація'
    else 'Інвентар'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Бекфіл: наявні записи з шифром НБ св. Кирила і Мефодія отримують «Дефтер».
--
-- Чіпаємо лише такі рядки — тип решти записів ця міграція не змінює.
-- Фільтр узгодженості в records — з тієї ж причини, що й у
-- 2026-08-04_inventory_type.sql: NOT VALID-обмеження шифру блокують будь-який
-- update неузгодженого рядка і зупинили б усю міграцію.
-- ---------------------------------------------------------------------------
update public.records r
set inventory_type = 'Дефтер'
where lower(coalesce(r.case_signature, '')) like '%кирила%'
  and lower(coalesce(r.case_signature, '')) like '%мефодія%'
  and r.inventory_type is distinct from 'Дефтер'
  and (
    btrim(coalesce(r.archive, '')) = ''
    or btrim(coalesce(r.fonds,  '')) = ''
    or btrim(coalesce(r.series, '')) = ''
    or btrim(coalesce(r.record, '')) = ''
    or btrim(coalesce(r.case_signature, '')) =
       btrim(r.archive) || ' ' || btrim(r.fonds) || '-' || btrim(r.series) || '-' || btrim(r.record)
  )
  and (
    r.is_ukrainian_archive is distinct from 'Ні'
    or (btrim(coalesce(r.archive, '')) = '' and btrim(coalesce(r.fonds,  '')) = ''
        and btrim(coalesce(r.series, '')) = '' and btrim(coalesce(r.record, '')) = '')
  );

do $$
declare
  t text;
begin
  foreach t in array array[
    'records_unverified',
    'records_edit',
    'records_notidentify',
    'records_notidentify_points'
  ] loop
    execute format(
      'update public.%I
       set inventory_type = ''Дефтер''
       where lower(coalesce(case_signature, '''')) like ''%%кирила%%''
         and lower(coalesce(case_signature, '''')) like ''%%мефодія%%''
         and inventory_type is distinct from ''Дефтер''',
      t
    );
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ПЕРЕВІРКА
--
--   select inventory_type, count(*) from public.records group by 1 order by 2 desc;
--
-- Записи, де тип і шифр розходяться щодо дефтера (в обидва боки):
--
--   select id, inventory_type, case_signature
--   from public.records
--   where (inventory_type = 'Дефтер')
--      <> (lower(coalesce(case_signature, '')) like '%кирила%'
--          and lower(coalesce(case_signature, '')) like '%мефодія%');
-- ---------------------------------------------------------------------------
-- ВІДКАТ (спершу поверніть 'Дефтер' на інший тип, інакше CHECK не створиться):
--
--   update public.<таблиця> set inventory_type = 'Інвентар' where inventory_type = 'Дефтер';
--   -- далі п.1 і п.2 з 2026-08-04_inventory_type.sql
-- ---------------------------------------------------------------------------
