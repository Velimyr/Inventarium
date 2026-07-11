// Геометрія полігонів-«ключів»: спільні типи та сортування вершин.

export type LatLngPair = [number, number]; // [lat, lng]

// Точка ключа: координати + прив'язка до населеного пункту з довідника
// (region_structure.json). Поки пункт не обрано — code/name/type порожні,
// region/district/community зберігають проміжний стан випадаючих списків.
export interface KeyPoint {
    lat: number;
    lng: number;
    region: string;
    district: string;
    community: string;
    code: string;
    name: string;
    type: string;
}

// Стан білдера: центральна точка + вершини полігона
export interface KeyGeometry {
    center: KeyPoint | null;
    points: KeyPoint[];
}

// Спосіб побудови контуру ключа (обирає користувач при поданні, адмін може змінити)
export type PolygonVariant = 'hull' | 'buffer' | 'voronoi';

export const DEFAULT_POLYGON_VARIANT: PolygonVariant = 'buffer';

export const POLYGON_VARIANT_LABELS: Record<PolygonVariant, string> = {
    hull: 'Опукла оболонка',
    buffer: 'Оболонка з буфером',
    voronoi: 'Діаграми Вороного',
};

// Відступ для варіанта 'buffer', км
export const BUFFER_KM = 2;

// Контур території: одне або кілька кілець (Вороний може дати роз'єднані частини)
export type PolygonRings = LatLngPair[][];

// Рядок таблиці map_keys у публічному вигляді (без email/created_by)
export interface MapKeyRow {
    id: string;
    name: string;
    source: string | null;
    description: string | null;
    center: KeyPoint;
    points: KeyPoint[];
    polygon: PolygonRings | null;
}

export function toPair(point: { lat: number; lng: number }): LatLngPair {
    return [point.lat, point.lng];
}

// Локальна рівновіддалена проєкція (км): x — схід, y — північ.
// Для територій у десятки км похибка мізерна, а кути не спотворюються.
interface XY { x: number; y: number; }

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 111.32;

function makeProjection(points: LatLngPair[]) {
    const lat0 = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    return {
        toXY: (p: LatLngPair): XY => ({ x: p[1] * cosLat * KM_PER_DEG_LNG, y: p[0] * KM_PER_DEG_LAT }),
        toLatLng: (p: XY): LatLngPair => [p.y / KM_PER_DEG_LAT, p.x / (cosLat * KM_PER_DEG_LNG)],
    };
}

function crossXY(o: XY, a: XY, b: XY): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Опукла оболонка (monotone chain), проти годинникової стрілки в XY
function convexHullXY(points: XY[]): XY[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length <= 2) return sorted;

    const lower: XY[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossXY(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: XY[] = [];
    for (const p of [...sorted].reverse()) {
        while (upper.length >= 2 && crossXY(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Опукла оболонка навколо всіх точок ключа — контур без зубців */
export function convexHull(points: LatLngPair[]): LatLngPair[] {
    if (points.length <= 2) return [...points];
    const { toXY, toLatLng } = makeProjection(points);
    return convexHullXY(points.map(toXY)).map(toLatLng);
}

/**
 * Опукла оболонка з відступом bufferKm і заокругленими кутами
 * (сума Мінковського опуклого полігона з колом): межа охоплює землі
 * крайніх сіл, а не проходить «по хатах».
 */
export function bufferedHull(points: LatLngPair[], bufferKm: number = BUFFER_KM): LatLngPair[] {
    const { toXY, toLatLng } = makeProjection(points);
    const hull = convexHullXY(points.map(toXY));
    const result: XY[] = [];
    const n = hull.length;

    if (n === 1) {
        // Виродження: коло навколо єдиної точки
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
            result.push({ x: hull[0].x + bufferKm * Math.cos(a), y: hull[0].y + bufferKm * Math.sin(a) });
        }
        return result.map(toLatLng);
    }

    const TWO_PI = Math.PI * 2;
    const ARC_STEP = Math.PI / 12; // 15°

    for (let i = 0; i < n; i++) {
        const prev = hull[(i - 1 + n) % n];
        const cur = hull[i];
        const next = hull[(i + 1) % n];

        // Зовнішні нормалі ребер (prev→cur) і (cur→next) для CCW-полігона
        const normalAngle = (a: XY, b: XY) => Math.atan2(-(b.x - a.x), b.y - a.y);
        const a1 = normalAngle(prev, cur);
        let a2 = normalAngle(cur, next);
        if (a2 < a1) a2 += TWO_PI;

        // Дуга навколо вершини від нормалі попереднього ребра до наступного
        for (let a = a1; a < a2; a += ARC_STEP) {
            result.push({ x: cur.x + bufferKm * Math.cos(a), y: cur.y + bufferKm * Math.sin(a) });
        }
        result.push({ x: cur.x + bufferKm * Math.cos(a2), y: cur.y + bufferKm * Math.sin(a2) });
    }

    return result.map(toLatLng);
}
