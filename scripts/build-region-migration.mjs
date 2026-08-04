// Будує SQL-міграцію значень адмінподілу в records під новий довідник.
//
// Записи зберігають не код населеного пункту, а назви (current_region,
// current_district, current_community, current_settlement_type/name), і всі вони
// змінилися: додалося слово-тип («Вінницька» → «Вінницька область»), а стара
// область «Українські етнічні землі» розклалася по країнах. Тому відповідність
// будуємо, зʼєднавши старий і новий довідники ЗА КОДОМ пункту — код є в обох
// файлах, хоч і не зберігається в записах.
//
//   node scripts/build-region-migration.mjs [--ref=<git-ref>] [--out=<файл.sql>]
//
// Старий довідник береться з git (типово — коміт перед заміною файлу).
// Скрипт нічого не змінює: лише пише .sql і друкує звіт.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
    const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const REF = arg('ref', '59e0c4b');
const FILE = 'public/data/region_structure.json';
const OUT = arg('out', 'sql/2026-08-01_region_structure_migration.sql');

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

// Зведення апострофів до «’» у SQL-порівняннях: у записах трапляються ' ` ʼ ´
const N = (col) => `translate(${col}, '''\`ʼ´', '’’’’')`;

/** Пласкі записи довідника: код → { path: [...рівні], item }. */
function flatten(node, path = [], out = new Map()) {
    if (Array.isArray(node)) {
        for (const item of node) out.set(item.code, { path, item });
        return out;
    }
    for (const [key, child] of Object.entries(node)) flatten(child, [...path, key], out);
    return out;
}

const oldTree = JSON.parse(execFileSync('git', ['show', `${REF}:${FILE}`], { maxBuffer: 1 << 30, encoding: 'utf8' }));
const newTree = JSON.parse(readFileSync(FILE, 'utf8'));

const OLD = flatten(oldTree);   // path = [область, район, громада]
const NEW = flatten(newTree);   // path = [країна, область, район, громада]

// --- 1. Які старі трійки куди ведуть -----------------------------------------

const targets = new Map();      // "обл|район|громада" → Set("країна|обл|район|громада")
const pairs = [];               // усі пари старий→новий запис

for (const [code, o] of OLD) {
    const n = NEW.get(code);
    if (!n) continue;
    const key = o.path.join('|');
    if (!targets.has(key)) targets.set(key, new Set());
    targets.get(key).add(n.path.join('|'));
    pairs.push({ o, n });
}

const diverging = new Set([...targets].filter(([, v]) => v.size > 1).map(([k]) => k));

// --- 2. Три таблиці відповідностей -------------------------------------------

// A. трійка → новий шлях (для трійок з єдиним призначенням)
const regionMap = new Map();
// B. пʼятірка (трійка + тип + назва) → новий шлях і назва (для «розхідних» трійок)
const settlementMap = new Map();
// C. перейменування/зміна типу всередині трійок з таблиці A
const nameFix = new Map();

for (const { o, n } of pairs) {
    const key = o.path.join('|');
    const [country, region, district, community] = n.path;

    if (diverging.has(key)) {
        const k = [...o.path, o.item.type, o.item.name].join('|');
        settlementMap.set(k, { old: o, country, region, district, community, name: n.item.name, type: n.item.type });
        continue;
    }

    regionMap.set(key, { old: o.path, country, region, district, community });

    if (o.item.name !== n.item.name || o.item.type !== n.item.type) {
        const k = [...o.path, o.item.type, o.item.name].join('|');
        nameFix.set(k, { old: o, name: n.item.name, type: n.item.type });
    }
}

const missing = [...OLD].filter(([code]) => !NEW.has(code));

/**
 * Ручні відповідності: пункти, яких у новому довіднику немає під старою назвою.
 * Частина — наслідок зведення різнописань і дублів, частина — перевидані коди,
 * «Перевали» — коротка форма «Перевалля». Ціль задана КОДОМ: шлях і назву
 * підтягуємо з чинного довідника, щоб рядки не застаріли при наступному експорті.
 */
