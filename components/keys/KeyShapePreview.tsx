import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { convexHull } from './geometry';
import type { LatLngPair, PolygonRings } from './geometry';

const SHAPE_COLOR = '#7C3AED';

interface Props {
    center: LatLngPair;
    points: LatLngPair[];
    // Готовий контур (обраний варіант); якщо не передано — опукла оболонка
    rings?: PolygonRings;
    // Висота контейнера (tailwind-клас) і чи можна рухати/зумити карту
    heightClass?: string;
    interactive?: boolean;
}

function FitBounds({ center, points, rings }: Props) {
    const map = useMap();

    useEffect(() => {
        const all: LatLngPair[] = [center, ...points, ...(rings || []).flat()];
        map.fitBounds(L.latLngBounds(all).pad(0.2));
    }, [map, center, points, rings]);

    return null;
}

// Карта з фігурою ключа (адмін-модерація, сторінка деталей)
export default function KeyShapePreview({ center, points, rings, heightClass = 'h-[220px]', interactive = false }: Props) {
    const contour: PolygonRings = rings && rings.length > 0
        ? rings
        : [convexHull([center, ...points])];

    return (
        <div className={`${heightClass} w-full rounded-lg overflow-hidden border border-gray-300 dark:border-[#374151]`}>
            <MapContainer
                center={center}
                zoom={9}
                style={{ height: '100%', width: '100%' }}
                dragging={interactive}
                scrollWheelZoom={interactive}
                doubleClickZoom={interactive}
                touchZoom={interactive}
                boxZoom={interactive}
                keyboard={interactive}
                zoomControl={interactive}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <FitBounds center={center} points={points} rings={contour} />

                {points.map((point) => (
                    <Polyline
                        key={`radial-${point[0]}-${point[1]}`}
                        positions={[center, point]}
                        pathOptions={{ color: SHAPE_COLOR, weight: 1.5, dashArray: '4 4' }}
                    />
                ))}

                {/* Кожне кільце — окремий полігон (Вороний може дати кілька частин) */}
                <Polygon
                    positions={contour.map(ring => [ring])}
                    pathOptions={{ color: SHAPE_COLOR, weight: 2, fillColor: SHAPE_COLOR, fillOpacity: 0.15 }}
                />

                <CircleMarker
                    center={center}
                    radius={5}
                    pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#DC2626', fillOpacity: 1 }}
                />
            </MapContainer>
        </div>
    );
}
