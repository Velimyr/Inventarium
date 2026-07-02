-- Функція для нічної синхронізації балів із системою «Карма».
-- Рахує сумарний внесок кожного користувача (підтверджені + неперевірені записи)
-- прямо в БД і повертає login (email у нижньому регістрі) + total.
-- Це на порядки швидше, ніж тягнути всі рядки в застосунок.
--
-- Запустити один раз у Supabase → SQL Editor.

create or replace function public.karma_user_totals()
returns table (login text, total bigint)
language sql
security definer          -- рахуємо в обхід RLS: агрегати по всіх користувачах
set search_path = public
as $$
  with counts as (
    select created_by as user_id, count(*)::bigint as c
    from records
    where created_by is not null
    group by created_by
    union all
    select created_by as user_id, count(*)::bigint as c
    from records_unverified
    where created_by is not null
    group by created_by
  ),
  totals as (
    select user_id, sum(c) as total
    from counts
    group by user_id
  )
  select lower(p.email) as login, t.total
  from totals t
  join profiles p on p.user_id = t.user_id
  where p.email is not null
    and t.total > 0;      -- нульові бали нічого не змінюють на боці «Карми»
$$;

-- Функцію викликає серверний cron-маршрут через звичайний anon-ключ
-- (той самий, що й решта застосунку), тож дозволяємо виконання anon-ролі.
-- SECURITY DEFINER гарантує коректний підрахунок незалежно від RLS.
grant execute on function public.karma_user_totals() to anon, authenticated, service_role;
