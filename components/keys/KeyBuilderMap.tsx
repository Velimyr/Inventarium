import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';
import { ChevronDown, Trash2, AlertTriangle } from 'lucide-react';
import GeocoderControl from '../GeocoderControl';
import { convexHull, bufferedHull, toPair, DEFAULT_POLYGON_VARIANT } from './geometry';
import type { KeyGeometry, KeyPoint, PolygonRings, PolygonVariant } from './geometry';
import { voronoiTerritory } from './voronoi';
import { fetchRegionStructure, flattenStructure, findNearestSettlement } from './regionData';
import type { FlatSettlement, NestedStructure } from './regionData';

const centerIcon = L.icon({
    iconUrl: '/icons/marker-red.svg',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

const vertexIcon = L.icon({
    iconUrl: '/icons/marker-blue.svg',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

// Мінімальна відстань між точками у градусах (~1 м) — захист від подвійних кліків
const MIN_POINT_DISTANCE = 1e-5;

// Радіус пошуку населеного пункту навколо кліку, км
const NEAREST_SETTLEMENT_KM = 3;

const SHAPE_COLOR = '#7C3AED';

interface Props {
    value: KeyGeometry;
    onChange: (geometry: KeyGeometry) => void;
    // Варіант контуру для живого прев'ю (обирається на сторінці подання/в адмінці)
    variant?: PolygonVariant;
}

function emptyPoint(lat: number, lng: number): KeyPoint {
    return { lat, lng, region: '', district: '', community: '', code: '', name: '', type: '' };
}

function pointFromSettlement(s: FlatSettlement): KeyPoint {
    return {
        lat: s.lat,
        lng: s.lon,
        region: s.region,
        district: s.district,
        community: s.community,
        code: s.code,
        name: s.name,
        type: s.type,
    };
}

// Клік по карті → точка з авто-прив'язкою до найближчого пункту з довідника
function buildPointFromClick(lat: number, lng: number, flat: FlatSettlement[]): KeyPoint {
    const nearest = findNearestSettlement(lat, lng, flat, NEAREST_SETTLEMENT_KM);
    return nearest ? pointFromSettlement(nearest) : emptyPoint(lat, lng);
}

function isTooClose(aLat: number, aLng: number, b: KeyPoint): boolean {
    return Math.abs(aLat - b.lat) < MIN_POINT_DISTANCE && Math.abs(aLng - b.lng) < MIN_POINT_DISTANCE;
}

// Якщо білдер відкрито з уже готовою фігурою (редагування в адмінці) —
// один раз наводимо карту на неї
function FitOnMount({ geometry }: { geometry: KeyGeometry }) {
    const map = useMap();

    useEffect(() => {
        if (geometry.center) {
            const pts = [toPair(geometry.center), ...geometry.points.map(toPair)];
            map.fitBounds(L.latLngBounds(pts).pad(0.3));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    return null;
}

function ClickHandler({
    value,
    onChange,
    flat,
    ready,
}: Props & { flat: FlatSettlement[]; ready: boolean }) {
    useMapEvents({
        click(e) {
            if (!ready) return;
            const { lat, lng } = e.latlng;

            if (!value.center) {
                onChange({ ...value, center: buildPointFromClick(lat, lng, flat) });
                return;
            }
            if (isTooClose(lat, lng, value.center) || value.points.some(p => isTooClose(lat, lng, p))) {
                return;
            }
            onChange({ ...value, points: [...value.points, buildPointFromClick(lat, lng, flat)] });
        },
    });
    return null;
}

export default function KeyBuilderMap({ value, onChange, variant = DEFAULT_POLYGON_VARIANT }: Props) {
    const { center, points } = value;

    const [structure, setStructure] = useState<NestedStructure | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRegionStructure()
            .then((json) => { if (!cancelled) setStructure(json); })
            .catch(err => console.error('Не вдалося завантажити довідник населених пунктів:', err));
        return () => { cancelled = true; };
    }, []);

    const flat = useMemo(() => (structure ? flattenStructure(structure) : []), [structure]);
    const ready = !!structure;

    // Живе прев'ю контуру обраного варіанта; Вороний потребує довідника (flat)
    const contour: PolygonRings | null = useMemo(() => {
        if (!center || points.length < 2) return null;
        const sites = [toPair(center), ...points.map(toPair)];
        if (variant === 'hull') return [convexHull(sites)];
        if (variant === 'buffer') return [bufferedHull(sites)];
        if (!flat.length) return null;
        const keyCodes = new Set([center.code, ...points.map(p => p.code)].filter(Boolean));
        return voronoiTerritory(sites, flat.filter(s => !keyCodes.has(s.code)));
    }, [center, points, variant, flat]);

    const updateCenter = (point: KeyPoint) => onChange({ ...value, center: point });
    const updateVertex = (index: number, point: KeyPoint) =>
        onChange({ ...value, points: points.map((p, i) => (i === index ? point : p)) });
    const removeVertex = (index: number) =>
        onChange({ ...value, points: points.filter((_, i) => i !== index) });

    return (
        <div className="space-y-3">
            <div className="h-[400px] border dark:border-gray-600 rounded-lg overflow-hidden">
                <MapContainer
                    center={[50.4501, 30.5234]}
                    zoom={7}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />

                    <ClickHandler value={value} onChange={onChange} flat={flat} ready={ready} />
                    <FitOnMount geometry={value} />
                    <GeocoderControl />

                    {center && (
                        <Marker
                            position={toPair(center)}
                            icon={centerIcon}
                            draggable
                            eventHandlers={{
                                dragend: (e) => {
                                    const pos = (e.target as L.Marker).getLatLng();
                                    updateCenter(buildPointFromClick(pos.lat, pos.lng, flat));
                                },
                            }}
                        />
                    )}

                    {points.map((point, index) => (
                        <Marker
                            key={`${point.lat}-${point.lng}`}
                            position={toPair(point)}
                            icon={vertexIcon}
                            eventHandlers={{ click: () => removeVertex(index) }}
                        />
                    ))}

                    {center && points.map((point) => (
                        <Polyline
                            key={`radial-${point.lat}-${point.lng}`}
                            positions={[toPair(center), toPair(point)]}
                            pathOptions={{ color: SHAPE_COLOR, weight: 1.5, dashArray: '4 4' }}
                        />
                    ))}

                    {contour && (
                        <Polygon
                            positions={contour.map(ring => [ring])}
                            pathOptions={{ color: SHAPE_COLOR, weight: 2, fillColor: SHAPE_COLOR, fillOpacity: 0.15 }}
                        />
                    )}
                </MapContainer>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {!ready
                        ? 'Завантаження довідника населених пунктів...'
                        : !center
                            ? 'Перший клік на карті — центр ключа (червона позначка).'
                            : `Кліки додають населені пункти ключа (додано: ${points.length}, потрібно щонайменше 2). Клік по позначці видаляє її, центр можна перетягнути.`}
                </p>
                {(center || points.length > 0) && (
                    <button
                        type="button"
                        onClick={() => onChange({ center: null, points: [] })}
                        className="px-3 py-1.5 rounded border border-gray-300 dark:border-[#374151] text-gray-700 dark:text-gray-300 text-[13px] hover:bg-gray-100 dark:hover:bg-[#1F2937] transition-colors"
                    >
                        Скинути
                    </button>
                )}
            </div>

            {/* Список точок: кожну треба прив'язати до населеного пункту з довідника */}
            {structure && (center || points.length > 0) && (
                <div className="space-y-3">
                    {center && (
                        <PointRow
                            label="Центр ключа"
                            point={center}
                            structure={structure}
                            onChange={updateCenter}
                        />
                    )}
                    {points.map((point, index) => (
                        <PointRow
                            key={index}
                            label={`Населений пункт ${index + 1}`}
                            point={point}
                            structure={structure}
                            onChange={(p) => updateVertex(index, p)}
                            onRemove={() => removeVertex(index)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Рядок точки: каскадні списки область → район → громада → населений пункт.
// Вибір пункту переносить позначку на координати з довідника.
function PointRow({
    label,
    point,
    structure,
    onChange,
    onRemove,
}: {
    label: string;
    point: KeyPoint;
    structure: NestedStructure;
    onChange: (point: KeyPoint) => void;
    onRemove?: () => void;
}) {
    const districts = point.region && structure[point.region] ? Object.keys(structure[point.region]) : [];
    const communities =
        point.region && point.district && structure[point.region]?.[point.district]
            ? Object.keys(structure[point.region][point.district])
            : [];
    const settlements =
        point.region && point.district && point.community
            ? structure[point.region]?.[point.district]?.[point.community] || []
            : [];

    const handleSettlementSelect = (code: string) => {
        const settlement = settlements.find(s => s.code === code);
        if (!settlement) return;
        onChange({
            ...point,
            code: settlement.code,
            name: settlement.name,
            type: settlement.type,
            // Позначка стає на координати з довідника
            lat: settlement.lat,
            lng: settlement.lon,
        });
    };

    return (
        <div className="p-[15px] rounded-lg border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937]">
            <div className="flex items-center justify-between mb-[10px]">
                <span className="text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] font-semibold">
                    {label}
                    {point.code && (
                        <span className="ml-2 font-normal text-gray-600 dark:text-gray-400">
                            — {point.type} {point.name}
                        </span>
                    )}
                </span>
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                        aria-label="Видалити точку"
                    >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" strokeWidth={1.6} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-[10px]">
                <PointSelect
                    value={point.region}
                    placeholder="Оберіть область"
                    onChange={(region) =>
                        onChange({ ...point, region, district: '', community: '', code: '', name: '', type: '' })
                    }
                    options={Object.keys(structure).map(r => ({ value: r, label: r }))}
                />
                <PointSelect
                    value={point.district}
                    placeholder="Оберіть район"
                    disabled={!districts.length}
                    onChange={(district) =>
                        onChange({ ...point, district, community: '', code: '', name: '', type: '' })
                    }
                    options={districts.map(d => ({ value: d, label: d }))}
                />
                <PointSelect
                    value={point.community}
                    placeholder="Оберіть громаду"
                    disabled={!communities.length}
                    onChange={(community) =>
                        onChange({ ...point, community, code: '', name: '', type: '' })
                    }
                    options={communities.map(c => ({ value: c, label: c }))}
                />
                <PointSelect
                    value={point.code}
                    placeholder="Населений пункт"
                    disabled={!settlements.length}
                    onChange={handleSettlementSelect}
                    options={settlements.map(s => ({ value: s.code, label: `${s.type} ${s.name}` }))}
                />
            </div>

            {!point.code && (
                <div className="flex items-start gap-[8px] mt-[10px]">
                    <AlertTriangle className="w-4 h-4 text-[#92400E] dark:text-[#EAB308] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                    <p className="text-[#92400E] dark:text-[#EAB308] text-[12px] lg:text-[13px]">
                        Населений пункт поруч не знайдено. Оберіть його з випадаючих списків — для ключа це
                        обов&apos;язково. Якщо пункту немає в списках,{' '}
                        <Link href="/add_settlement" target="_blank" className="underline hover:opacity-80">
                            зробіть запит на додавання населеного пункту
                        </Link>.
                    </p>
                </div>
            )}
        </div>
    );
}

function PointSelect({
    value,
    placeholder,
    disabled,
    onChange,
    options,
}: {
    value: string;
    placeholder: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-full px-[10px] h-[36px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-[#F3F4F6] text-[12px] lg:text-[13px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[30px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <option value="">{placeholder}</option>
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-[8px] top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
        </div>
    );
}
