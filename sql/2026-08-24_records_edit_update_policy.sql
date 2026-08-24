-- Автор пропозиції редагування може її виправити (політика UPDATE).
-- Виконати вручну в Supabase SQL editor.
--
-- Проблема
-- --------
-- На public.records_edit увімкнено RLS, але політик було рівно три:
--
--   INSERT  {public}         with check (true)
--   SELECT  {public}         using (true)
--   DELETE  {authenticated}  using (true)
--
-- Політики UPDATE не було ЖОДНОЇ. Для RLS це означає «оновлювати не можна
-- нікому»: Postgres не бачить рядка як придатного для оновлення, тож
--
--   update public.records_edit set ... where id = '...'
--
-- зачіпає 0 рядків і НЕ повертає помилки. Через це сторінка /my_edits
-- («Мої редагування») мовчки не зберігала виправлення автора, а користувач
-- бачив повідомлення про те, що пропозицію нібито вже опрацював адміністратор.
--
-- Той самий брак політики ламає й /edit/[id]: там пропозиція пишеться через
-- upsert(onConflict: 'id'), і якщо на запис уже є пропозиція, спрацьовує гілка
-- ON CONFLICT DO UPDATE — вона під RLS падає з помилкою, а не мовчить.
--
-- Хто такий «автор редагування»
-- -----------------------------
-- Окремої колонки з user_id автора пропозиції в records_edit немає:
-- created_by — це автор САМОГО інвентаря, скопійований разом з рештою колонок
-- при створенні пропозиції. Автор редагування визначається за email — за ним
-- же адмінка знаходить, кому надіслати сповіщення (див. notifyAuthors у
-- lib/editApprove.ts). Тому й політика звіряє email із JWT.
--
-- Політику навмисне НЕ дублюємо через `with check`: якщо його не вказати,
-- Postgres застосовує вираз із `using` і до нового рядка теж. Отже змінити
-- email у власній пропозиції не вийде — інакше її можна було б переписати на
-- чужу адресу й забрати (або втратити) авторство.
--
-- Адмінові UPDATE не потрібен: адмінка пише в records, а з черги рядок
-- видаляє — на це вже є політика DELETE.

drop policy if exists "records_edit_update_own" on public.records_edit;

create policy "records_edit_update_own" on public.records_edit
  for update to authenticated
  using (email = auth.jwt() ->> 'email');

-- Перевірка після виконання: має з'явитися рядок з cmd = UPDATE
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'records_edit';
--
-- Анонімні автори (INSERT дозволено {public}) виправити свою пропозицію не
-- зможуть — у них немає JWT з email. Це свідомо: /my_edits і так лише для
-- залогінених.

-- ---------------------------------------------------------------------------
-- Те саме варто перевірити на records_unverified
-- ---------------------------------------------------------------------------
-- /edit_drafts редагує чернетки таким самим update(...).eq('id', ...) і НЕ
-- перевіряє кількість оновлених рядків — тобто за браку політики UPDATE
-- користувач побачив би «✅ Чернетку збережено», а зміни б зникли.
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'records_unverified';
--
-- Якщо політики UPDATE там теж немає — автор чернетки визначається за
-- created_by (на відміну від records_edit), тож політика буде така:
--
--   create policy "records_unverified_update_own" on public.records_unverified
--     for update to authenticated
--     using (created_by = auth.uid());
