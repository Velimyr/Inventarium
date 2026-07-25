-- additional_case_signature: text → text[], КРОК 2 з 2 — деструктивний.
--
-- Виконати ТІЛЬКИ після кроку 1
-- (2026-07-25_additional_case_signature_array_step1.sql) і звірки даних.
--
-- Що робить: остаточно синхронізує нове поле зі старим, дропає старе,
-- перейменовує нове в additional_case_signature. Після цього код читає/пише
-- саме масив, тому цей крок іде РАЗОМ із деплоєм коду.
--
-- Порядок цього cutover:
--   1. (за бажанням) NEXT_PUBLIC_MAINTENANCE_MODE — увімкнути. Між виконанням
--      цього скрипта і публікацією нового коду старий код на кілька секунд
--      пише рядок у колонку, що вже стала text[] → такий запис впаде. Читання
--      працює. Для низького трафіку можна без обслуговування.
--   2. Виконати цей скрипт.
--   3. Перестворити RPC-функції під новий тип (старі читають колонку як текст
--      і після зміни типу впадуть):
--        sql/find_case_inconsistencies.sql
--        sql/find_duplicate_groups.sql
--   4. Задеплоїти код.
--   5. NEXT_PUBLIC_MAINTENANCE_MODE — вимкнути (якщо вмикали).

begin;

-- Фінальна синхронізація: старе поле лишалося єдиним джерелом правди між
-- кроками, тож будь-які записи цього вікна переносимо в нове поле перед дропом.
-- Нове поле досі ніхто не пише, тож перезаписування безпечне.
--
-- IS DISTINCT FROM — з тієї ж причини, що й у кроці 1: не чіпати рядки, де
-- значення не змінилось, інакше NOT VALID-обмеження records з 2026-07-23
-- заблокують update по неузгоджених рядках. Якщо крок 1 пройшов, усі рядки з
-- непорожньою сигнатурою вже узгоджені, тож тут лишаються тільки реальні зміни
-- вікна між кроками.
update public.records
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);
update public.records_unverified
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);
update public.records_edit
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);
update public.records_notidentify
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);
update public.records_notidentify_points
  set additional_case_signature_new = public.inv_signature_list(additional_case_signature)
  where additional_case_signature_new
        is distinct from public.inv_signature_list(additional_case_signature);

-- Старе поле → нове займає його ім'я. Обмеження перейменовуємо слідом,
-- щоб назва не тягла за собою «_new».
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
    execute format('alter table public.%I drop column additional_case_signature', t);
    execute format(
      'alter table public.%I rename column additional_case_signature_new to additional_case_signature',
      t
    );
    execute format(
      'alter table public.%I rename constraint %I to %I',
      t,
      t || '_additional_signature_new_not_blank',
      t || '_additional_signature_not_blank'
    );
  end loop;
end;
$$;

commit;

-- PostgREST кешує схему: без цього перші запити після міграції ще вважають
-- колонку текстовою.
notify pgrst, 'reload schema';

-- inv_signature_list() більше не потрібна (лишалась для бекфілу). Прибрати
-- можна, але не обов'язково — вона нікому не заважає:
--   drop function if exists public.inv_signature_list(text);

-- ---------------------------------------------------------------------------
-- ПЕРЕВІРКА (після кроку 2):
--
--   select additional_case_signature, count(*)
--   from public.records
--   where additional_case_signature is not null
--   group by 1
--   order by 2 desc;
--
--   select id, case_signature, additional_case_signature
--   from public.records
--   where array_length(additional_case_signature, 1) > 1;
--
-- Пошук за додатковою сигнатурою тепер такий:
--
--   where additional_case_signature @> array['НБУВ 1-1-1']
-- ---------------------------------------------------------------------------
-- ВІДКАТ кроку 2 (масив назад у рядок через '; '; дані окремих елементів
-- зливаються в один рядок, але не втрачаються):
--
--   alter table public.records
--     alter column additional_case_signature type text
--     using array_to_string(additional_case_signature, '; ');
--   -- (те саме для решти чотирьох таблиць; далі відкотити код і RPC-функції)
