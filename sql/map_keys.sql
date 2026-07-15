-- Таблиця «Ключі» — історичні комплекси маєтків (полігони).
-- Користувач подає ключ (status='new'), адмін апрувить ('approved') або відхиляє ('rejected').
-- Подання доступне і без логіну: тоді created_by = null, а email вводиться вручну.
-- Виконати вручну в Supabase SQL editor.
-- (Якщо таблиця вже створена попередньою версією цього скрипта — вона ще порожня,
--  тож найпростіше: drop table public.map_keys; і виконати скрипт заново.)

create table public.map_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 200),
  source        text,
  description   text,
  -- Центр ключа: {lat, lng, region, district, community, code, name, type}
  -- (координати + прив'язка до населеного пункту з довідника region_structure.json)
  center        jsonb not null check (jsonb_typeof(center) = 'object'),
  -- Населені пункти ключа: масив таких самих об'єктів, мінімум 2
  -- (контур будується з центру + пунктів, тож 2 пункти вже дають трикутник)
  points        jsonb not null
                check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 2),
  status        text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  reject_reason text,
  -- Варіант побудови контуру (обирає користувач при поданні, адмін може змінити):
  -- hull — опукла оболонка, buffer — оболонка з відступом ~2 км, voronoi — діаграми Вороного
  polygon_variant text not null default 'buffer'
                check (polygon_variant in ('hull', 'buffer', 'voronoi')),
  -- Обчислений контур території: масив кілець [[[lat, lng], ...], ...]
  -- (записується при підтвердженні; публічна карта рендерить його без перерахунку)
  polygon       jsonb,
  -- Контакт автора: для залогінених підтягується автоматично, для анонімів — вручну
  email         text not null check (position('@' in email) > 1),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references auth.users (id),
  reviewed_at   timestamptz
);

create index map_keys_status_idx on public.map_keys (status);

-- Захист від дублікатів: серед активних ключів (нових і підтверджених)
-- центр має бути унікальним; відхилені не блокують повторне подання
create unique index map_keys_unique_center_idx
  on public.map_keys ((center->>'code')) where status in ('new', 'approved');

alter table public.map_keys enable row level security;

-- Публічна карта: всі (включно з анонімами) бачать лише підтверджені ключі
create policy "map_keys_select_approved" on public.map_keys
  for select to anon, authenticated
  using (status = 'approved');

-- Автор бачить власні подання
create policy "map_keys_select_own" on public.map_keys
  for select to authenticated
  using (created_by = auth.uid());

-- Адмін бачить усе (черга модерації)
create policy "map_keys_select_admin" on public.map_keys
  for select to authenticated
  using (exists (select 1 from public.admin_users a
                 where a.id = auth.uid() and a.role = 'admin'));

-- Вставка залогіненим: лише від свого імені та лише зі статусом 'new'
create policy "map_keys_insert_authenticated" on public.map_keys
  for insert to authenticated
  with check (created_by = auth.uid() and status = 'new');

-- Вставка анонімом: без авторства та лише зі статусом 'new'
create policy "map_keys_insert_anon" on public.map_keys
  for insert to anon
  with check (created_by is null and status = 'new');

-- Оновлення/видалення: лише адмін (подання користувача незмінне після сабміту)
create policy "map_keys_update_admin" on public.map_keys
  for update to authenticated
  using (exists (select 1 from public.admin_users a
                 where a.id = auth.uid() and a.role = 'admin'))
  with check (exists (select 1 from public.admin_users a
                      where a.id = auth.uid() and a.role = 'admin'));

create policy "map_keys_delete_admin" on public.map_keys
  for delete to authenticated
  using (exists (select 1 from public.admin_users a
                 where a.id = auth.uid() and a.role = 'admin'));

-- УВАГА: якщо на таблиці messages колонка message_type має CHECK-обмеження або enum,
-- додайте до дозволених значень нові типи сповіщень:
--   'key_new', 'key_approved', 'key_rejected'
-- (у коді вони вже додані в lib/messageUtils.ts).

-- ─────────────────────────────────────────────────────────────────────────────
-- МІГРАЦІЯ: якщо таблиця вже існує (з колонками center/points jsonb),
-- але без polygon_variant/polygon — виконайте лише цей блок:
--
-- alter table public.map_keys
--   add column polygon_variant text not null default 'buffer'
--     check (polygon_variant in ('hull', 'buffer', 'voronoi')),
--   add column polygon jsonb;
--
-- Якщо колонки вже додані зі старим default 'hull':
-- alter table public.map_keys alter column polygon_variant set default 'buffer';
--
-- Зниження мінімуму населених пунктів з 3 до 2 (для вже створеної таблиці):
-- alter table public.map_keys drop constraint map_keys_points_check;
-- alter table public.map_keys add constraint map_keys_points_check
--   check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 2);
--
-- Захист від дублікатів (для вже створеної таблиці):
-- create unique index map_keys_unique_center_idx
--   on public.map_keys ((center->>'code')) where status in ('new', 'approved');
--
-- Якщо раніше був створений індекс за назвою — видаліть його:
-- drop index if exists map_keys_unique_name_idx;
-- ─────────────────────────────────────────────────────────────────────────────
