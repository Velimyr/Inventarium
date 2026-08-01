// Видаляє повторні записи одного й того самого населеного пункту.
//
// Дублем вважається однакова назва в межах одного вузла довідника, у якої
// всі записи лежать не далі --max-km один від одного. Тезки (те саме ім'я,
// але різні місця за десятки кілометрів) не чіпаються — саме тому поріг
// обов'язковий, а типовий вузький.
//
//   node scripts/dedupe-duplicate-settlements.mjs [шлях] --country=Польща [--max-km=1]
//                                                 [--dry-run] [--out=файл]
//
// Який запис лишається:
//   1) той, що має координати;
//   2) серед них — із конкретнішим типом (місто > містечко > селище > село);
//   3) за рівності — перший у файлі.
// Записи без координат не видаляються ніколи: їх не можна звірити з іншими.

import { readFileSync, writeFileSync } from 'node:fs';

const TYPE_RANK = { 'місто': 3, 'містечко': 2, 'селище': 1, 'село': 0 };

const arg = (name, fallback) => {
    const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const km = (a, b) => Math.hypot(a.lat - b.lat, a.lon - b.lon) * 111;
const hasCoords = (s) => typeof s.lat === 'number' && typeof s.lon === 'number';

function* districtNodes(node, path = []) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (Object.values(node).some(Array.isArray)) {
        yield { path, node };
        return;
    }
    for (const [key, child] of Object.entries(node)) {
        yield* districtNodes(child, [...path, key]);
    }
}

function main() {
    const dryRun = process.argv.includes('--dry-run');
    const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'public/data/region_structure.json';
    const country = arg('country');
    const maxKm = Number(arg('max-km', '1'));
    const out = arg('out', file);

    if (!country) {
        console.error('Вкажи країну: --country=Польща');
        process.exit(1);
    }

    const data = JSON.parse(readFileSync(file, 'utf8'));
    const scope = data[country];
    if (!scope) {
        console.error(`У файлі немає країни «${country}». Є: ${Object.keys(data).join(', ')}`);
        process.exit(1);
    }

    const removed = [];
    const skipped = [];

    for (const { path, node } of districtNodes(scope, [country])) {
        for (const [community, settlements] of Object.entries(node)) {
            if (!Array.isArray(settlements)) continue;

            const byName = new Map();
            for (const s of settlements) {
                if (!byName.has(s.name)) byName.set(s.name, []);
                byName.get(s.name).push(s);
            }

            const drop = new Set();
            for (const [name, group] of byName) {
                if (group.length < 2) continue;

                const withCoords = group.filter(hasCoords);
                if (withCoords.length < group.length) {
                    skipped.push({ path, community, name, why: 'є записи без координат' });
                    continue;
                }

                const spread = Math.max(...group.flatMap((a) => group.map((b) => km(a, b))));
                if (spread > maxKm) {
                    skipped.push({ path, community, name, why: `розкид ${spread.toFixed(2)} км > ${maxKm}` });
                    continue;
                }

                const keep = group.reduce((best, s) =>
                    (TYPE_RANK[s.type] ?? -1) > (TYPE_RANK[best.type] ?? -1) ? s : best);

                for (const s of group) {
                    if (s === keep) continue;
                    drop.add(s);
                    removed.push({ path, community, name, keep, dropped: s, spread });
                }
            }

            if (drop.size) node[community] = settlements.filter((s) => !drop.has(s));
        }
    }

    const groups = new Set(removed.map((r) => `${r.path.join('/')}/${r.community}/${r.name}`));
    console.log(`${file} · країна: ${country} · поріг: ${maxKm} км`);
    console.log(`Видалити: ${removed.length} записів у ${groups.size} групах\n`);

    let last = '';
    for (const r of removed) {
        const head = `${r.path.join(' / ')}`;
        if (head !== last) { console.log(head); last = head; }
        console.log(
            `    ${r.name}: прибрано ${r.dropped.type} ${r.dropped.code}` +
            `, лишається ${r.keep.type} ${r.keep.code}` +
            (r.spread > 0.05 ? `  (${r.spread.toFixed(2)} км)` : ''),
        );
    }

    if (skipped.length) {
        console.log('\nПропущено (потребує ручного рішення):');
        for (const s of skipped) console.log(`    ${s.path.join(' / ')} / ${s.name} — ${s.why}`);
    }

    if (dryRun) {
        console.log('\n--dry-run: файл не змінено');
        return;
    }

    writeFileSync(out, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n${out} записано`);
}

main();
