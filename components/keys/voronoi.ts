import { Delaunay } from 'd3-delaunay';
import type { LatLngPair, PolygonRings } from './geometry';

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 111.32;

/**
 * Територія ключа за діаграмою Вороного: землі, ближчі до сіл ключа,
 * ніж до сусідніх сіл з довідника.
 *
 * Будуємо діаграму для сайтів ключа + сусідів у рамці навколо ключа,
 * беремо клітинки сайтів ключа і об'єднуємо: спільні внутрішні ребра
 * взаємно знищуються, з решти зшиваються кільця контуру
 * (може вийти кілька кілець, якщо чуже село розриває територію).
 */
export function voronoiTerritory(
    keySites: LatLngPair[],
    neighbors: { lat: number; lon: number }[],
): PolygonRings {
    const lat0 = keySites.reduce((sum, p) => sum + p[0], 0) / keySites.length;
    const cosLat = Math.cos((lat0 * Math.PI) / 180);
    const toXY = (lat: number, lng: number): [number, number] =>
        [lng * cosLat * KM_PER_DEG_LNG, lat * KM_PER_DEG_LAT];
    const toLatLng = (x: number, y: number): LatLngPair =>
        [y / KM_PER_DEG_LAT, x / (cosLat * KM_PER_DEG_LNG)];

    const keyXY = keySites.map(p => toXY(p[0], p[1]));

    // Рамка: розмах ключа + запас, щоб крайні клітинки обрізались сусідами, а не рамкою
    const xs = keyXY.map(p => p[0]);
    const ys = keyXY.map(p => p[1]);
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const margin = Math.max(15, spread);
    const minX = Math.min(...xs) - margin;
    const maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin;
    const maxY = Math.max(...ys) + margin;

    const coordKey = (x: number, y: number) => x.toFixed(4) + '|' + y.toFixed(4);
    const usedCoords = new Set(keyXY.map(p => coordKey(p[0], p[1])));
    const sites: [number, number][] = [...keyXY];

    for (const n of neighbors) {
        const [x, y] = toXY(n.lat, n.lon);
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        const k = coordKey(x, y);
        if (usedCoords.has(k)) continue;
        usedCoords.add(k);
        sites.push([x, y]);
    }

    const voronoi = Delaunay.from(sites).voronoi([minX, minY, maxX, maxY]);

    // Ребра клітинок ключа; спільні між двома клітинками ключа — внутрішні, викидаємо
    const edgeKey = (p: number[]) => p[0].toFixed(5) + ',' + p[1].toFixed(5);
    const edges = new Map<string, { from: number[]; to: number[] }>();

    for (let i = 0; i < keySites.length; i++) {
        const cell = voronoi.cellPolygon(i);
        if (!cell) continue;
        for (let j = 0; j < cell.length - 1; j++) {
            const a = cell[j];
            const b = cell[j + 1];
            const ka = edgeKey(a);
            const kb = edgeKey(b);
            if (ka === kb) continue;
            const reverse = kb + '|' + ka;
            if (edges.has(reverse)) {
                edges.delete(reverse);
            } else {
                edges.set(ka + '|' + kb, { from: a, to: b });
            }
        }
    }

    // Зшиваємо ребра, що лишились, у кільця
    const byStart = new Map<string, { from: number[]; to: number[] }[]>();
    for (const edge of edges.values()) {
        const k = edgeKey(edge.from);
        if (!byStart.has(k)) byStart.set(k, []);
        byStart.get(k)!.push(edge);
    }

    const usedEdges = new Set<{ from: number[]; to: number[] }>();
    const rings: PolygonRings = [];

    for (const first of edges.values()) {
        if (usedEdges.has(first)) continue;

        const ring: LatLngPair[] = [];
        const startKey = edgeKey(first.from);
        let edge = first;
        let guard = 0;

        while (guard++ < 100000) {
            usedEdges.add(edge);
            ring.push(toLatLng(edge.from[0], edge.from[1]));
            const nextKey = edgeKey(edge.to);
            if (nextKey === startKey) break;
            const next = (byStart.get(nextKey) || []).find(e => !usedEdges.has(e));
            if (!next) break;
            edge = next;
        }

        if (ring.length >= 3) rings.push(ring);
    }

    return rings;
}
