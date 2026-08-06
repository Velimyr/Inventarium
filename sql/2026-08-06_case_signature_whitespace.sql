-- Пробіли в шифрі справи — разова нормалізація даних.
--
-- Проблема: шифр зберігався рівно так, як його ввели. Валідація його ЧИСТИТЬ,
-- але лише для перевірки (text() у lib/caseSignature.ts обрізає пробіли перед
-- регексом), а в базу йшло початкове значення. Через це в records живуть пари
-- на кшталт «AGAD ML 1/10/0/6/19» і «AGAD  ML 1/10/0/6/19», які для бази є
-- різними справами.
--
-- Наслідок видно на /case: сторінка шукає точним збігом (.eq('case_signature')),
-- тож справа розпадається на дві-три сторінки, і населені пункти однієї справи
-- не показуються разом. Те саме ламає перевірку дублікатів
-- (findDuplicateVerifiedRecord) і обмеження unique_inventory_verified_record:
-- запис із зайвим пробілом просто не бачить свого двійника.
--
-- Стан робочої бази на 06.08.2026 (15 251 запис у records):
--   222 рядки  — шифр із зайвими пробілами (56 по краях, решта — подвоєні
--                всередині),
--    33 рядки  — те саме в additional_case_signature,
--    12 СПРАВ  — розірвано на два-три варіанти:
--                «AGAD ML 1/10/0/6/19»                         → 154 записи,
--                «AGAD ASK LVI 1/7/0/11/49» (3 варіанти)       →  56,
--                «AGAD ASK 1/7/0/11/250»                       →  44,
--                «АЮЗР Ч.6-Т.2»                                →  38,
--                «AGAD ASK LVI 1/7/0/11/50»                    →  32,
--                «ANK AS 29/637/0/1.2/2126»                    →  27,
--                «MNK Biblioteka Czartoryskich sygn. 7730-7781»→  20,
--                «ANK AS 29/637/0/1.2/1154»                    →  16,
--                «ANK AS 29/637/0/1.2/1144»                    →   6,
--                «AGAD APzR 1/334/0/-/19»                      →   5,
--                «ANK ZZG 29/678/0/3/530»                      →   5,
--                «AGAD AWR 1/354/0/25/2079»                    →   4.
--   Унікальних шифрів стане 6344 замість 6357 — зникає 13 привидів.
--
--   records_unverified і records_edit на цю дату порожні, тож фактично міграція
--   чіпає лише records. Update для них лишається: між підготовкою і запуском
--   у чергах можуть зʼявитися нові рядки.
--
-- Щоб не наросло знову, шифр нормалізується в коді на КОЖНОМУ шляху запису —
-- normalizeSignature / normalizeSignatureFields у lib/caseSignature.ts. Ця
-- міграція лише прибирає те, що вже накопичилось; жодних тригерів і функцій
-- у базі вона не лишає.
--
-- Перевірено заздалегідь на знімку робочої бази:
--   • колізій нормалізація не створює — після згортання пробілів жодна пара не
--     збігається за ключем unique_inventory_verified_record (шифр + населений
--     пункт + рік), тож UPDATE не впаде на 23505;
--   • жоден із рядків, які оновлюються, не порушує NOT VALID обмежень
--     records_foreign_archive_has_no_parts і records_signature_matches_parts
--     (див. 2026-07-23_case_signature_consistency.sql) — інакше UPDATE по
--     такому рядку заблокувало б саме обмеження.
--
-- Останнє — причина, чому КОЖЕН update нижче має умову IS DISTINCT FROM.
-- Це не оптимізація: безумовний бекфіл додаткових шифрів зачепив би 920 рядків
-- замість 33 і міг би впасти на неузгодженому рядку, якого ця міграція
-- взагалі не стосується.

