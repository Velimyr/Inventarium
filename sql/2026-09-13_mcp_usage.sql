-- Добова квота викликів MCP-сервера на користувача.
-- Виконати вручну в Supabase SQL editor ДО деплою авторизації MCP: без функції
-- mcp_count_call() сервер не зможе порахувати квоту й відмовлятиме у викликах.
--
-- Навіщо
-- ------
-- MCP-сервер (/api/mcp) пускає лише користувачів сайту: клієнт (Claude, ChatGPT…)
-- отримує OAuth-токен від Supabase Auth і шле його з кожним запитом. Ліміт за IP
-- тут не працює — хмарні клієнти звертаються з IP свого постачальника, спільних
-- для всіх користувачів. Тому квота рахується за акаунтом: однакова для всіх,
-- 100 викликів інструментів на добу (стеля — DAILY_TOOL_CALLS у lib/mcp/quota.ts).
--
-- Як влаштовано
-- -------------
-- Таблиця закрита RLS без жодної політики: напряму її не читає й не пише ніхто.
-- Єдиний шлях — функція mcp_count_call(): SECURITY DEFINER, лічильник лише для
-- auth.uid(), тож чужу квоту не зачепити. Сервер викликає її з токеном
-- користувача перед кожним tools/call і порівнює результат зі стелею. Якщо
-- користувач смикне функцію сам, він лише витратить власну квоту.
--
-- Доба — за UTC: межа однакова для всіх і не залежить від часового поясу сервера.

create table if not exists public.mcp_usage (
  user_id uuid    not null references auth.users (id) on delete cascade,
  day     date    not null,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table public.mcp_usage enable row level security;

create or replace function public.mcp_count_call()
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.mcp_usage (user_id, day, calls)
  values (auth.uid(), (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = public.mcp_usage.calls + 1
  returning calls;
$$;

-- Функції за замовчуванням виконує PUBLIC — забираємо, лишаємо лише залогіненим.
-- Для anon auth.uid() порожній, і вставка однаково впала б на not null.
revoke all on function public.mcp_count_call() from public, anon;
grant execute on function public.mcp_count_call() to authenticated;

-- Відкат:
--   drop function if exists public.mcp_count_call();
--   drop table if exists public.mcp_usage;
