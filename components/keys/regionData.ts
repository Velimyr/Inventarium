// Довідник населених пунктів (/data/region_structure.json): типи, кеш, пошук

export interface Settlement {
    name: string;
    code: string;
    type: string;
    lat: number;
    lon: number;
}

export interface NestedStructure {
    [region: string]: {
        [district: string]: {
            [community: string]: Settlement[];
        };
    };
}

export interface FlatSettlement extends Settlement {
    region: string;
    district: string;
    community: string;
}

let structurePromise: Promise<NestedStructure> | null = null;

// Файл ~5.5 МБ — вантажимо один раз на сесію
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

export function flattenStructure(structure: NestedStructure): FlatSettlement[] {
    const flat: FlatSettlement[] = [];
    for (const region of Object.keys(structure)) {
        for (const district of Object.keys(structure[region])) {
            for (const community of Object.keys(structure[region][district])) {
                for (const s of structure[region][district][community]) {
                    if (typeof s.lat === 'number' && typeof s.lon === 'number') {
                        flat.push({ ...s, region, district, community });
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