const MANUAL = [
    { region: 'Українські етнічні землі', district: 'Надсяння',   type: 'містечко', name: 'Липське',        to: 'ZK30000000000000057' },
    { region: 'Українські етнічні землі', district: 'Підляшшя',   type: 'село',     name: 'Славатичі',      to: 'ZK20000900000000003' },
    { region: 'Українські етнічні землі', district: 'Холмщина',   type: 'село',     name: 'Тишівці',        to: 'SG11000000000000089' },
    { region: 'Українські етнічні землі', district: 'Холмщина',   type: 'село',     name: 'Любича',         to: 'SG00000000000000009' },
    { region: 'Українські етнічні землі', district: 'Холмщина',   type: 'село',     name: 'Перевали',       to: 'ZK10000000000000015' },
    { region: 'Українські етнічні землі', district: 'Лемківщина', type: 'село',     name: 'Вислок Великий', to: 'SG11000000000000129' },
    { region: 'Українські етнічні землі', district: 'Підляшшя',   type: 'місто',    name: 'Більськ',        to: 'ZK200030000000000X6' },
];

const manual = [];
for (const m of MANUAL) {
    const target = NEW.get(m.to);
    if (!target) { console.log(`   ! ручна відповідність: код ${m.to} (${m.name}) відсутній у довіднику — пропущено`); continue; }
    manual.push({ ...m, path: target.path, item: target.item });
}

// --- 3. SQL -------------------------------------------------------------------

const rowsA = [...regionMap.values()].map(
    (r) => `    (${q(r.old[0])}, ${q(r.old[1])}, ${q(r.old[2])}, ${q(r.country)}, ${q(r.region)}, ${q(r.district)}, ${q(r.community)})`,
);
const rowsB = [...settlementMap.values()].map(
    (r) => `    (${q(r.old.path[0])}, ${q(r.old.path[1])}, ${q(r.old.path[2])}, ${q(r.old.item.type)}, ${q(r.old.item.name)}, ` +
           `${q(r.country)}, ${q(r.region)}, ${q(r.district)}, ${q(r.community)}, ${q(r.name)}, ${q(r.type)})`,
);
const rowsC = [...nameFix.values()].map(
    (r) => `    (${q(r.old.path[0])}, ${q(r.old.path[1])}, ${q(r.old.path[2])}, ${q(r.old.item.type)}, ${q(r.old.item.name)}, ${q(r.name)}, ${q(r.type)})`,
);

// Коди, які зникли або дісталися іншому пункту: прив'язки по коду можуть осиротіти
const reissued = ['SG00000000000000125', 'SG00000000000000135', 'SG00000000000000136',
    'SG00000000000000137', 'SG00000000000000138', 'SG00000000000000139',
    'SG00000000000000140', 'SG00000000000000141'];
const watchCodes = [...missing.map(([code]) => code), ...reissued];

