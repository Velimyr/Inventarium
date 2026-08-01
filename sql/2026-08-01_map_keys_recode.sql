-- Перепривʼязка ключів після перевидання дубльованих кодів.
--
-- У старому довіднику сім кодів SG…135–141 належали ОДРАЗУ ДВОМ селам —
-- одному з Ліського/Кросненського повіту і одному з Перемишльського.
-- У новому довіднику код лишився за першим, а перемишльські отримали
-- SG…200–206. Ключі, подані раніше, тримають старий код, тож точки
-- перемишльських сіл тепер вказують на чуже село.
--
-- Виконати ПІСЛЯ підміни region_structure.json, разом із міграцією records.
-- Точки з кросненського боку («Риманівський ключ») правити не треба:
-- їхні коди лишилися їхніми.

BEGIN;

CREATE TEMP TABLE key_recode (old_code text, name text, new_code text) ON COMMIT DROP;

INSERT INTO key_recode VALUES
    ('SG00000000000000135', 'Холовичі',   'SG00000000000000200'),
    ('SG00000000000000136', 'Грибів',     'SG00000000000000201'),
    ('SG00000000000000137', 'Медика',     'SG00000000000000202'),
    ('SG00000000000000138', 'Торки',      'SG00000000000000203'),
    ('SG00000000000000139', 'Вітошинці',  'SG00000000000000204'),
    ('SG00000000000000140', 'Конюшки',    'SG00000000000000205'),
    ('SG00000000000000141', 'Лешно',      'SG00000000000000206');

-- 1. Що буде змінено (виконати й звірити зі звітом)
SELECT k.id, k.name AS key_name, 'центр' AS place, k.center->>'name' AS settlement,
       k.center->>'code' AS old_code, f.new_code
FROM map_keys k JOIN key_recode f
  ON f.old_code = k.center->>'code' AND f.name = k.center->>'name'
UNION ALL
SELECT k.id, k.name, 'точка', p->>'name', p->>'code', f.new_code
FROM map_keys k, jsonb_array_elements(k.points) p
JOIN key_recode f ON f.old_code = p->>'code' AND f.name = p->>'name';

-- 2. Центр ключа
UPDATE map_keys k
SET center = jsonb_set(k.center, '{code}', to_jsonb(f.new_code))
FROM key_recode f
WHERE f.old_code = k.center->>'code' AND f.name = k.center->>'name';

-- 3. Точки ключа: перебираємо масив, підміняємо код лише в потрібних елементах
UPDATE map_keys k
SET points = (
    SELECT jsonb_agg(
        COALESCE(
            (SELECT jsonb_set(p, '{code}', to_jsonb(f.new_code))
             FROM key_recode f
             WHERE f.old_code = p->>'code' AND f.name = p->>'name'),
            p
        ) ORDER BY ord
    )
    FROM jsonb_array_elements(k.points) WITH ORDINALITY AS t(p, ord)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(k.points) p
    JOIN key_recode f ON f.old_code = p->>'code' AND f.name = p->>'name'
);

-- 4. Перевірка: старих кодів у перемишльських точках більше немає
SELECT k.name, p->>'name' AS settlement, p->>'code' AS code
FROM map_keys k, jsonb_array_elements(k.points) p
JOIN key_recode f ON f.old_code = p->>'code' AND f.name = p->>'name';

-- === Точки, що вказують на зведені дублі ====================================
-- Два пункти прибрано при зведенні різнописань, ключі досі тримають їхні коди.
-- Перепривʼязуємо на пункт, що лишився: міняємо код, назву й тип.
-- Координати НЕ чіпаємо — вони визначають контур ключа, а розбіжність тут
-- 0.27 км і 0.00 км.

CREATE TEMP TABLE key_repoint (old_code text, new_code text, new_name text, new_type text) ON COMMIT DROP;

INSERT INTO key_repoint VALUES
    ('ZK10000000000000009', 'SG00000000000000009', 'Любича Королівська', 'місто'),
    ('ZK30000000000000092', 'ZK30000000000000132', 'Гута Кришталева',    'село');

-- 5. Що буде змінено
SELECT k.name AS key_name, p->>'name' AS was, r.new_name AS becomes, p->>'code' AS old_code, r.new_code
FROM map_keys k, jsonb_array_elements(k.points) p
JOIN key_repoint r ON r.old_code = p->>'code';

-- 6. Підміна в точках
UPDATE map_keys k
SET points = (
    SELECT jsonb_agg(
        COALESCE(
            (SELECT p || jsonb_build_object('code', r.new_code, 'name', r.new_name, 'type', r.new_type)
             FROM key_repoint r WHERE r.old_code = p->>'code'),
            p
        ) ORDER BY ord
    )
    FROM jsonb_array_elements(k.points) WITH ORDINALITY AS t(p, ord)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(k.points) p
    JOIN key_repoint r ON r.old_code = p->>'code'
);

-- 7. Те саме для центру, якщо колись трапиться
UPDATE map_keys k
SET center = k.center || jsonb_build_object('code', r.new_code, 'name', r.new_name, 'type', r.new_type)
FROM key_repoint r
WHERE r.old_code = k.center->>'code';

COMMIT;

-- Лишається одна точка без відповідника, і це свідоме рішення: «Ягорлицький
-- ключ», точка 13 — село Лопатна BS10000000000000021 (47.493843, 29.051314).
-- Пункт випав із нового експорту довідника: у BS-серії код …021 просто
-- відсутній між Журою (…020) і Михайлівкою (…022). Найближче село — Жура за
-- 2.8 км, але вона вже є окремою точкою цього ж ключа, тож підміняти не можна.
--
-- Точку ЛИШАЄМО як є: контур ключа й координати збережені, не працюватиме лише
-- перехід на сторінку поселення з цієї точки та лічильник інвентарів по ній.
-- Якщо Лопатна колись повернеться в довідник із тим самим кодом — точка
-- запрацює сама, нічого доробляти не доведеться.
