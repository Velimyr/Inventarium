// Довідник населених пунктів (/data/region_structure.json): типи, кеш, пошук.
//
// Структура має чотири рівні: країна → область → район → громада → [пункти].
// Назви рівнів уже містять слово-тип («Вінницька область», «Вінницький район»,
// «Липовецька громада»), тож дописувати його при показі не треба.
//
// Це єдине джерело довідника для всього застосунку: файл важить ~6 МБ, тому
// вантажимо його через fetchRegionStructure() — він кешує проміс на сесію.

import { normalizeApostrophes } from '../../lib/textSearch';

export interface Settlement {
    name: string;
    code: string;
    type: string;
    lat: number;
    lon: number;
}

export interface NestedStructure {
    [country: string]: {
        [region: string]: {
            [district: string]: {
                [community: string]: Settlement[];
            };
        };
    };
}

export interface FlatSettlement extends Settlement {
    country: string;
    region: string;
    district: string;
    community: string;
}

export type SettlementPath = {
    country: string;
    region: string;
    district: string;
    community: string;
};

let structurePromise: Promise<NestedStructure> | null = null;

// Файл ~6 МБ — вантажимо один раз на сесію
export function fetchRegionStructure(): Promise<NestedStructure> {
    if (!structurePromise) {
        structurePromise = fetch('/data/region_structure.json').then(res => {
            if (!res.ok) throw new Error(`${res.status} при завантаженні region_structure.json`);
            return res.json();
        });
        structurePromise.catch(() => { structurePromise = null; });
    }
    return structurePromise;
}

// --- Рівні для каскадних списків --------------------------------------------
// Кожен рівень терпить порожній/невідомий шлях і повертає [], щоб форми могли
// викликати їх без перевірок на кожному кроці.

export function listCountries(structure: NestedStructure | null): string[] {
    return structure ? Object.keys(structure) : [];
}

export function listRegions(structure: NestedStructure | null, country: string): string[] {
    return structure?.[country] ? Object.keys(structure[country]) : [];
}

export function listDistricts(
    structure: NestedStructure | null, country: string, region: string,
): string[] {
    const node = structure?.[country]?.[region];
    return node ? Object.keys(node) : [];
}

export function listCommunities(
    structure: NestedStructure | null, country: string, region: string, district: string,
): string[] {
    const node = structure?.[country]?.[region]?.[district];
    return node ? Object.keys(node) : [];
}

export function listSettlements(
    structure: NestedStructure | null,
    country: string, region: string, district: string, community: string,
): Settlement[] {
    return structure?.[country]?.[region]?.[district]?.[community] ?? [];
}

// --- Пошук ------------------------------------------------------------------

/** Код пункту за повним шляхом. Апостроф не має значення для порівняння. */
export function getSettlementCodeByPath(
    structure: NestedStructure | null,
    path: SettlementPath & { type: string; name: string },
): string | null {
    const list = listSettlements(structure, path.country, path.region, path.district, path.community);
    const name = normalizeApostrophes(path.name ?? '');
    const found = list.find(s => s.type === path.type && normalizeApostrophes(s.name) === name);
    return found?.code ?? null;
}

/** Повний шлях пункту за кодом (для підписок і ключів, що тримаються за код). */
export function findSettlementByCode(
    structure: NestedStructure | null, code: string,
): FlatSettlement | null {
    if (!structure) return null;
    for (const country of Object.keys(structure)) {
        for (const region of Object.keys(structure[country])) {
            for (const district of Object.keys(structure[country][region])) {
                for (const community of Object.keys(structure[country][region][district])) {
                    for (const s of structure[country][region][district][community]) {
                        if (s.code === code) return { ...s, country, region, district, community };
                    }
                }
            }
        }
    }
    return null;
}

/** Країна, якій належить область: назви областей унікальні між країнами. */
export function findCountryByRegion(
    structure: NestedStructure | null, region: string,
): string | null {
    if (!structure || !region) return null;
    return Object.keys(structure).find(country => region in structure[country]) ?? null;
}

/**
 * Підпис пункту одним рядком: «с. Городець, Городецька сільрада,
 * Кобринський район, Брестська область, Білорусь». Назви рівнів уже містять
 * слово-тип, тому нічого не дописуємо. Країну показуємо лише для закордонних.
 */
export function formatSettlementLabel(s: FlatSettlement): string {
    const prefix = s.type === 'місто' ? 'м.' : s.type === 'селище' ? 'с-ще' : 'с.';
    const parts = [`${prefix} ${s.name}`, s.community, s.district, s.region];
    if (s.country && s.country !== 'Україна') parts.push(s.country);
    return parts.filter(Boolean).join(', ');
}

export function flattenStructure(structure: NestedStructure): FlatSettlement[] {
    const flat: FlatSettlement[] = [];
    for (const country of Object.keys(structure)) {
        for (const region of Object.keys(structure[country])) {
            for (const district of Object.keys(structure[country][region])) {
                for (const community of Object.keys(structure[country][region][district])) {
                    for (const s of structure[country][region][district][community]) {
                        if (typeof s.lat === 'number' && typeof s.lon === 'number') {
                            flat.push({ ...s, country, region, district, community });
                        }
                    }
                }
            }
        }
    }
    return flat;
}

// Найближчий населений пункт у радіусі maxKm (equirectangular-наближення)
export function findNearestSettlement(
    lat: number,
    lng: number,
    flat: FlatSettlement[],
    maxKm: number,
): FlatSettlement | null {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    let best: FlatSettlement | null = null;
    let bestD2 = Infinity;

    for (const s of flat) {
        const dx = (s.lon - lng) * cosLat * 111.32;
        const dy = (s.lat - lat) * 110.57;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
            bestD2 = d2;
            best = s;
        }
    }

    return best && bestD2 <= maxKm * maxKm ? best : null;
}