-- ===========================================================================
-- ДІАГНОСТИКА — виконати ОКРЕМО, ДО міграції.
--
-- Числа у шапці зняті з бази 06.08.2026. Запити нижче показують те саме на
-- актуальних даних: що саме і на що буде замінено, і чи безпечно.
-- Пробільні символи в результатах показані як «·» — щоб «AGAD··ML» відрізнявся
-- від «AGAD·ML», а табуляція та краї рядка взагалі були видимі.
--
-- Очікувані результати (якщо дані не змінились):
--   1 → records: 222 / 33; records_unverified і records_edit: 0 / 0
--   2 → 31 пара «було → стане». Найчастіші:
--         92 × AGAD··AZ··1/358/0/-/2978    → AGAD·AZ·1/358/0/-/2978
--         16 × AGAD·ASK·LVI··1/7/0/11/50   → AGAD·ASK·LVI·1/7/0/11/50
--         16 × AGAD·ASK··LVI··1/7/0/11/49  → AGAD·ASK·LVI·1/7/0/11/49
--         12 × AGAD·1/350/0/-/53-04·       → AGAD·1/350/0/-/53-04
--         11 × АЮЗР·Ч.1-Т.1·               → АЮЗР·Ч.1-Т.1
--   3 → 2 пари для додаткових шифрів:
--         32 × Старий·шифр·-··ASang·rkps·65 → Старий·шифр·-·ASang·rkps·65
--          1 × ·НАРБ·ф.694·оп.4-І·спр.·771 → НАРБ·ф.694·оп.4-І·спр.·771
--       (у другої пари попереду ТАБУЛЯЦІЯ, а не пробіл — саме тому і правило,
--        і показ у діагностиці працюють з \s, а не з ' ')
--   4 → 12 рядків (перелік у шапці)
--   5 → 0 рядків  ← якщо не 0, МІГРАЦІЮ НЕ ЗАПУСКАТИ, розбирати вручну
--   6 → 0 рядків  ← те саме
-- ===========================================================================
--
-- 1. СКІЛЬКИ РЯДКІВ БУДЕ ЗАЧЕПЛЕНО:
--
--   with n as (
--     select 'records' as tbl, case_signature as sig, additional_case_signature as add_sig
--       from public.records
--     union all select 'records_unverified', case_signature, additional_case_signature
--       from public.records_unverified
--     union all select 'records_edit', case_signature, additional_case_signature
--       from public.records_edit
--   )
--   select tbl,
--          count(*) filter (
--            where sig is distinct from
--                  nullif(btrim(regexp_replace(coalesce(sig,''), '\s+', ' ', 'g')), '')
--          ) as sig_rows,
--          count(*) filter (
--            where add_sig is distinct from nullif(array(
--                    select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
--                      from unnest(add_sig) with ordinality as t(item, ord)
--                     where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
--                     order by t.ord), '{}'::text[])
--          ) as add_sig_rows
--     from n group by tbl order by tbl;
--
-- 2. ЩО НА ЩО БУДЕ ЗАМІНЕНО — шифр справи, згруповано за значенням:
--
--   select regexp_replace(case_signature, '\s', '·', 'g') as було,
--          regexp_replace(
--            nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), ''),
--            '\s', '·', 'g') as стане,
--          count(*) as записів
--     from public.records
--    where case_signature is distinct from
--          nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '')
--    group by 1, 2
--    order by 3 desc, 1;
--
--   (те саме для public.records_unverified і public.records_edit)
--
-- 3. ЩО НА ЩО БУДЕ ЗАМІНЕНО — додаткові шифри, поелементно:
--
--   select regexp_replace(t.item, '\s', '·', 'g') as було,
--          regexp_replace(
--            nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), ''), '\s', '·', 'g') as стане,
--          count(*) as записів
--     from public.records r,
--          unnest(r.additional_case_signature) as t(item)
--    where t.item is distinct from nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
--    group by 1, 2
--    order by 3 desc, 1;
--
-- 4. ЯКІ СПРАВИ ЗʼЄДНАЮТЬСЯ (очікується 12 рядків):
--
--   with n as (
--     select nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '') as norm,
--            case_signature as raw
--       from public.records
--      where case_signature is not null
--   )
--   select regexp_replace(norm, '\s', '·', 'g') as справа_після,
--          count(distinct raw)     as варіантів_зараз,
--          count(*)                as записів_разом,
--          string_agg(distinct regexp_replace(raw, '\s', '·', 'g'), '  |  ') as варіанти
--     from n group by norm having count(distinct raw) > 1
--    order by count(*) desc;
--
-- 5. БЕЗПЕКА: чи не зіткнуться записи на unique_inventory_verified_record.
--    МАЄ ПОВЕРНУТИ 0 РЯДКІВ. Якщо ні — розбирати вручну ДО міграції:
--
--   select current_region, current_district, current_community,
--          current_settlement_type, current_settlement_name,
--          old_settlement_type, old_settlement_name, norm, inventory_year, count(*)
--     from (select r.*,
--                  nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '') as norm
--             from public.records r) t
--    group by 1,2,3,4,5,6,7,8,9
--   having count(*) > 1;
--
-- 6. БЕЗПЕКА: чи не впаде update на NOT VALID обмеженнях
--    (records_foreign_archive_has_no_parts / records_signature_matches_parts).
--    МАЄ ПОВЕРНУТИ 0 РЯДКІВ:
--
--   select id, regexp_replace(case_signature, '\s', '·', 'g') as шифр, is_ukrainian_archive,
--          archive, fonds, series, record
--     from public.records
--    where case_signature is distinct from
--          nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '')
--      and (
--        (is_ukrainian_archive = 'Ні'
--         and (btrim(coalesce(archive,'')) <> '' or btrim(coalesce(fonds,'')) <> ''
--           or btrim(coalesce(series,'')) <> '' or btrim(coalesce(record,'')) <> ''))
--        or (btrim(coalesce(archive,'')) <> '' and btrim(coalesce(fonds,'')) <> ''
--        and btrim(coalesce(series,'')) <> '' and btrim(coalesce(record,'')) <> ''
--        and nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '')
--            is distinct from btrim(archive) || ' ' || btrim(fonds) || '-'
--                             || btrim(series) || '-' || btrim(record))
--      );
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- Шифр справи.
--
-- Правило: обрізати краї + згорнути будь-які повтори пробільних символів в один
-- пробіл; порожній результат → NULL, щоб «   » не лишався рядком із пробілів і
-- не відрізнявся від справді порожнього поля. Те саме робить normalizeSignature
-- у lib/caseSignature.ts.
-- ---------------------------------------------------------------------------

