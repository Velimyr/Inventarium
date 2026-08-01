// Зводить пари записів, що описують той самий населений пункт під різними
// написаннями. По назві вони не ловляться, тому пари задані явно — кожна
// перевірена по координатах перед видаленням.
//
//   node scripts/merge-spelling-variants.mjs [шлях] [--dry-run]
//
// Що лишається: повніша форма назви (з уточненням), за рівності — конкретніший
// тип (місто > містечко > селище > село), за рівності — перший у файлі.

import { readFileSync, writeFileSync } from 'node:fs';

// keep / drop — коди записів; підпис пояснює вибір
const PAIRS = [
    { keep: 'SG11000000000000129', drop: 'SG11000000000000153', note: 'Вислік Великий ← Вислок Великий (перший у файлі)' },
    { keep: 'ZK30000000000000057', drop: 'SG00000000000000123', note: 'Ліпсько ← Липське (місто > містечко)' },
    { keep: 'ZK30000000000000064', drop: 'ZK10000000000000008', note: 'Махнів Старий ← Махнів (повніша форма)' },
    { keep: 'SG00000000000000009', drop: 'ZK10000000000000009', note: 'Любича Королівська ← Любича (повніша форма)' },
];

const MAX_KM = 1;
const km = (a, b) => Math.hypot(a.lat - b.lat, a.lon - b.lon) * 111;

function* communities(node, path = []) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const [key, child] of Object.entries(node)) {
        if (Array.isArray(child)) yield { path: [...path, key], list: child, parent: node, key };
        else yield* communities(child, [...path, key]);
    }
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'public/data/region_structure.json';
    const data = JSON.parse(readFileSync(file, 'utf8'));

    const index = new Map();
    for (const node of communities(data)) {
        for (const s of node.list) index.set(s.code, { ...node, settlement: s });
    }

    let done = 0;
    for (const pair of PAIRS) {
        const keep = index.get(pair.keep);
        const drop = index.get(pair.drop);

        if (!keep || !drop) {
            console.log(`ПРОПУЩЕНО ${pair.note}: не знайдено ${!keep ? pair.keep : pair.drop}`);
            continue;
        }
        if (keep.path.join('/') !== drop.path.join('/')) {
            console.log(`ПРОПУЩЕНО ${pair.note}: записи в різних вузлах`);
            continue;
        }
        const d = km(keep.settlement, drop.settlement);
        if (!(d < MAX_KM)) {
            console.log(`ПРОПУЩЕНО ${pair.note}: між точками ${d.toFixed(2)} км`);
            continue;
        }

        // Беремо поточний масив із батька, а не збережений в індексі:
        // дві пари можуть лежати в одній громаді, і друга затерла б першу
        drop.parent[drop.key] = drop.parent[drop.key].filter((s) => s !== drop.settlement);
        done++;
        console.log(
            `${drop.path.slice(0, -1).join(' / ')}\n` +
            `    лишається «${keep.settlement.name}» (${keep.settlement.type}) ${keep.settlement.code}\n` +
            `    прибрано  «${drop.settlement.name}» (${drop.settlement.type}) ${drop.settlement.code}  — ${d.toFixed(2)} км`,
        );
    }

    console.log(`\nЗведено пар: ${done} із ${PAIRS.length}`);
    if (dryRun) return console.log('--dry-run: файл не змінено');

    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`${file} записано`);
}

main();
