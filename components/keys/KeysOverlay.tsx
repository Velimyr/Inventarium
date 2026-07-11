import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../../lib/supabaseClient';
import { useIsDark } from '../historical-map/useIsDark';
import { convexHull, toPair } from './geometry';
import type { MapKeyRow, PolygonRings } from './geometry';

const KEY_STYLE = { color: '#7C3AED', weight: 2, fillColor: '#7C3AED', fillOpacity: 0.15 };
const KEY_STYLE_DARK = { color: '#A78BFA', weight: 2, fillColor: '#A78BFA', fillOpacity: 0.2 };
const HOVER_FILL_OPACITY = 0.35;

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

    return root;
}

function buildTooltipEl(name: string): HTMLElement {
    const el = document.createElement('span');
    el.textContent = name;
    return el;
}

// Шар підтверджених «ключів» на головній карті
export default function KeysOverlay() {
    const map = useMap();
    const isDark = useIsDark();
    const isDarkRef = useRef(isDark);
    isDarkRef.current = isDark;

    const [keys, setKeys] = useState<MapKeyRow[] | null>(null);
    const layerGroup = useMemo(() => L.layerGroup(), []);
    const polygonsRef = useRef<L.Polygon[]>([]);
    const radialsRef = useRef<L.Polyline[]>([]);

    // Pane між полігонами адмінподілу (450, інтерактивні) та кордонами (550, без подій):
    // кліки по ключах працюють навіть при увімкненій історичній карті
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

        const style = isDarkRef.current ? KEY_STYLE_DARK : KEY_STYLE;
        const polygons: L.Polygon[] = [];
        const radials: L.Polyline[] = [];

        for (const key of keys) {
            if (!key.center || !Array.isArray(key.points) || key.points.length < 3) continue;
            const center = toPair(key.center);

            for (const point of key.points) {
                radials.push(
                    L.polyline([center, toPair(point)], {
                        pane: 'keysPane',
                        color: style.color,
                        weight: 1,
                        dashArray: '4 4',
                        interactive: false,
                    })
                );
            }

            // Контур, обраний адміном при підтвердженні; для старих записів — опукла оболонка
            const rings: PolygonRings = key.polygon && key.polygon.length > 0
                ? key.polygon
                : [convexHull([center, ...key.points.map(toPair)])];
            const polygon = L.polygon(rings.map(ring => [ring]), { pane: 'keysPane', ...style });
            polygon.bindTooltip(buildTooltipEl(key.name), { sticky: true });
            polygon.bindPopup(buildPopupEl(key));
            polygon.on('mouseover', () => polygon.setStyle({ fillOpacity: HOVER_FILL_OPACITY }));
            polygon.on('mouseout', () =>
                polygon.setStyle({
                    fillOpacity: (isDarkRef.current ? KEY_STYLE_DARK : KEY_STYLE).fillOpacity,
                })
            );
            polygons.push(polygon);
        }

        radials.forEach((r) => layerGroup.addLayer(r));
        polygons.forEach((p) => layerGroup.addLayer(p));
        polygonsRef.current = polygons;
        radialsRef.current = radials;

        return () => {
            layerGroup.clearLayers();
            polygonsRef.current = [];
            radialsRef.current = [];
        };
    }, [map, keys, layerGroup]);

    // Рестайл при зміні теми
    useEffect(() => {
        const style = isDark ? KEY_STYLE_DARK : KEY_STYLE;
        polygonsRef.current.forEach((p) => p.setStyle(style));
        radialsRef.current.forEach((r) => r.setStyle({ color: style.color }));
    }, [isDark]);

    return null;
}
