// Історичний адмінподіл: у якому повіті, воєводстві й державі лежала точка
// у 1640 і 1760 роках.
//
// Джерело — ті самі полігони, що малює історичний шар карти
// (public/data/historical/areas-*.geojson). Періоди перелічені тут, а не взяті
// з components/historical-map/constants.ts: той модуль тягне leaflet, який на
// сервері не завантажується.

import type { AreaFeatureProperties } from '../../components/historical-map/types';
import { readPublicJson } from './publicData';

export const HISTORICAL_PERIODS = ['1640', '1760'] as const;

export type HistoricalPeriod = (typeof HISTORICAL_PERIODS)[number];

// GeoJSON (CRS84): позиція — [довгота, широта]
type Position = [number, number];
type Ring = Position[];
type MultiPolygon = Ring[][];

type AreaFeature = {
  properties: AreaFeatureProperties;
  geometry: { type: 'MultiPolygon'; coordinates: MultiPolygon };
};

type IndexedArea = {
  properties: AreaFeatureProperties;
  polygons: MultiPolygon;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
};

const indexCache = new Map<HistoricalPeriod, Promise<IndexedArea[]>>();

function loadAreas(period: HistoricalPeriod): Promise<IndexedArea[]> {
  let promise = indexCache.get(period);
  if (!promise) {
    promise = readPublicJson<{ features: AreaFeature[] }>(`data/historical/areas-${period}.geojson`).then(
      (collection) =>
        collection.features
          .filter((f) => f.geometry?.type === 'MultiPolygon')
          .map((f) => {
            const bbox = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
            for (const polygon of f.geometry.coordinates) {
              for (const [lon, lat] of polygon[0] ?? []) {
                bbox.minLon = Math.min(bbox.minLon, lon);
                bbox.maxLon = Math.max(bbox.maxLon, lon);
                bbox.minLat = Math.min(bbox.minLat, lat);
                bbox.maxLat = Math.max(bbox.maxLat, lat);
              }
            }
            return { properties: f.properties, polygons: f.geometry.coordinates, bbox };
          })
    );
    promise.catch(() => indexCache.delete(period));
    indexCache.set(period, promise);
  }
  return promise;
}

/** Ray casting: чи лежить точка всередині замкненого кільця. */
function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Перше кільце полігона — зовнішній контур, решта — дірки в ньому. */
function insideMultiPolygon(lon: number, lat: number, polygons: MultiPolygon): boolean {
  return polygons.some(
    ([outer, ...holes]) => outer && insideRing(lon, lat, outer) && !holes.some((hole) => insideRing(lon, lat, hole))
  );
}

/**
 * Одиниця адмінподілу, що містить точку, або null, якщо точка поза покриттям
 * шару (він охоплює українські землі, а не всю Європу).
 */
export async function findHistoricalArea(
  period: HistoricalPeriod,
  lat: number,
  lon: number
): Promise<AreaFeatureProperties | null> {
  const areas = await loadAreas(period);
  const hit = areas.find(
    ({ bbox, polygons }) =>
      lon >= bbox.minLon &&
      lon <= bbox.maxLon &&
      lat >= bbox.minLat &&
      lat <= bbox.maxLat &&
      insideMultiPolygon(lon, lat, polygons)
  );
  return hit?.properties ?? null;
}