const sql = `-- Міграція адмінподілу в records під новий довідник (${FILE}).
-- Згенеровано scripts/build-region-migration.mjs зі старого довідника ${REF}.
-- НЕ редагувати вручну — перегенерувати скриптом.
--
-- Порядок важливий: спершу правки назв (вони ключуються за СТАРОЮ трійкою),
-- потім самі трійки, потім «розхідні» (Українські етнічні землі).

-- === 0. Схема ================================================================
-- Країна потрібна в усіх трьох таблицях: форма пише в records_unverified,
-- звідки запис переїжджає в records при підтвердженні.

ALTER TABLE records            ADD COLUMN IF NOT EXISTS current_country text;
ALTER TABLE records_unverified ADD COLUMN IF NOT EXISTS current_country text;
ALTER TABLE records_edit       ADD COLUMN IF NOT EXISTS current_country text;

-- === 1. Прив'язки по коду ====================================================
-- ${missing.length} кодів зникли з довідника, ${reissued.length} дісталися іншому пункту.
-- Ключі та підписки тримаються за код, тож перед міграцією варто переконатися,
-- що вони цього не зачепили. Обидва запити мають повернути порожньо.

SELECT id, name, center->>'code' AS code, 'center' AS where_
FROM map_keys WHERE center->>'code' IN (${watchCodes.map(q).join(', ')})
UNION ALL
SELECT k.id, k.name, p->>'code', 'points'
FROM map_keys k, jsonb_array_elements(k.points) p
WHERE p->>'code' IN (${watchCodes.map(q).join(', ')});

SELECT id, settlement_code, status
FROM settlement_subscription
WHERE settlement_code IN (${watchCodes.map(q).join(', ')});

-- === 2. Значення адмінподілу =================================================

BEGIN;

CREATE TEMP TABLE region_map (
    old_region text, old_district text, old_community text,
    country text, region text, district text, community text
) ON COMMIT DROP;

INSERT INTO region_map VALUES
${rowsA.join(',\n')};

CREATE TEMP TABLE settlement_map (
    old_region text, old_district text, old_community text, old_type text, old_name text,
    country text, region text, district text, community text, name text, type text
) ON COMMIT DROP;

INSERT INTO settlement_map VALUES
${rowsB.join(',\n')};

CREATE TEMP TABLE name_fix (
    old_region text, old_district text, old_community text, old_type text, old_name text,
    name text, type text
) ON COMMIT DROP;

INSERT INTO name_fix VALUES
${rowsC.join(',\n')};

CREATE TEMP TABLE manual_map (
    old_region text, old_district text, old_type text, old_name text,
    country text, region text, district text, community text, name text, type text
) ON COMMIT DROP;

INSERT INTO manual_map VALUES
${manual.map(m => `    (${q(m.region)}, ${q(m.district)}, ${q(m.type)}, ${q(m.name)}, ` +
    `${q(m.path[0])}, ${q(m.path[1])}, ${q(m.path[2])}, ${q(m.path[3])}, ${q(m.item.name)}, ${q(m.item.type)})`).join(',\n')};

-- Обмеження з sql/2026-07-23_case_signature_consistency.sql додані як NOT VALID:
-- наявні рядки вони не перевіряли, але блокують будь-який UPDATE по них — і по
-- наших теж. Знімаємо на час міграції й повертаємо нижче точно такими самими,
-- теж NOT VALID. Семантика не змінюється: для нових записів вони діють як діяли.

ALTER TABLE records DROP CONSTRAINT IF EXISTS records_foreign_archive_has_no_parts;
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_signature_matches_parts;

-- 0. Скільки записів зачепить (виконати й запамʼятати числа).
--    Звіряємо так само, як самі UPDATE — через translate() з апострофами,
--    інакше підрахунок занижує на записи, що відрізняються лише апострофом.
SELECT 'по трійці' AS through, count(*) FROM records r JOIN region_map m
    ON ${N('r.current_region')} = ${N('m.old_region')}
   AND ${N('r.current_district')} = ${N('m.old_district')}
   AND ${N('r.current_community')} = ${N('m.old_community')}
UNION ALL
SELECT 'по пункту', count(*) FROM records r JOIN settlement_map m
    ON ${N('r.current_region')} = ${N('m.old_region')}
   AND ${N('r.current_district')} = ${N('m.old_district')}
   AND ${N('r.current_community')} = ${N('m.old_community')}
   AND r.current_settlement_type = m.old_type
   AND ${N('r.current_settlement_name')} = ${N('m.old_name')};

-- Порівнюємо назви з точністю до апострофа: у записах трапляються ' \` ʼ ´,
-- у довіднику всюди ’. Через це інакше не збігається, напр. «Кам\`янка-Бузька».

-- 1. Перейменовані пункти й виправлені типи всередині незмінних трійок
UPDATE records r
SET current_settlement_name = f.name, current_settlement_type = f.type
FROM name_fix f
WHERE ${N('r.current_region')} = ${N('f.old_region')}
  AND ${N('r.current_district')} = ${N('f.old_district')}
  AND ${N('r.current_community')} = ${N('f.old_community')}
  AND r.current_settlement_type = f.old_type
  AND ${N('r.current_settlement_name')} = ${N('f.old_name')};

-- 2. Основна маса: трійка → країна + нові назви рівнів
UPDATE records r
SET current_country = m.country, current_region = m.region,
    current_district = m.district, current_community = m.community
FROM region_map m
WHERE ${N('r.current_region')} = ${N('m.old_region')}
  AND ${N('r.current_district')} = ${N('m.old_district')}
  AND ${N('r.current_community')} = ${N('m.old_community')};

-- 3. «Українські етнічні землі» — призначення залежить від самого пункту
UPDATE records r
SET current_country = m.country, current_region = m.region,
    current_district = m.district, current_community = m.community,
    current_settlement_name = m.name, current_settlement_type = m.type
FROM settlement_map m
WHERE ${N('r.current_region')} = ${N('m.old_region')}
  AND ${N('r.current_district')} = ${N('m.old_district')}
  AND ${N('r.current_community')} = ${N('m.old_community')}
  AND r.current_settlement_type = m.old_type
  AND ${N('r.current_settlement_name')} = ${N('m.old_name')};

-- 3a. Резерв для записів, де громада порожня або застаріла («Холмська земля»,
--     «Любачівщина»): зіставляємо без громади — за областю, районом, типом і
--     назвою. Беремо лише ті пари, що ведуть рівно в один новий вузол; решта
--     лишається на ручний розбір.
UPDATE records r
SET current_country = f.country, current_region = f.region,
    current_district = f.district, current_community = f.community,
    current_settlement_name = f.name, current_settlement_type = f.type
FROM (
    SELECT old_region, old_district, old_type, old_name,
           min(country) AS country, min(region) AS region, min(district) AS district,
           min(community) AS community, min(name) AS name, min(type) AS type
    FROM settlement_map
    GROUP BY old_region, old_district, old_type, old_name
    HAVING count(DISTINCT country || '|' || region || '|' || district || '|' || community) = 1
) f
WHERE r.current_country IS NULL
  AND ${N('r.current_region')} = ${N('f.old_region')}
  AND ${N('r.current_district')} = ${N('f.old_district')}
  AND r.current_settlement_type = f.old_type
  AND ${N('r.current_settlement_name')} = ${N('f.old_name')};

-- 3b. Ручні відповідності: пункти, зведені як дублі, з перевиданим кодом або
--     записані коротшою назвою («Перевали» → «Перевалля»). Ключ — область,
--     район, тип і назва; громаду не звіряємо з тієї самої причини, що в 3a.
UPDATE records r
SET current_country = m.country, current_region = m.region,
    current_district = m.district, current_community = m.community,
    current_settlement_name = m.name, current_settlement_type = m.type
FROM manual_map m
WHERE r.current_country IS NULL
  AND ${N('r.current_region')} = ${N('m.old_region')}
  AND ${N('r.current_district')} = ${N('m.old_district')}
  AND r.current_settlement_type = m.old_type
  AND ${N('r.current_settlement_name')} = ${N('m.old_name')};

-- 4. Повертаємо обмеження в тому вигляді, в якому вони були
ALTER TABLE records
  ADD CONSTRAINT records_signature_matches_parts CHECK (
    btrim(coalesce(archive, '')) = ''
    or btrim(coalesce(fonds,  '')) = ''
    or btrim(coalesce(series, '')) = ''
    or btrim(coalesce(record, '')) = ''
    or btrim(coalesce(case_signature, '')) =
       btrim(archive) || ' ' || btrim(fonds) || '-' || btrim(series) || '-' || btrim(record)
  ) NOT VALID;

ALTER TABLE records
  ADD CONSTRAINT records_foreign_archive_has_no_parts CHECK (
    is_ukrainian_archive is distinct from 'Ні'
    or (btrim(coalesce(archive, '')) = ''
        and btrim(coalesce(fonds,  '')) = ''
        and btrim(coalesce(series, '')) = ''
        and btrim(coalesce(record, '')) = '')
  ) NOT VALID;

-- 5. Що НЕ змапилося — на ручний розбір (має лишитися порожнім або містити
--    лише записи, введені вручну через manualEntry)
SELECT id, current_region, current_district, current_community,
       current_settlement_type, current_settlement_name
FROM records
WHERE current_country IS NULL
  AND coalesce(current_region, '') <> '';

COMMIT;
`;

