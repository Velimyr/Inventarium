// Статичні довідники з public/data — для серверного коду (MCP-сервер).
//
// Браузер вантажить їх fetch-ем з /data/... (див. fetchRegionStructure у
// components/keys/regionData.ts), але в API-роуті відносного URL немає, тож
// читаємо файли з диска. На Vercel вони потрапляють у функцію лише завдяки
// outputFileTracingIncludes у next.config.js — без нього читання впаде з ENOENT.
//
// Кеш — на рівні модуля: тепла функція не парсить 6-мегабайтний довідник
// на кожен запит.

import { readFile } from 'fs/promises';
import path from 'path';
import type { NestedStructure, FlatSettlement } from '../../components/keys/regionData';

const cache = new Map<string, Promise<any>>();

/** JSON-файл з public/ за шляхом відносно неї (наприклад, 'data/archives.json'). */
export function readPublicJson<T = any>(relativePath: string): Promise<T> {
  let promise = cache.get(relativePath);
  if (!promise) {
    promise = readFile(path.join(process.cwd(), 'public', relativePath), 'utf8').then(JSON.parse);
    // Невдале читання не кешуємо — інакше помилка лишилася б до перезапуску
    promise.catch(() => cache.delete(relativePath));
    cache.set(relativePath, promise);
  }
  return promise;
}

export const loadRegionStructure = () => readPublicJson<NestedStructure>('data/region_structure.json');

let flatPromise: Promise<FlatSettlement[]> | null = null;

/**
 * Усі населені пункти довідника плоским списком.
 *
 * Не flattenStructure з regionData: той відкидає пункти без координат (їм не
 * місце на карті), а шукати їх за назвою все одно треба — таких 267.
 */
export function loadFlatSettlements(): Promise<FlatSettlement[]> {
  if (!flatPromise) {
    flatPromise = loadRegionStructure().then((structure) => {
      const flat: FlatSettlement[] = [];
      for (const [country, regions] of Object.entries(structure)) {
        for (const [region, districts] of Object.entries(regions)) {
          for (const [district, communities] of Object.entries(districts)) {
            for (const [community, settlements] of Object.entries(communities)) {
              for (const s of settlements) flat.push({ ...s, country, region, district, community });
            }
          }
        }
      }
      return flat;
    });
    flatPromise.catch(() => { flatPromise = null; });
  }
  return flatPromise;
}

export type Archive = {
  id: string;
  short_name: string;
  country: string;
  full_name_ukr: string;
  full_name_native: string | null;
  site: string | null;
};

export const loadArchives = () => readPublicJson<Archive[]>('data/archives.json');
