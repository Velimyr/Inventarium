-- Запропоновані зміни до ключів (аналог records_edit):
-- користувач подає нову версію, адмін застосовує її до map_keys і видаляє рядок.
-- Виконати вручну в Supabase SQL editor.

create table public.map_keys_edit (
  id            uuid primary key default gen_random_uuid(),
  key_id        uuid not null references public.map_keys (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  source        text,
  description   text,
  center        jsonb not null check (jsonb_typeof(center) = 'object'),
  points        jsonb not null
                check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 2),
  polygon_variant text not null default 'buffer'
                check (polygon_variant in ('hull', 'buffer', 'voronoi')),
  -- Контакт автора пропозиції (не оригінального автора ключа)
  email         text not null check (position('@' in email) > 1),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

create index map_keys_edit_key_id_idx on public.map_keys_edit (key_id);

alter table public.map_keys_edit enable row level security;

-- Пропозицію може подати будь-хто: залогінений — від свого імені, анонім — без авторства
create policy "map_keys_edit_insert_authenticated" on public.map_keys_edit
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "map_keys_edit_insert_anon" on public.map_keys_edit
  for insert to anon
  with check (created_by is null);

-- Читає лише адмін (черга модерації) та автор пропозиції
create policy "map_keys_edit_select_admin" on public.map_keys_edit
  for select to authenticated
  using (exists (select 1 from public.admin_users a
                 where a.id = auth.uid() and a.role = 'admin'));

create policy "map_keys_edit_select_own" on public.map_keys_edit
  for select to authenticated
  using (created_by = auth.uid());

-- Видаляє лише адмін (після застосування або відхилення)
create policy "map_keys_edit_delete_admin" on public.map_keys_edit
  for delete to authenticated
  using (exists (select 1 from public.admin_users a
                 where a.id = auth.uid() and a.role = 'admin'));

-- УВАГА: якщо на messages.message_type є CHECK-обмеження — додайте типи:
--   'key_edit_new', 'key_edit_approved', 'key_edit_rejected'
