-- Пошук дублів у реєстрі інвентарів (сторінка /admin_duplicates).
--
-- Навіщо: обмеження unique_inventory_verified_record і перевірка при додаванні
-- порівнюють ключові поля посимвольно. Тому в реєстр потрапляють записи, що
-- відрізняються лише регістром, зайвим пробілом, латинською «C» замість «С»
-- або типом старого НП («Місто» / «Містечко») — фактично це той самий інвентар.
-- Ці функції нормалізують значення й групують записи за трьома критеріями.
--
-- Запустити один раз у Supabase → SQL Editor.

-- Нормалізація тексту: нижній регістр, латинські гомогліфи → кирилиця,
-- уніфікація апострофів і дефісів, схлопування пробілів.
-- Латиниця в назвах архівів (AGAD, BNW) теж «кирилізується», але однаково
-- для всіх записів, тож на групування це не впливає.
create or replace function public.inv_norm(v text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(lower(coalesce(v, '')), 'abcehikmoptxy', 'авсенікмортху'),
          '[''`´ʼ’‘]', '''', 'g'
        ),
        '[–—−]', '-', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- Нормалізація шифру справи: те саме + викидаємо всі роздільники.
-- «ЦДІАК 49-2-509», «цдіак 49–2–509» і архів+фонд+опис+справа «ЦДІАК/49/2/509»
-- зводяться до одного ключа.
create or replace function public.inv_norm_sig(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(public.inv_norm(v), '[^[:alnum:]]', '', 'g');
$$;

-- Архів із шифру справи: усе до першого токена з цифрою.
-- Потрібно, бо в записах іноземних архівів колонки archive/fonds/series/record
-- порожні, і архів зашитий лише в case_signature:
--   'AGAD ASK LVI 1/7/0/11/290'  → 'AGAD ASK LVI'
--   'ANK AS 29/637/0/1.2/2135'   → 'ANK AS'
--   'HU MNL OL, C 59 - IV. …'    → 'HU MNL OL, C'
create or replace function public.inv_archive_prefix(v text)
returns text
language plpgsql
immutable
as $$
declare
  tok   text;
  parts text[] := '{}';
begin
  foreach tok in array regexp_split_to_array(btrim(coalesce(v, '')), '\s+') loop
    exit when tok ~ '\d';
    parts := parts || tok;
  end loop;
  return btrim(array_to_string(parts, ' '));
end;
$$;

-- Групи, які адмін переглянув і вирішив, що це НЕ дублі.
-- Без цієї відмітки така група поверталася б у список щоразу — критично для
-- режиму 'C', де груп понад тисячу. Ключ залежить від критерію, тому (mode, group_key).
create table if not exists public.records_duplicate_reviewed (
  mode        text        not null,
  group_key   text        not null,
  reviewed_by uuid,
  reviewed_at timestamptz not null default now(),
  primary key (mode, group_key)
);

alter table public.records_duplicate_reviewed enable row level security;

-- Читати можуть усі: відмітки потрібні функції find_duplicate_groups,
-- і нічого приватного в них немає (лише службовий ключ групи).
drop policy if exists "duplicate_reviewed_select" on public.records_duplicate_reviewed;
create policy "duplicate_reviewed_select"
  on public.records_duplicate_reviewed
  for select
  using (true);

-- Створювати й прибирати відмітки може лише адміністратор.
drop policy if exists "duplicate_reviewed_write" on public.records_duplicate_reviewed;
create policy "duplicate_reviewed_write"
  on public.records_duplicate_reviewed
  for all
  to authenticated
  using (
    exists (select 1 from public.admin_users a where a.id = auth.uid() and a.role = 'admin')
  )
  with check (
    exists (select 1 from public.admin_users a where a.id = auth.uid() and a.role = 'admin')
  );

grant select on public.records_duplicate_reviewed to anon, authenticated;
grant insert, delete on public.records_duplicate_reviewed to authenticated;

-- Групи дублів. p_mode:
--   'A' — точні дублі: усі ключові поля збігаються після нормалізації
--         (те, що мало б ловити обмеження БД, але пропускає через регістр/гомогліфи).
--   'B' — основний критерій: населений пункт + рік + справа.
--         Ігнорує old_settlement_*, тому ловить «Місто» проти «Містечка».
--   'C' — підозри: населений пункт + рік, але шифри справ РІЗНІ.
--         Лишений для сумісності; на сторінці розбитий на C1/C2/C3.
--   'C1' — те саме, але записи з РІЗНИХ архівів: копії та мікрофільми
--          (ЦДІАК КМФ-15 ↔ ANK AS, ЛННБ 141 ↔ ЦДІАЛ 146). Найімовірніші дублі.
--   'C2' — один архів, але справи з різних фондів чи описів.
--   'C3' — один опис, різні справи: серія окремих інвентарних книг, зазвичай не дублі.
--          Сюди ж потрапляють групи, де фонд/опис не заповнені.
-- Повертає ще й «обсяги» групи — набори архівних координат, які в ній трапляються.
-- Вони потрібні для масової відмітки «не дублі» на сторінці: якщо в групі рівно
-- одне значення на певному рівні, тим самим значенням можна накрити всі інші
-- групи того ж фонду/опису/справи одним підтвердженням.
-- Тип результату змінюється, тому спершу прибираємо стару версію функції.
drop function if exists public.find_duplicate_groups(text);

create or replace function public.find_duplicate_groups(p_mode text default 'B')
returns table (
  group_key     text,
  records_count integer,
  first_created timestamp,
  record_ids    uuid[],
  label         text,
  scope_l4      text[],   -- архів|фонд|опис|справа
  scope_l3      text[],   -- архів|фонд|опис
  scope_l2      text[],   -- архів|фонд
  scope_l1      text[],   -- архів
  scope_sig     text[],   -- шифр справи (коли архівні поля не заповнені)
  archives      text[]    -- назви архівів групи, для показу
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.created_at,
      r.inventory_year,
      r.current_region,
      r.current_settlement_type,
      r.current_settlement_name,
      r.case_signature,
      inv_norm(r.current_region)          as n_region,
      inv_norm(r.current_district)        as n_district,
      inv_norm(r.current_community)       as n_community,
      inv_norm(r.current_settlement_type) as n_ctype,
      inv_norm(r.current_settlement_name) as n_cname,
      inv_norm(r.old_settlement_type)     as n_otype,
      inv_norm(r.old_settlement_name)     as n_oname,
      -- архів беремо з колонки, а якщо вона порожня — з префікса шифру
      coalesce(nullif(btrim(coalesce(r.archive, '')), ''),
               inv_archive_prefix(r.case_signature)) as arch_label,
      inv_norm(coalesce(nullif(btrim(coalesce(r.archive, '')), ''),
                        inv_archive_prefix(r.case_signature))) as n_arch,
      inv_norm(r.fonds)                   as n_fonds,
      inv_norm(r.series)                  as n_series,
      inv_norm(r.record)                  as n_record,
      inv_norm(r.case_signature)          as n_case_sig,
      -- шифр беремо з case_signature, а якщо він порожній — складаємо з
      -- архів+фонд+опис+справа; після inv_norm_sig обидві форми збігаються
      coalesce(
        nullif(inv_norm_sig(r.case_signature), ''),
        inv_norm_sig(concat_ws('', r.archive, r.fonds, r.series, r.record))
      ) as n_sig
    from records r
    where r.approved = true
  ),
  keyed as (
    select
      base.*,
      case
        when p_mode = 'A' then
          concat_ws('|', n_region, n_district, n_community, n_ctype,
                    n_cname, n_otype, n_oname, n_sig,
                    coalesce(inventory_year::text, ''))
        when p_mode = 'B' then
          concat_ws('|', n_region, n_district, n_community, n_cname,
                    coalesce(inventory_year::text, ''), n_sig)
        when p_mode in ('C', 'C1', 'C2', 'C3') then
          concat_ws('|', n_region, n_district, n_community, n_cname, inventory_year::text)
      end as k
    from base
  ),
  grouped as (
    select
      k as group_key,
      count(*)::integer as records_count,
      -- явне приведення: функція оголошена з timestamp, а колонка може бути timestamptz
      min(created_at)::timestamp as first_created,
      array_agg(id order by created_at, id) as record_ids,
      concat_ws(
        ' · ',
        concat_ws(', ', min(current_region),
                  btrim(concat_ws(' ', min(current_settlement_type), min(current_settlement_name)))),
        coalesce(min(inventory_year)::text, 'рік не вказано'),
        nullif(min(case_signature), '')
      ) as label,
      array_agg(distinct concat_ws('|', n_arch, n_fonds, n_series, n_record)) as scope_l4,
      array_agg(distinct concat_ws('|', n_arch, n_fonds, n_series))           as scope_l3,
      array_agg(distinct concat_ws('|', n_arch, n_fonds))                     as scope_l2,
      array_agg(distinct n_arch)                                              as scope_l1,
      array_agg(distinct n_case_sig)                                          as scope_sig,
      array_agg(distinct arch_label) filter (where arch_label <> '')          as archives
    from keyed
    where k is not null
      and k <> ''
      -- у режимах 'C*' записи без року дали б одну величезну «групу» зі сміття
      and (p_mode not in ('C', 'C1', 'C2', 'C3') or inventory_year is not null)
    group by k
    having count(*) > 1
       -- 'C*' показує лише те, що не спіймав 'B': шифри в групі різні
       and (p_mode not in ('C', 'C1', 'C2', 'C3') or count(distinct n_sig) > 1)
       -- C1: записи походять із різних архівів
       and (p_mode <> 'C1' or count(distinct n_arch) > 1)
       -- C2: архів один, але фонд/опис заповнені й різні
       and (p_mode <> 'C2' or (count(distinct n_arch) = 1
                               and bool_and(n_fonds <> '' and n_series <> '')
                               and count(distinct (n_arch, n_fonds, n_series)) > 1))
       -- C3: архів один, а опис або спільний, або не заповнений
       and (p_mode <> 'C3' or (count(distinct n_arch) = 1
                               and (bool_or(n_fonds = '' or n_series = '')
                                    or count(distinct (n_arch, n_fonds, n_series)) = 1)))
  )
  select g.group_key, g.records_count, g.first_created, g.record_ids, g.label,
         g.scope_l4, g.scope_l3, g.scope_l2, g.scope_l1, g.scope_sig, g.archives
  from grouped g
  -- групи, які адмін уже переглянув і позначив «це не дублі», не показуємо
  where not exists (
    select 1
    from records_duplicate_reviewed rr
    where rr.mode = p_mode
      and rr.group_key = g.group_key
  )
  order by g.records_count desc, g.first_created;
$$;

-- Функцію викликає сторінка адмінки звичайним anon-ключем (як і решта запитів
-- до records). SECURITY DEFINER не потрібен — records і так читає anon.
grant execute on function public.inv_norm(text) to anon, authenticated, service_role;
grant execute on function public.inv_norm_sig(text) to anon, authenticated, service_role;
grant execute on function public.inv_archive_prefix(text) to anon, authenticated, service_role;
grant execute on function public.find_duplicate_groups(text) to anon, authenticated, service_role;

-- Переносимо відмітки «не дублі», зроблені в старому єдиному блоці C, у нові
-- C1/C2/C3. Ключ групи в них однаковий (НП + рік), тому відмітка спрацює саме
-- в тому блоці, до якого група тепер належить. Ідемпотентно, безпечно повторювати.
insert into public.records_duplicate_reviewed (mode, group_key, reviewed_by, reviewed_at)
select m.mode, r.group_key, r.reviewed_by, r.reviewed_at
from public.records_duplicate_reviewed r
cross join (values ('C1'), ('C2'), ('C3')) as m(mode)
where r.mode = 'C'
on conflict do nothing;
