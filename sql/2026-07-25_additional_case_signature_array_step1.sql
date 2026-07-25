-- additional_case_signature: text → text[], КРОК 1 з 2 — адитивний.
--
-- Та сама справа може лежати одночасно в кількох архівах, і одним рядком їх не
-- описати: доводилося зліплювати шифри в одне значення, після чого їх не знайти
-- ні пошуком, ні перевіркою дублів (режим 'D' у find_duplicate_groups).
--
-- Цей крок лише ДОДАЄ поле additional_case_signature_new text[] і наповнює його
-- зі старого текстового поля. Старе поле й наявний код не чіпаються, тому:
--   • режим обслуговування НЕ потрібен;
--   • крок повністю зворотний — досить дропнути нове поле (див. кінець файлу);
--   • можна виконати заздалегідь і спокійно звірити дані.
--
-- Що далі: перевірити результат (запити в кінці), і коли все гаразд —
-- 2026-07-25_additional_case_signature_array_step2.sql РАЗОМ із деплоєм коду.
--
-- Розбиття наявних значень: крапка з комою та перенос рядка. Кома роздільником
-- НЕ вважається — вона зустрічається всередині самих шифрів (напр. 'HU MNL OL,
-- C 59'). Ті самі роздільники розуміє toSignatureList() у lib/caseSignature.ts.

-- ---------------------------------------------------------------------------
-- ДІАГНОСТИКА — виконати ОКРЕМО, до міграції
--
-- Що лежить у колонці і що з цього розіб'ється на кілька елементів:
--
--   select additional_case_signature, count(*)
--   from public.records
--   where btrim(coalesce(additional_case_signature, '')) <> ''
--   group by 1
--   order by 2 desc, 1;
--
-- Значення з комою — їх скрипт залишить одним елементом. Якщо серед них є
-- справді кілька шифрів, замініть кому на ';' ДО міграції:
--
--   select id, additional_case_signature
--   from public.records
--   where additional_case_signature like '%,%';
--
-- Значення-заглушки ('немає', '-', 'відсутня') краще прибрати заздалегідь —
-- тоді нове поле для них буде null, а не масив з одним сміттєвим елементом:
--
--   update public.records
--   set additional_case_signature = null
--   where lower(btrim(coalesce(additional_case_signature, '')))
--         in ('немає', 'нема', 'відсутня', 'відсутній', '-', '—');
--   -- (те саме за потреби для records_notidentify та *_points)
-- ---------------------------------------------------------------------------

begin;

-- Рядок → масив шифрів. Порожні елементи відкидаємо, порожній результат — null,
-- щоб «не заповнено» лишалося одним значенням, а не двома ({} і null).
-- Порядок елементів зберігаємо через ordinality.
create or replace function public.inv_signature_list(v text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select nullif(
    array(
      select btrim(t.part)
      from unnest(regexp_split_to_array(coalesce(v, ''), E'[;\r\n]+'))
           with ordinality as t(part, ord)
      where btrim(t.part) <> ''
      order by t.ord
    ),
    '{}'::text[]
  );
$$;

-- Нове поле + наповнення зі старого, для кожної з п'яти таблиць.
--
-- IS DISTINCT FROM: торкаємось лише рядків, де значення реально змінюється.
-- Це не оптимізація, а необхідність: 2026-07-23_case_signature_consistency.sql
-- додав на records обмеження records_foreign_archive_has_no_parts і
-- records_signature_matches_parts як NOT VALID — наявні неузгоджені рядки вони
-- пропустили, але блокують по них БУДЬ-ЯКИЙ update. Безумовний бекфіл зачепив
-- би такий рядок навіть з порожньою additional_case_signature й упав би. З цим
-- фільтром рядки без додаткової сигнатури (а таких — переважна більшість,
-- включно з усіма «битими») не чіпаються.
--
-- Лишається один випадок, коли крок 1 усе ж зупиниться: неузгоджений рядок,
-- у якого при цьому Є непорожня additional_case_signature. Такий рядок треба
-- або полагодити, або перенести його сигнатуру вручну. Знайти всі такі до
-- міграції:
--
--   select id, is_ukrainian_archive, case_signature, archive, fonds, series,
--          record, additional_case_signature
--   from public.records
--   where btrim(coalesce(additional_case_signature, '')) <> ''
--     and (
--       (is_ukrainian_archive = 'Ні'
--        and (btrim(coalesce(archive, '')) <> '' or btrim(coalesce(fonds,  '')) <> ''
--          or btrim(coalesce(series,  '')) <> '' or btrim(coalesce(record, '')) <> ''))
--       or (btrim(coalesce(archive, '')) <> '' and btrim(coalesce(fonds,  '')) <> ''
--        and btrim(coalesce(series,  '')) <> '' and btrim(coalesce(record, '')) <> ''
--        and btrim(coalesce(case_signature, '')) <>
--            btrim(archive) || ' ' || btrim(fonds) || '-' || btrim(series) || '-' || btrim(record))
--     );
alter table public.records
  add column if not exists additional_case_signature_new text[];
update public.records
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

alter table public.records_unverified
  add column if not exists additional_case_signature_new text[];
update public.records_unverified
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

alter table public.records_edit
  add column if not exists additional_case_signature_new text[];
update public.records_edit
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

alter table public.records_notidentify
  add column if not exists additional_case_signature_new text[];
update public.records_notidentify
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

alter table public.records_notidentify_points
  add column if not exists additional_case_signature_new text[];
update public.records_notidentify_points
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

-- Порожній масив і порожні елементи — те саме «не заповнено», але записане
-- інакше: третій стан, який довелося б враховувати всюди. Обмеження гарантує,
-- що його не буде. Ім'я тимчасове — крок 2 перейменує його разом з колонкою.
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
      t, t || '_additional_signature_new_not_blank'
    );
    execute format(
      'alter table public.%I add constraint %I check (
         additional_case_signature_new is null
         or (coalesce(array_length(additional_case_signature_new, 1), 0) > 0
             and array_position(additional_case_signature_new, '''') is null
             and array_position(additional_case_signature_new, null::text) is null)
       )',
      t, t || '_additional_signature_new_not_blank'
    );
  end loop;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- ПЕРЕВІРКА (після кроку 1)
--
-- Старе й нове поле поруч — переконатися, що розбиття коректне:
--
--   select additional_case_signature, additional_case_signature_new, count(*)
--   from public.records
--   where additional_case_signature is not null
--      or additional_case_signature_new is not null
--   group by 1, 2
--   order by 3 desc;
--
-- Записи, що розбилися на кілька шифрів:
--
--   select id, case_signature, additional_case_signature, additional_case_signature_new
--   from public.records
--   where array_length(additional_case_signature_new, 1) > 1;
--
-- Розбіжності, де старе непорожнє, а нове чомусь порожнє (мали б бути лише
-- заглушки на кшталт 'немає', якщо їх не прибрали в діагностиці):
--
--   select id, additional_case_signature
--   from public.records
--   where btrim(coalesce(additional_case_signature, '')) <> ''
--     and additional_case_signature_new is null;
-- ---------------------------------------------------------------------------
-- ВІДКАТ кроку 1 (нічого не втрачається — старе поле недоторкане):
--
--   alter table public.records                    drop column if exists additional_case_signature_new;
--   alter table public.records_unverified         drop column if exists additional_case_signature_new;
--   alter table public.records_edit               drop column if exists additional_case_signature_new;
--   alter table public.records_notidentify        drop column if exists additional_case_signature_new;
--   alter table public.records_notidentify_points drop column if exists additional_case_signature_new;
