import { useEffect, useState } from 'react';
import { TIME_PERIODS } from './constants';
import type { PeriodData } from './types';

export function usePeriodData(periodId: string): { data: PeriodData | null; isLoading: boolean } {
  const [data, setData] = useState<PeriodData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const periodConfig = Object.values(TIME_PERIODS).find((p) => p.id === periodId);
    if (!periodConfig) return;

    const controller = new AbortController();
    const { signal } = controller;

    setIsLoading(true);
    setData(null);

    const fetchJson = (url: string) =>
      fetch(url, { signal }).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
        return r.json();
      });

    Promise.all([
      fetchJson(`/data/historical/${periodConfig.areasFile}.geojson`),
      fetchJson(`/data/historical/${periodConfig.bordersFile}.geojson`),
      fetchJson(`/data/historical/${periodConfig.pointsFile}.geojson`),
    ])
      .then(([areas, borders, points]) => {
        setData({ areas, borders, points });
        setIsLoading(false);
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error('Failed to load historical geojson:', error);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [periodId]);

  return { data, isLoading };
}
