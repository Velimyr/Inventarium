-- Неповні або суперечливі дані справ (вкладка «Неповні дані справ»
-- на сторінці /admin_duplicates).
--
-- Ідея: усі записи з одним шифром справи описують ОДНУ архівну справу, тому
-- її власні характеристики — архів, фонд, опис, номер справи, дати, кількість
-- сторінок, посилання на скани, додаткова сигнатура — мають бути однакові.
-- Якщо вони розходяться, це або помилка введення, або незаповнене поле.
-- Сторінка початку інвентаря сюди не входить: вона законно різна для кожного
-- населеного пункту всередині справи.
--
-- Приклади того, що це знаходить:
--   'ЦДІАЛ 181-1-1251' — в одного з чотирьох записів фонд '1251' замість '181'
--   'APP AZSK 56/158/0/-/12' — п'ять записів із зовсім різними координатами
--
-- Запустити один раз у Supabase → SQL Editor.
-- Потребує inv_norm_sig() з find_duplicate_groups.sql.

create or replace function public.find_case_inconsistencies()
returns table (
  signature_key  text,
  case_signature text,
  records_count  integer,
  record_ids     uuid[],
  diffs          jsonb
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      r.id,
      r.created_at,
      btrim(coalesce(r.case_signature, ''))                   as case_signature,
      inv_norm_sig(r.case_signature)                          as n_sig,
      -- порожнє значення теж вважаємо варіантом: незаповнене поле в одному
      -- із записів однієї справи — це саме те, що ми шукаємо
      btrim(coalesce(r.archive::text, ''))                    as f_archive,
      btrim(coalesce(r.fonds::text, ''))                      as f_fonds,
      btrim(coalesce(r.series::text, ''))                     as f_series,
      btrim(coalesce(r.record::text, ''))                     as f_record,
      btrim(coalesce(r.case_date::text, ''))                  as f_case_date,
      btrim(coalesce(r.pages_count::text, ''))                as f_pages_count,
      btrim(coalesce(r.scans_url::text, ''))                  as f_scans_url,
      btrim(coalesce(r.additional_case_signature::text, ''))  as f_add_signature
    from records r
    where r.approved = true
      and btrim(coalesce(r.case_signature, '')) <> ''
  ),
  grouped as (
    select
      n_sig,
      min(case_signature) as case_signature,
      count(*)::integer   as records_count,
      array_agg(id order by created_at, id) as record_ids,
      count(distinct f_archive)       as c_archive,
      count(distinct f_fonds)         as c_fonds,
      count(distinct f_series)        as c_series,
      count(distinct f_record)        as c_record,
      count(distinct f_case_date)     as c_case_date,
      count(distinct f_pages_count)   as c_pages_count,
      count(distinct f_scans_url)     as c_scans_url,
      count(distinct f_add_signature) as c_add_signature,
      array_agg(distinct f_archive)       as v_archive,
      array_agg(distinct f_fonds)         as v_fonds,
      array_agg(distinct f_series)        as v_series,
      array_agg(distinct f_record)        as v_record,
      array_agg(distinct f_case_date)     as v_case_date,
      array_agg(distinct f_pages_count)   as v_pages_count,
      array_agg(distinct f_scans_url)     as v_scans_url,
      array_agg(distinct f_add_signature) as v_add_signature
    from base
    group by n_sig
    having count(*) > 1
  )
  select
    n_sig,
    case_signature,
    records_count,
    record_ids,
    -- лише ті поля, що справді розходяться, разом із наявними варіантами
    jsonb_strip_nulls(jsonb_build_object(
      'archive',                   case when c_archive > 1       then to_jsonb(v_archive) end,
      'fonds',                     case when c_fonds > 1         then to_jsonb(v_fonds) end,
      'series',                    case when c_series > 1        then to_jsonb(v_series) end,
      'record',                    case when c_record > 1        then to_jsonb(v_record) end,
      'case_date',                 case when c_case_date > 1     then to_jsonb(v_case_date) end,
      'pages_count',               case when c_pages_count > 1   then to_jsonb(v_pages_count) end,
      'scans_url',                 case when c_scans_url > 1     then to_jsonb(v_scans_url) end,
      'additional_case_signature', case when c_add_signature > 1 then to_jsonb(v_add_signature) end
    )) as diffs
  from grouped
  where c_archive > 1
     or c_fonds > 1
     or c_series > 1
     or c_record > 1
     or c_case_date > 1
     or c_pages_count > 1
     or c_scans_url > 1
     or c_add_signature > 1
  -- спершу розбіжності в архівних координатах: це майже завжди помилка введення
  order by
    case when c_archive > 1 or c_fonds > 1 or c_series > 1 or c_record > 1 then 0 else 1 end,
    records_count desc,
    case_signature;
$$;

grant execute on function public.find_case_inconsistencies() to anon, authenticated, service_role;
