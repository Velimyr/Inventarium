-- Глобальні налаштування застосунку (key/value).
--
-- Перше застосування — прапорець report_add_problems: чи слати адмінам у
-- Telegram звіт (із JSON-вкладенням даних форми), коли користувачу не вдалося
-- додати інвентар. Далі сюди можна класти інші глобальні перемикачі.
--
-- Значення не чутливі (лише прапорці), тож читати може будь-хто; писати — лише
-- адміни (таблиця admin_users, id = auth.uid()).

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all
  using (
    exists (select 1 from public.admin_users a
            where a.id = auth.uid() and a.role = 'admin')
  )
  with check (
    exists (select 1 from public.admin_users a
            where a.id = auth.uid() and a.role = 'admin')
  );

insert into public.app_settings (key, value)
values ('report_add_problems', 'false'::jsonb)
on conflict (key) do nothing;
