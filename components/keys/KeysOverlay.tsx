import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { supabase } from '../../lib/supabaseClient';
import { useIsDark } from '../historical-map/useIsDark';
import { convexHull, toPair } from './geometry';
import type { LatLngPair, MapKeyRow, PolygonRings } from './geometry';
import { voronoiKeyClips } from './voronoi';

// Палітра ключів: колір закріплюється за ключем детерміновано (за id),
// щоб сусідні території було видно як різні
const KEY_PALETTE = [
    { light: '#7C3AED', dark: '#A78BFA' },
    { light: '#0D9488', dark: '#5EEAD4' },
    { light: '#D97706', dark: '#FBBF24' },
    { light: '#DB2777', dark: '#F9A8D4' },
    { light: '#2563EB', dark: '#93C5FD' },
    { light: '#65A30D', dark: '#BEF264' },
    { light: '#DC2626', dark: '#FCA5A5' },
    { light: '#0891B2', dark: '#67E8F9' },
];

const FILL_OPACITY = 0.35;
const FILL_OPACITY_DARK = 0.4;
const HOVER_FILL_OPACITY = 0.55;
const OUTLINE_WEIGHT = 3;

function paletteIndex(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return hash % KEY_PALETTE.length;
}

// Вміст popup/tooltip — користувацькі дані, тому будуємо DOM-елементи
// через textContent (ніякої інтерполяції HTML)
function buildPopupEl(key: MapKeyRow): HTMLElement {
    const root = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = key.name;
    root.appendChild(title);

    const addRow = (label: string, value: string) => {
        const p = document.createElement('p');
        p.style.margin = '6px 0 0';
        const labelEl = document.createElement('span');
        labelEl.style.fontWeight = '600';
        labelEl.textContent = label;
        p.appendChild(labelEl);
        p.appendChild(document.createTextNode(value));
        root.appendChild(p);
    };

    if (key.source) addRow('Джерело: ', key.source);
    if (key.description) addRow('Опис: ', key.description);

    const linkWrap = document.createElement('p');
    linkWrap.style.margin = '8px 0 0';
    const link = document.createElement('a');
    link.href = `/key/${encodeURIComponent(key.id)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'text-blue-600 underline hover:text-blue-800';
    link.textContent = 'Детальніше';
    linkWrap.appendChild(link);
    root.appendChild(linkWrap);

    return root;
}

function buildTooltipEl(name: string): HTMLElement {
    const el = document.createElement('span');
    el.textContent = name;
    return el;
}

// PolygonRings ([lat,lng]) → MultiPolygon ([x=lng, y=lat]) для polygon-clipping
function ringsToMulti(rings: PolygonRings): MultiPolygon {
    return rings.map(ring => [ring.map(([lat, lng]) => [lng, lat] as [number, number])]);
}

// MultiPolygon → вкладені координати для L.polygon (з дірками)
function multiToLatLngs(multi: MultiPolygon): LatLngPair[][][] {
    return multi.map((polygon: Polygon) =>
        polygon.map(ring => ring.map(([x, y]) => [y, x] as LatLngPair))
    );
}

interface KeyLayerEntry {
    layer: L.Path;
    colorIdx: number;
    isRadial: boolean;
}

// Шар підтверджених «ключів» на головній карті
export default function KeysOverlay() {
    const map = useMap();
    const isDark = useIsDark();
    const isDarkRef = useRef(isDark);
    isDarkRef.current = isDark;

    const [keys, setKeys] = useState<MapKeyRow[] | null>(null);
    const layerGroup = useMemo(() => L.layerGroup(), []);
    const entriesRef = useRef<KeyLayerEntry[]>([]);

    // Pane між полігонами адмінподілу (450, інтерактивні) та кордонами (550, без подій)
    useEffect(() => {
        if (!map) return;

        if (!map.getPane('keysPane')) {
            map.createPane('keysPane');
            map.getPane('keysPane')!.style.zIndex = '460';
        }

        layerGroup.addTo(map);
        return () => {
            layerGroup.remove();
        };
    }, [map, layerGroup]);

    // created_by свідомо не вибираємо — автор не показується на публічній карті
    useEffect(() => {
        let cancelled = false;

        supabase
            .from('map_keys')
            .select('id, name, source, description, center, points, polygon')
            .eq('status', 'approved')
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.error('Помилка завантаження ключів:', error);
                    return;
                }
                setKeys((data || []) as MapKeyRow[]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!map || !keys) return;

        const validKeys = keys.filter(k => k.center && Array.isArray(k.points) && k.points.length >= 3);

        // Контур, обраний при підтвердженні; для старих записів — опукла оболонка
        const storedRings = (key: MapKeyRow): PolygonRings =>
            key.polygon && key.polygon.length > 0
                ? key.polygon
                : [convexHull([toPair(key.center), ...key.points.map(toPair)])];

        // Розмежування сусідніх ключів: спільна діаграма Вороного з сіл усіх ключів;
        // контур кожного обрізається «зоною переваги» його сіл. Для ключів без
        // конфліктів обрізання тотожне. При збої — показуємо необрізані контури.
        let displayMultis: MultiPolygon[];
        try {
            const clips = voronoiKeyClips(validKeys.map(k => [toPair(k.center), ...k.points.map(toPair)]));
            displayMultis = validKeys.map((key, i) => {
                const stored = ringsToMulti(storedRings(key));
                if (!clips[i] || clips[i].length === 0) return stored;
                const clipped = polygonClipping.intersection(stored, ringsToMulti(clips[i]));
                return clipped.length > 0 ? clipped : stored;
            });
        } catch (err) {
            console.error('Не вдалося розмежувати ключі, показуємо без обрізання:', err);
            displayMultis = validKeys.map(key => ringsToMulti(storedRings(key)));
        }

        const entries: KeyLayerEntry[] = [];

        validKeys.forEach((key, i) => {
            const colorIdx = paletteIndex(key.id);
            const color = KEY_PALETTE[colorIdx][isDarkRef.current ? 'dark' : 'light'];
            const center = toPair(key.center);

            // Радіальні лінії — тонкі й напівпрозорі, щоб не створювати «павутиння»
            for (const point of key.points) {
                const radial = L.polyline([center, toPair(point)], {
                    pane: 'keysPane',
                    color,
                    weight: 0.8,
                    opacity: 0.5,
                    dashArray: '4 4',
                    interactive: false,
                });
                entries.push({ layer: radial, colorIdx, isRadial: true });
            }

            const polygon = L.polygon(multiToLatLngs(displayMultis[i]), {
                pane: 'keysPane',
                color,
                weight: OUTLINE_WEIGHT,
                fillColor: color,
                fillOpacity: isDarkRef.current ? FILL_OPACITY_DARK : FILL_OPACITY,
            });
            polygon.bindTooltip(buildTooltipEl(key.name), { sticky: true });
            polygon.bindPopup(buildPopupEl(key));
            polygon.on('mouseover', () => polygon.setStyle({ fillOpacity: HOVER_FILL_OPACITY }));
            polygon.on('mouseout', () =>
                polygon.setStyle({ fillOpacity: isDarkRef.current ? FILL_OPACITY_DARK : FILL_OPACITY })
            );
            entries.push({ layer: polygon, colorIdx, isRadial: false });
        });

        // Радіалі під полігонами, полігони зверху (порядок додавання)
        entries.filter(e => e.isRadial).forEach(e => layerGroup.addLayer(e.layer));
        entries.filter(e => !e.isRadial).forEach(e => layerGroup.addLayer(e.layer));
        entriesRef.current = entries;

        return () => {
            layerGroup.clearLayers();
            entriesRef.current = [];
        };
    }, [map, keys, layerGroup]);

    // Рестайл при зміні теми
    useEffect(() => {
        for (const entry of entriesRef.current) {
            const color = KEY_PALETTE[entry.colorIdx][isDark ? 'dark' : 'light'];
            if (entry.isRadial) {
                entry.layer.setStyle({ color });
            } else {
                entry.layer.setStyle({
                    color,
                    fillColor: color,
                    fillOpacity: isDark ? FILL_OPACITY_DARK : FILL_OPACITY,
                });
            }
        }
    }, [isDark]);

    return null;
}
