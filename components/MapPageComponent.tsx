// components/MapPageComponent.tsx
import { memo, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import GeocoderControl from './GeocoderControl';
import HistoricalInfoCard from './historical-map/HistoricalInfoCard';
import type { AreaFeatureProperties } from './historical-map/types';

// Історична карта (опційний шар)
const HistoricalOverlay = dynamic(
    () => import('./historical-map/HistoricalOverlay'),
    { ssr: false }
);

const blueIcon = L.icon({
    iconUrl: '/icons/marker-blue.svg',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -41],
});

const redIcon = L.icon({
    iconUrl: '/icons/marker-red.svg',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -41],
});

const center: [number, number] = [50.4501, 30.5234]; // Київ

// Константи для кешування
const CACHE_KEY = 'map_records_cache';
const CACHE_TIMESTAMP_KEY = 'map_records_cache_timestamp';
const CACHE_DURATION = 1000 * 60 * 30; // 30 хвилин

// Для позначок потрібен мінімум полів — адміністративні дані довантажуються при кліку
const RECORD_FIELDS = 'id, latitude, longitude, mark_type, current_settlement_name';

interface Record {
    id: string;
    latitude: number | null;
    longitude: number | null;
    mark_type: number | null;
    current_settlement_name: string | null;
    current_region?: string | null;
    current_district?: string | null;
    current_community?: string | null;
}

// Функція для фільтрації записів за zoom-рівнем
// ТИМЧАСОВО ВІДКЛЮЧЕНО - показуємо всі записи
function filterRecordsByZoom(records: Record[], zoom: number): Record[] {
    // Показуємо ВСІ записи незалежно від zoom
    return records;
}

// Компонент для відслідковування zoom
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
    const map = useMap();

    useEffect(() => {
        const handleZoom = () => {
            onZoomChange(map.getZoom());
        };

        // Встановлюємо початковий zoom
        onZoomChange(map.getZoom());

        map.on('zoomend', handleZoom);
        return () => {
            map.off('zoomend', handleZoom);
        };
    }, [map, onZoomChange]);

    return null;
}

// Позначки без вкладених попапів: один спільний попап рендериться окремо,
// тому React не створює тисячі піддерев наперед
const RecordMarkers = memo(function RecordMarkers({
    records,
    onSelect,
}: {
    records: Record[];
    onSelect: (record: Record) => void;
}) {
    return (
        <>
            {records.map((record) => {
                if (!record.latitude || !record.longitude) return null;
                return (
                    <Marker
                        key={record.id}
                        position={[record.latitude, record.longitude]}
                        icon={record.mark_type === 0 ? redIcon : blueIcon}
                        eventHandlers={{ click: () => onSelect(record) }}
                    />
                );
            })}
        </>
    );
});

// Компонент для динамічного керування heat map
function HeatMapLayer({ records, colorScheme }: { records: Record[]; colorScheme: 'blue' | 'rgb' }) {
    const map = useMap();
    const [heatLayer, setHeatLayer] = useState<any>(null);
    const [currentZoom, setCurrentZoom] = useState(map.getZoom());
    const [isHeatLibLoaded, setIsHeatLibLoaded] = useState(false);

    // Завантажуємо бібліотеку leaflet.heat ТІЛЬКИ коли вона потрібна
    useEffect(() => {
        if (typeof window !== 'undefined' && !isHeatLibLoaded && records.length > 0) {
            import('leaflet.heat').then(() => {
                console.log('✅ leaflet.heat завантажено');
                setIsHeatLibLoaded(true);
            });
        }
    }, [isHeatLibLoaded, records.length]);

    // Слухаємо зміни zoom
    useEffect(() => {
        const handleZoom = () => {
            setCurrentZoom(map.getZoom());
        };

        map.on('zoomend', handleZoom);
        return () => {
            map.off('zoomend', handleZoom);
        };
    }, [map]);

    // Керуємо відображенням heat map
    useEffect(() => {
        if (!isHeatLibLoaded || records.length === 0) return;

        const shouldShowHeatMap = currentZoom <= 13;

        // Видаляємо старий layer при зміні zoom або кольорової схеми
        if (heatLayer) {
            map.removeLayer(heatLayer);
            setHeatLayer(null);
        }

        // Якщо потрібно показати heat map
        if (shouldShowHeatMap) {
            const heatPoints = records
                .filter(r => r.latitude && r.longitude)
                .map(r => [r.latitude!, r.longitude!, 0.05] as [number, number, number]);

            if (heatPoints.length > 0) {
                // Вибір градієнту залежно від кольорової схеми
                let gradient;
                
                if (colorScheme === 'blue') {
                    gradient = {
                        0.0: 'rgba(219, 234, 254, 0.6)',
                        0.3: 'rgba(147, 197, 253, 0.7)',
                        0.6: 'rgba(59, 130, 246, 0.8)',
                        0.8: 'rgba(37, 99, 235, 0.85)',
                        1.0: 'rgba(29, 78, 216, 0.9)'
                    };
                } else {
                    gradient = {
                        0.0: 'rgba(34, 197, 94, 0.85)',
                        0.35: 'rgba(234, 179, 8, 0.9)',
                        0.65: 'rgba(249, 115, 22, 0.95)',
                        1.0: 'rgba(220, 38, 38, 1.0)'
                    };
                }

                // @ts-ignore
                const heat = L.heatLayer(heatPoints, {
                    radius: 20,
                    blur: 25,
                    maxZoom: 13,
                    max: 1.0,
                    minOpacity: 0.6,
                    gradient: gradient
                }).addTo(map);

                setHeatLayer(heat);
            }
        }
    }, [currentZoom, isHeatLibLoaded, records, map, colorScheme]);

    // Cleanup при unmount
    useEffect(() => {
        return () => {
            if (heatLayer && map) {
                try {
                    map.removeLayer(heatLayer);
                } catch (e) {
                    // Ігноруємо помилки при видаленні
                }
            }
        };
    }, [heatLayer, map]);

    return null;
}