update public.records
   set case_signature =
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '')
 where case_signature is distinct from
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '');

update public.records_unverified
   set case_signature =
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '')
 where case_signature is distinct from
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '');

update public.records_edit
   set case_signature =
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '')
 where case_signature is distinct from
       nullif(btrim(regexp_replace(coalesce(case_signature, ''), '\s+', ' ', 'g')), '');

-- ---------------------------------------------------------------------------
-- Додаткові шифри — масив text[]: нормалізуємо кожен елемент, порожні
-- відкидаємо, порожній результат → NULL (як fromSignatureList у коді).
-- Порядок елементів зберігаємо через ordinality.
-- ---------------------------------------------------------------------------

update public.records
   set additional_case_signature = nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       )
 where additional_case_signature is distinct from nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       );

update public.records_unverified
   set additional_case_signature = nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       )
 where additional_case_signature is distinct from nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       );

update public.records_edit
   set additional_case_signature = nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       )
 where additional_case_signature is distinct from nullif(
         array(
           select nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '')
             from unnest(additional_case_signature) with ordinality as t(item, ord)
            where nullif(btrim(regexp_replace(t.item, '\s+', ' ', 'g')), '') is not null
            order by t.ord
         ),
         '{}'::text[]
       );

commit;

-- ---------------------------------------------------------------------------
-- ПЕРЕВІРКА після виконання — має дати 0 у кожному рядку:
--
--   select 'records' as t, count(*) from public.records
--    where case_signature is distinct from
--          nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '')
--   union all
--   select 'records_unverified', count(*) from public.records_unverified
--    where case_signature is distinct from
--          nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '')
--   union all
--   select 'records_edit', count(*) from public.records_edit
--    where case_signature is distinct from
--          nullif(btrim(regexp_replace(coalesce(case_signature,''), '\s+', ' ', 'g')), '');
--
-- Справи, що мали зʼєднатися — має бути 12 рядків, кожен в одному варіанті:
--
--   select case_signature, count(*) from public.records
--    where case_signature in (
--      'AGAD ML 1/10/0/6/19', 'AGAD ASK LVI 1/7/0/11/49', 'AGAD ASK 1/7/0/11/250',
--      'АЮЗР Ч.6-Т.2', 'AGAD ASK LVI 1/7/0/11/50', 'ANK AS 29/637/0/1.2/2126',
--      'MNK Biblioteka Czartoryskich sygn. 7730-7781', 'ANK AS 29/637/0/1.2/1154',
--      'ANK AS 29/637/0/1.2/1144', 'AGAD APzR 1/334/0/-/19',
--      'ANK ZZG 29/678/0/3/530', 'AGAD AWR 1/354/0/25/2079')
--    group by 1 order by 2 desc;
--
-- Відкату немає: зайві пробіли втрачаються назавжди, але вони й не несли змісту.
-- ---------------------------------------------------------------------------