writeFileSync(OUT, sql, 'utf8');

// --- 4. Звіт ------------------------------------------------------------------

console.log(`старий довідник: ${REF} — ${OLD.size} кодів | новий: ${NEW.size}`);
console.log(`збіглося за кодом: ${pairs.length}`);
console.log(`\nтаблиці відповідностей:`);
console.log(`   region_map      ${rowsA.length} рядків (трійка → новий шлях)`);
console.log(`   settlement_map  ${rowsB.length} рядків (пункти «розхідних» трійок)`);
console.log(`   name_fix        ${rowsC.length} рядків (перейменування й типи)`);
console.log(`\n«розхідні» трійки (${diverging.size}):`);
for (const key of diverging) console.log(`   ${key.split('|').join(' / ')} → ${targets.get(key).size} нових шляхів`);

console.log(`\nкоди, яких немає в новому довіднику: ${missing.length}`);
const byPath = new Map();
for (const [code, o] of missing) {
    const k = o.path.join(' / ');
    if (!byPath.has(k)) byPath.set(k, []);
    byPath.get(k).push(`${o.item.name} [${code}]`);
}
for (const [path, names] of byPath) console.log(`   ${path}: ${names.length}\n      ${names.join(', ')}`);

console.log(`\n${OUT} записано`);