export default function MapPageComponent() {
    const [allRecords, setAllRecords] = useState<Record[]>([]);
    const [visibleRecords, setVisibleRecords] = useState<Record[]>([]);
    const [loadingStage, setLoadingStage] = useState<'initial' | 'regions' | 'all'>('initial');
    const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
    const [currentZoom, setCurrentZoom] = useState(7);
    const [isPanelOpen, setIsPanelOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth >= 768;
    }); // На мобільних згорнута, на десктопі відкрита
    const [showClusters, setShowClusters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_clusters');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [showHeatMap, setShowHeatMap] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_heatmap');
            return saved !== null ? saved === 'true' : false;
        }
        return false;
    });
    const [showIndividualMarkers, setShowIndividualMarkers] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_individual');
            return saved !== null ? saved === 'true' : false;
        }
        return false;
    });
    const [colorScheme, setColorScheme] = useState<'blue' | 'rgb'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_color_scheme');
            return (saved === 'blue' ? 'blue' : 'rgb') as 'blue' | 'rgb';
        }
        return 'rgb';
    });
    const [showHistorical, setShowHistorical] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('map_show_historical') === 'true';
        }
        return false;
    });
    const [historicalPeriod, setHistoricalPeriod] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('map_historical_period') || '1640';
        }
        return '1640';
    });
    const [showVoievodstvoCenters, setShowVoievodstvoCenters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_voievodstvo_centers');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [showPovitCenters, setShowPovitCenters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_povit_centers');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [showStarostvoCenters, setShowStarostvoCenters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_starostvo_centers');
            return saved !== null ? saved === 'true' : true;
        }
        return true;
    });
    const [hoveredHistoricalRegion, setHoveredHistoricalRegion] = useState<AreaFeatureProperties | null>(null);
    const [activeMapTab, setActiveMapTab] = useState<'regular' | 'historical'>('regular');
    const router = useRouter();

    useEffect(() => {
        localStorage.setItem('map_show_historical', String(showHistorical));
    }, [showHistorical]);

    useEffect(() => {
        localStorage.setItem('map_historical_period', historicalPeriod);
    }, [historicalPeriod]);

    useEffect(() => {
        localStorage.setItem('map_show_voievodstvo_centers', String(showVoievodstvoCenters));
    }, [showVoievodstvoCenters]);

    useEffect(() => {
        localStorage.setItem('map_show_povit_centers', String(showPovitCenters));
    }, [showPovitCenters]);

    useEffect(() => {
        localStorage.setItem('map_show_starostvo_centers', String(showStarostvoCenters));
    }, [showStarostvoCenters]);

    // Зберігаємо вибір користувача в localStorage
    useEffect(() => {
        localStorage.setItem('map_show_clusters', String(showClusters));
    }, [showClusters]);

    useEffect(() => {
        localStorage.setItem('map_show_heatmap', String(showHeatMap));
    }, [showHeatMap]);

    useEffect(() => {
        localStorage.setItem('map_show_individual', String(showIndividualMarkers));
    }, [showIndividualMarkers]);

    useEffect(() => {
        localStorage.setItem('map_color_scheme', colorScheme);
        
        if (colorScheme === 'rgb') {
            document.body.classList.add('rgb-scheme');
        } else {
            document.body.classList.remove('rgb-scheme');
        }
    }, [colorScheme]);

    // 🚀 Завантаження даних: кеш → миттєвий рендер, свіжі дані підтягуються у фоні
    useEffect(() => {
        let cancelled = false;
        let gotAll = false;

        const applyAll = (data: Record[]) => {
            gotAll = true;
            setAllRecords(data);
            setVisibleRecords(data);
            setLoadingStage('all');
        };

        const fetchData = async () => {
            // 1) Кеш (stale-while-revalidate): показуємо одразу, оновлюємо у фоні
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                const cachedAt = Number(localStorage.getItem(CACHE_TIMESTAMP_KEY));
                if (cached && cachedAt && Date.now() - cachedAt < CACHE_DURATION) {
                    const parsed: Record[] = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        console.log('⚡ Позначки з кешу:', parsed.length);
                        applyAll(parsed);
                    }
                }
            } catch (e) {
                console.warn('Кеш карти пошкоджено, ігноруємо:', e);
            }

            try {
                // 2) Без кешу: паралельно швидкий запит регіонів (перший кадр)
                //    і повний датасет
                if (!gotAll) {
                    setLoadingStage('regions');
                    supabase
                        .from('records')
                        .select(RECORD_FIELDS)
                        .eq('mark_type', 0)
                        .not('latitude', 'is', null)
                        .not('longitude', 'is', null)
                        .then(({ data: regionsData, error: regionsError }) => {
                            if (cancelled || gotAll) return;
                            if (regionsError) {
                                console.error('Помилка завантаження регіонів:', regionsError);
                                return;
                            }
                            console.log('✅ Регіони завантажено:', regionsData?.length || 0);
                            setVisibleRecords(regionsData || []);
                        });
                }

                const { data: allRpcData, error: allError } = await supabase
                    .rpc('get_unique_settlement_records')
                    .select(RECORD_FIELDS);
                const allData = (Array.isArray(allRpcData) ? allRpcData : []) as Record[];

                if (cancelled) return;

                if (allError) {
                    console.error('Помилка завантаження всіх даних:', allError);
                    setLoadingStage('all'); // ховаємо бейдж, щоб не крутився вічно
                } else {
                    console.log('✅ Всі дані завантажено:', allData.length);

                    try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify(allData));
                        localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
                    } catch (e) {
                        console.warn('Не вдалося записати кеш карти:', e);
                    }

                    applyAll(allData);
                }
            } catch (error) {
                console.error('Критична помилка завантаження:', error);
                if (!cancelled) setLoadingStage('all');
            }
        };

        fetchData();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleSelectRecord = useCallback((record: Record) => {
        setSelectedRecord(record);
    }, []);

    // Адміністративні поля не входять у початковий датасет —
    // довантажуємо їх лише коли користувач переходить на сторінку поселення
    const openSettlementPage = useCallback(async (record: Record) => {
        // Вкладку відкриваємо синхронно, щоб її не заблокував popup-blocker
        const win = window.open('about:blank', '_blank');
        if (win) win.opener = null;

        let details: Record = record;
        if (!record.current_region && !record.current_district && !record.current_community) {
            const { data, error } = await supabase
                .from('records')
                .select('current_region, current_district, current_community, current_settlement_name')
                .eq('id', record.id)
                .maybeSingle();
            if (error) {
                console.error('Помилка довантаження деталей запису:', error);
            }
            if (data) details = { ...record, ...data };
        }

        const params = new URLSearchParams();
        if (details.current_region) params.set('current_region', details.current_region);
        if (details.current_district) params.set('current_district', details.current_district);
        if (details.current_community) params.set('current_community', details.current_community);
        if (details.current_settlement_name) params.set('current_settlement_name', details.current_settlement_name);
        const url = `/settlement?${params.toString()}`;

        if (win) {
            win.location.href = url;
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, []);

    // Фільтруємо записи при зміні zoom
    useEffect(() => {
        if (allRecords.length > 0) {
            const filtered = filterRecordsByZoom(allRecords, currentZoom);
            setVisibleRecords(filtered);
        }
    }, [currentZoom, allRecords]);

    return (
        <>
            <Header />
            <div style={{ height: 'calc(100vh - 80px)', width: '100%', position: 'relative' }}>
                {/* Карта рендериться одразу; стан завантаження — ненав'язливий бейдж */}
                <>
                    {loadingStage !== 'all' && (
                        <div className="fixed top-20 right-4 z-[1001] bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm">Завантаження позначок...</span>
                        </div>
                    )}

                        {/* Панель керування */}
                        <div className="fixed bottom-4 right-4 md:right-4 left-4 md:left-auto md:w-[320px] z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 md:p-4">

                            {/* Заголовок з тогглером згортання */}
                            <button
                                className="flex items-center justify-between w-full"
                                onClick={() => setIsPanelOpen(!isPanelOpen)}
                                aria-label="Відкрити/закрити панель керування картою"
                            >
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Налаштування карти</span>
                                <svg
                                    className={`w-4 h-4 ml-2 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isPanelOpen ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isPanelOpen && (
                                <div className="mt-3">
                                    {/* Таби */}
                                    <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
                                        <button
                                            onClick={() => setActiveMapTab('regular')}
                                            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                                                activeMapTab === 'regular'
                                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Звичайна карта
                                        </button>
                                        <button
                                            onClick={() => setActiveMapTab('historical')}
                                            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                                                activeMapTab === 'historical'
                                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Історична карта
                                        </button>
                                    </div>

                                    {activeMapTab === 'regular' && (
                                        <>
                                            <div className="grid grid-cols-2 gap-y-3 gap-x-2 mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl leading-none" title="Теплова карта">🌡️</span>
                                                    <button
                                                        onClick={() => setShowHeatMap(!showHeatMap)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                            showHeatMap ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                                        }`}
                                                        aria-label="Увімкнути/вимкнути теплову карту"
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                showHeatMap ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl leading-none" title="Кластеризація">🎯</span>
                                                    <button
                                                        onClick={() => setShowClusters(!showClusters)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                            showClusters ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                                        }`}
                                                        aria-label="Увімкнути/вимкнути кластеризацію"
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                showClusters ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl leading-none" title="Окремі позначки">📍</span>
                                                    <button
                                                        onClick={() => setShowIndividualMarkers(!showIndividualMarkers)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                            showIndividualMarkers ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                                        }`}
                                                        aria-label="Увімкнути/вимкнути окремі позначки"
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                showIndividualMarkers ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl leading-none" title="Кольорова схема (Синя / RGB)">🎨</span>
                                                    <button
                                                        onClick={() => setColorScheme(colorScheme === 'blue' ? 'rgb' : 'blue')}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                            colorScheme === 'rgb'
                                                                ? 'bg-gradient-to-r from-green-500 via-yellow-500 to-red-500'
                                                                : 'bg-blue-600'
                                                        }`}
                                                        aria-label="Перемкнути кольорову схему"
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                colorScheme === 'rgb' ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-row items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <svg width="15" height="24" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                                        <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="#2563eb"/>
                                                        <circle cx="12.5" cy="12.5" r="4" fill="white"/>
                                                    </svg>
                                                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">Населений пункт</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <svg width="15" height="24" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                                        <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="#dc2626"/>
                                                        <circle cx="12.5" cy="12.5" r="4" fill="white"/>
                                                    </svg>
                                                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">Цілий регіон</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {activeMapTab === 'historical' && (
                                        <div className="grid grid-cols-1 gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xl leading-none" title="Історична карта (воєводства)">🏰</span>
                                                <button
                                                    onClick={() => setShowHistorical(!showHistorical)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                        showHistorical ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                                    }`}
                                                    aria-label="Увімкнути/вимкнути історичну карту"
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                            showHistorical ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                    />
                                                </button>
                                                <span className="text-xs text-gray-700 dark:text-gray-300">
                                                    Воєводства
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Період:</span>
                                                <button
                                                    onClick={() => setHistoricalPeriod('1640')}
                                                    disabled={!showHistorical}
                                                    className={`px-3 py-1 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                        historicalPeriod === '1640'
                                                            ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    1640
                                                </button>
                                                <button
                                                    onClick={() => setHistoricalPeriod('1760')}
                                                    disabled={!showHistorical}
                                                    className={`px-3 py-1 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                        historicalPeriod === '1760'
                                                            ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                                    }`}
                                                >
                                                    1760
                                                </button>
                                            </div>

                                            <label className={`flex items-center gap-2 text-xs ${!showHistorical ? 'opacity-50' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={showVoievodstvoCenters}
                                                    disabled={!showHistorical}
                                                    onChange={(e) => setShowVoievodstvoCenters(e.target.checked)}
                                                    className="w-4 h-4 accent-blue-600 disabled:cursor-not-allowed"
                                                />
                                                <span className="text-gray-700 dark:text-gray-300">Показати центри воєводств</span>
                                            </label>

                                            <label className={`flex items-center gap-2 text-xs ${!showHistorical ? 'opacity-50' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={showPovitCenters}
                                                    disabled={!showHistorical}
                                                    onChange={(e) => setShowPovitCenters(e.target.checked)}
                                                    className="w-4 h-4 accent-blue-600 disabled:cursor-not-allowed"
                                                />
                                                <span className="text-gray-700 dark:text-gray-300">Показати центри повітів</span>
                                            </label>

                                            <label className={`flex items-center gap-2 text-xs ${!showHistorical ? 'opacity-50' : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={showStarostvoCenters}
                                                    disabled={!showHistorical}
                                                    onChange={(e) => setShowStarostvoCenters(e.target.checked)}
                                                    className="w-4 h-4 accent-blue-600 disabled:cursor-not-allowed"
                                                />
                                                <span className="text-gray-700 dark:text-gray-300">Показати центри староств</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                            <div style={{ height: '100%', width: '100%' }}>
                                <MapContainer
                                    center={center} 
                                    zoom={7} 
                                    style={{ height: '100%', width: '100%' }} 
                                    scrollWheelZoom={true}
                                >
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    />
                                    
                                    <ZoomTracker onZoomChange={setCurrentZoom} />
                                    
                                    <GeocoderControl />

                                    {showHistorical && (
                                        <HistoricalOverlay
                                            periodId={historicalPeriod}
                                            onHover={setHoveredHistoricalRegion}
                                            showVoievodstvoCenters={showVoievodstvoCenters}
                                            showPovitCenters={showPovitCenters}
                                            showStarostvoCenters={showStarostvoCenters}
                                        />
                                    )}

                                    {showHeatMap && <HeatMapLayer records={visibleRecords} colorScheme={colorScheme} />}
                                    
                                    {showClusters ? (
                                        <MarkerClusterGroup
                                            chunkedLoading
                                            spiderfyOnMaxZoom={true}
                                            showCoverageOnHover={false}
                                            zoomToBoundsOnClick={true}
                                            maxClusterRadius={50}
                                            iconCreateFunction={(cluster) => {
                                                const count = cluster.getChildCount();
                                                let size = 'tiny';
                                                let className = 'marker-cluster-tiny';
                                                
                                                if (count >= 150) {
                                                    size = 'large';
                                                    className = 'marker-cluster-large';
                                                } else if (count >= 50) {
                                                    size = 'medium';
                                                    className = 'marker-cluster-medium';
                                                } else if (count >= 10) {
                                                    size = 'small';
                                                    className = 'marker-cluster-small';
                                                }
                                                
                                                return L.divIcon({
                                                    html: `<div><span>${count}</span></div>`,
                                                    className: `marker-cluster ${className}`,
                                                    iconSize: L.point(40, 40)
                                                });
                                            }}
                                        >
                                            <RecordMarkers records={visibleRecords} onSelect={handleSelectRecord} />
                                        </MarkerClusterGroup>
                                    ) : showIndividualMarkers ? (
                                        <RecordMarkers records={visibleRecords} onSelect={handleSelectRecord} />
                                    ) : null}

                                    {/* Один спільний попап замість попапа в кожному маркері */}
                                    {selectedRecord && selectedRecord.latitude && selectedRecord.longitude && (
                                        <Popup
                                            key={selectedRecord.id}
                                            position={[selectedRecord.latitude, selectedRecord.longitude]}
                                            className="custom-popup"
                                            eventHandlers={{
                                                remove: () => {
                                                    const closedId = selectedRecord.id;
                                                    setSelectedRecord(prev => (prev && prev.id === closedId ? null : prev));
                                                },
                                            }}
                                        >
                                            <div className="dark:text-gray-900">
                                                <strong>{selectedRecord.current_settlement_name || 'Невідома назва'}</strong>
                                                <br />
                                                <button
                                                    className="text-blue-600 underline mt-2 hover:text-blue-800"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        openSettlementPage(selectedRecord);
                                                    }}
                                                >
                                                    Переглянути всі записи населеного пункту
                                                </button>
                                            </div>
                                        </Popup>
                                    )}
                                </MapContainer>
                                {showHistorical && <HistoricalInfoCard region={hoveredHistoricalRegion} />}
                            </div>
                </>
            </div>
        </>
    );
}