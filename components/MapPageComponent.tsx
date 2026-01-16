// components/MapPageComponent.tsx
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useMap } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import ClientOnly from '../components/clientonly';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import GeocoderControl from './GeocoderControl';

// Динамічний імпорт react-leaflet компонентів
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// Динамічний імпорт для кластеризації та heat map
const MarkerClusterGroup = dynamic(
    () => import('react-leaflet-cluster'),
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

const center: [number, number] = [48.3794, 31.1656];

interface Record {
    id: string;
    latitude: number | null;
    longitude: number | null;
    mark_type: number | null;
    current_settlement_name: string | null;
    current_region: string | null;
    current_district: string | null;
    current_community: string | null;
}

// Компонент для динамічної зміни tile layer
function DynamicTileLayer({ isDarkMode }: { isDarkMode: boolean }) {
    const map = useMap();

    useEffect(() => {
        // Видаляємо всі існуючі tile layers
        map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        // Додаємо новий tile layer залежно від теми
        const tileUrl = isDarkMode
            ? "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            : "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png";

        const tileLayer = L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>',
            maxZoom: 19,
            noWrap: true,
            className: 'map-tiles',  // Додамо клас для CSS
        });

        // Додаємо новий layer на карту (він автоматично буде знизу)
        tileLayer.addTo(map);

        console.log('Tile layer changed to:', isDarkMode ? 'dark' : 'light');

        return () => {
            map.removeLayer(tileLayer);
        };
    }, [isDarkMode, map]);

    return null;
}

// Компонент для динамічного керування heat map
function HeatMapLayer({ records, isDarkMode, colorScheme }: { records: Record[]; isDarkMode: boolean; colorScheme: 'blue' | 'rgb' }) {
    const map = useMap();
    const [heatLayer, setHeatLayer] = useState<any>(null);
    const [currentZoom, setCurrentZoom] = useState(map.getZoom());
    const [isHeatLibLoaded, setIsHeatLibLoaded] = useState(false);

    // Завантажуємо бібліотеку leaflet.heat один раз
    useEffect(() => {
        if (typeof window !== 'undefined' && !isHeatLibLoaded) {
            import('leaflet.heat').then(() => {
                setIsHeatLibLoaded(true);
            });
        }
    }, [isHeatLibLoaded]);

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

        // Видаляємо старий layer при зміні теми або zoom або кольорової схеми
        if (heatLayer) {
            map.removeLayer(heatLayer);
            setHeatLayer(null);
        }

        // Якщо потрібно показати heat map
        if (shouldShowHeatMap) {
            const heatPoints = records
                .filter(r => r.latitude && r.longitude)
                .map(r => [r.latitude!, r.longitude!, 0.05] as [number, number, number]); // Зменшено з 0.5 до 0.05

            if (heatPoints.length > 0) {
                // Вибір градієнту залежно від кольорової схеми і теми
                let gradient;
                
                if (colorScheme === 'blue') {
                    // Синя схема - різні відтінки синього
                    gradient = isDarkMode ? {
                        0.0: 'rgba(191, 219, 254, 0.5)',  // Світло-блакитний
                        0.3: 'rgba(96, 165, 250, 0.6)',   // Середній синій
                        0.6: 'rgba(37, 99, 235, 0.7)',    // Яскравий синій
                        0.8: 'rgba(29, 78, 216, 0.8)',    // Темно-синій
                        1.0: 'rgba(30, 58, 138, 0.9)'     // Дуже темний синій
                    } : {
                        0.0: 'rgba(219, 234, 254, 0.6)',  // Дуже світлий блакитний
                        0.3: 'rgba(147, 197, 253, 0.7)',  // Світлий синій
                        0.6: 'rgba(59, 130, 246, 0.8)',   // Середній синій
                        0.8: 'rgba(37, 99, 235, 0.85)',   // Яскравий синій
                        1.0: 'rgba(29, 78, 216, 0.9)'     // Темно-синій
                    };
                } else {
                    // RGB схема - контрастні та яскраві кольори
                    gradient = isDarkMode ? {
                        0.0: 'rgba(34, 197, 94, 0.8)',    // ЯСКРАВИЙ зелений (green-500) - збільшена непрозорість
                        0.35: 'rgba(234, 179, 8, 0.85)',  // Яскравий жовтий (yellow-500)
                        0.65: 'rgba(249, 115, 22, 0.9)',  // Помаранчевий (orange-500)
                        1.0: 'rgba(220, 38, 38, 1.0)'     // Яскраво-червоний (red-600) - повна непрозорість
                    } : {
                        0.0: 'rgba(34, 197, 94, 0.85)',   // ЯСКРАВИЙ зелений (green-500) - збільшена непрозорість
                        0.35: 'rgba(234, 179, 8, 0.9)',   // Яскравий жовтий (yellow-500)
                        0.65: 'rgba(249, 115, 22, 0.95)', // Помаранчевий (orange-500)
                        1.0: 'rgba(220, 38, 38, 1.0)'     // Яскраво-червоний (red-600) - повна непрозорість
                    };
                }

                // @ts-ignore
                const heat = L.heatLayer(heatPoints, {
                    radius: 20,  // Зменшено з 25 для більшої деталізації
                    blur: 25,    // Зменшено з 35 для чіткіших меж
                    maxZoom: 13,  // Heat map показується до зуму 13
                    max: 1.0,    // Максимальна інтенсивність
                    minOpacity: isDarkMode ? 0.5 : 0.6,
                    gradient: gradient
                }).addTo(map);

                setHeatLayer(heat);
            }
        }
    }, [currentZoom, isHeatLibLoaded, records, map, isDarkMode, colorScheme]);

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
    const [records, setRecords] = useState<Record[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [showClusters, setShowClusters] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_clusters');
            return saved !== null ? saved === 'true' : true; // За замовчуванням true
        }
        return true;
    });
    const [showHeatMap, setShowHeatMap] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_heatmap');
            return saved !== null ? saved === 'true' : false; // За замовчуванням false
        }
        return false;
    });
    const [showIndividualMarkers, setShowIndividualMarkers] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_show_individual');
            return saved !== null ? saved === 'true' : false; // За замовчуванням false
        }
        return false;
    });
    const [colorScheme, setColorScheme] = useState<'blue' | 'rgb'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('map_color_scheme');
            return (saved === 'blue' ? 'blue' : 'rgb') as 'blue' | 'rgb'; // За замовчуванням rgb
        }
        return 'rgb';
    });
    const router = useRouter();

    // Визначаємо тему
    useEffect(() => {
        const checkDarkMode = () => {
            // Пріоритет: localStorage > клас на html > системні налаштування
            const savedTheme = localStorage.getItem('theme');
            let isDark = false;
            
            if (savedTheme) {
                // Якщо є збережена тема - використовуємо її
                isDark = savedTheme === 'dark';
            } else if (document.documentElement.classList.contains('dark')) {
                // Якщо немає збереженої теми, але є клас - використовуємо клас
                isDark = true;
            } else {
                // Якщо нічого немає - використовуємо системні налаштування
                isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
            
            console.log('Theme check:', {
                savedTheme,
                htmlHasDarkClass: document.documentElement.classList.contains('dark'),
                systemPreference: window.matchMedia('(prefers-color-scheme: dark)').matches,
                finalIsDark: isDark
            });
            setIsDarkMode(isDark);
        };

        checkDarkMode();

        // Слухаємо зміни класу на HTML
        const observer = new MutationObserver(() => {
            console.log('HTML class changed');
            checkDarkMode();
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        // Слухаємо зміни в localStorage (для синхронізації між вкладками)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'theme') {
                console.log('localStorage theme changed to:', e.newValue);
                checkDarkMode();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        // Слухаємо системні налаштування теми
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleMediaChange = () => {
            console.log('System theme changed');
            checkDarkMode();
        };
        mediaQuery.addEventListener('change', handleMediaChange);

        return () => {
            observer.disconnect();
            window.removeEventListener('storage', handleStorageChange);
            mediaQuery.removeEventListener('change', handleMediaChange);
        };
    }, []);

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
        
        // Додаємо/видаляємо клас на body для CSS
        if (colorScheme === 'rgb') {
            document.body.classList.add('rgb-scheme');
        } else {
            document.body.classList.remove('rgb-scheme');
        }
    }, [colorScheme]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const { data, error } = await supabase.rpc('get_unique_settlement_records');

            if (error) {
                console.error('Помилка завантаження:', error);
            } else {
                console.log('📊 Статистика завантажених даних:');
                console.log('Всього записів отримано:', data?.length || 0);
                
                const withCoords = data?.filter(r => r.latitude && r.longitude) || [];
                console.log('Записів з координатами:', withCoords.length);
                
                const withoutCoords = data?.filter(r => !r.latitude || !r.longitude) || [];
                console.log('Записів БЕЗ координат:', withoutCoords.length);
                
                const regions = data?.filter(r => r.mark_type === 0) || [];
                console.log('Регіонів (mark_type=0):', regions.length);
                
                const settlements = data?.filter(r => r.mark_type !== 0) || [];
                console.log('Населених пунктів (mark_type≠0):', settlements.length);
                
                setRecords(data);
            }
            
            setIsLoading(false);
        };

        fetchData();
    }, []);

    // Логування для діагностики
    console.log('MapPageComponent render, isDarkMode:', isDarkMode);

    return (
        <>
            <Header />
            <div style={{ height: 'calc(100vh - 80px)', width: '100%', position: 'relative' }}>
                {isLoading ? (
                    <div className="absolute z-[1001] top-0 left-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-lg font-medium text-gray-900 dark:text-gray-100">Завантаження карти...</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Плаваюча панель управління */}
                        <div className="fixed bottom-4 right-4 md:right-4 left-4 md:left-auto z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 md:p-4">
                            {/* Перемикачі */}
                            <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center gap-3">
                                {/* Перемикач Heat Map */}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8">
                                        <span className="text-2xl leading-none" title="Теплова карта">🌡️</span>
                                    </div>
                                    <button
                                        onClick={() => setShowHeatMap(!showHeatMap)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            showHeatMap 
                                                ? 'bg-blue-600' 
                                                : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                        aria-label="Увімкнути/вимкнути теплову карту"
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                showHeatMap ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Перемикач Кластерів */}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8">
                                        <span className="text-2xl leading-none" title="Кластеризація">🎯</span>
                                    </div>
                                    <button
                                        onClick={() => setShowClusters(!showClusters)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            showClusters 
                                                ? 'bg-blue-600' 
                                                : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                        aria-label="Увімкнути/вимкнути кластеризацію"
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                showClusters ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Перемикач Окремих позначок */}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8">
                                        <span className="text-2xl leading-none" title="Окремі позначки">📍</span>
                                    </div>
                                    <button
                                        onClick={() => setShowIndividualMarkers(!showIndividualMarkers)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            showIndividualMarkers 
                                                ? 'bg-blue-600' 
                                                : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                        aria-label="Увімкнути/вимкнути окремі позначки"
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                showIndividualMarkers ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Перемикач кольорової схеми */}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-8">
                                        <span className="text-2xl leading-none" title="Кольорова схема (Синя / RGB)">🎨</span>
                                    </div>
                                    <button
                                        onClick={() => setColorScheme(colorScheme === 'blue' ? 'rgb' : 'blue')}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                            colorScheme === 'rgb' 
                                                ? 'bg-gradient-to-r from-green-500 via-yellow-500 to-red-500' 
                                                : 'bg-blue-600'
                                        }`}
                                        aria-label="Перемкнути кольорову схему"
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                colorScheme === 'rgb' ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Легенда */}
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 flex items-center justify-center flex-shrink-0">
                                        <svg width="15" height="24" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="#2563eb"/>
                                            <circle cx="12.5" cy="12.5" r="4" fill="white"/>
                                        </svg>
                                    </div>
                                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">Населений пункт</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 flex items-center justify-center flex-shrink-0">
                                        <svg width="15" height="24" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z" fill="#dc2626"/>
                                            <circle cx="12.5" cy="12.5" r="4" fill="white"/>
                                        </svg>
                                    </div>
                                    <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight">Цілий регіон</span>
                                </div>
                            </div>
                        </div>

                        <ClientOnly>
                        {typeof window !== 'undefined' && (
                            <div style={{ height: '100%', width: '100%' }}>
                                <MapContainer 
                                    center={center} 
                                    zoom={6} 
                                    style={{ height: '100%', width: '100%' }} 
                                    scrollWheelZoom={true}
                                >
                                    {/* Dynamic Tile Layer - змінюється залежно від теми */}
                                    <DynamicTileLayer isDarkMode={isDarkMode} />
                                    
                                    <GeocoderControl />
                                    
                                    {/* Heat Map Layer - показується якщо увімкнена */}
                                    {showHeatMap && <HeatMapLayer records={records} isDarkMode={isDarkMode} colorScheme={colorScheme} />}
                                    
                                    {/* Відображення маркерів залежно від налаштувань */}
                                    {showClusters ? (
                                        /* Кластеризовані маркери */
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
                                            {records.map((record) => {
                                                if (!record.latitude || !record.longitude) return null;
                                                const position: [number, number] = [record.latitude, record.longitude];
                                                const isRegion = record.mark_type === 0;

                                                return (
                                                    <Marker 
                                                        key={record.id} 
                                                        position={position} 
                                                        icon={isRegion ? redIcon : blueIcon}
                                                    >
                                                        <Popup className="custom-popup">
                                                            <div className="dark:text-gray-900">
                                                                <strong>{record.current_settlement_name || 'Невідома назва'}</strong>
                                                                <br />
                                                                <button
                                                                    className="text-blue-600 underline mt-2 hover:text-blue-800"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();

                                                                        const params = new URLSearchParams();
                                                                        if (record.current_region) params.set('current_region', record.current_region);
                                                                        if (record.current_district) params.set('current_district', record.current_district);
                                                                        if (record.current_community) params.set('current_community', record.current_community);
                                                                        if (record.current_settlement_name) params.set('current_settlement_name', record.current_settlement_name);

                                                                        const url = `/settlement?${params.toString()}`;
                                                                        window.open(url, '_blank', 'noopener,noreferrer');
                                                                    }}
                                                                >
                                                                    Переглянути всі записи населеного пункту
                                                                </button>
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                );
                                            })}
                                        </MarkerClusterGroup>
                                    ) : showIndividualMarkers ? (
                                        /* Окремі позначки без кластеризації */
                                        records.map((record) => {
                                            if (!record.latitude || !record.longitude) return null;
                                            const position: [number, number] = [record.latitude, record.longitude];
                                            const isRegion = record.mark_type === 0;

                                            return (
                                                <Marker 
                                                    key={record.id} 
                                                    position={position} 
                                                    icon={isRegion ? redIcon : blueIcon}
                                                >
                                                    <Popup className="custom-popup">
                                                        <div className="dark:text-gray-900">
                                                            <strong>{record.current_settlement_name || 'Невідома назва'}</strong>
                                                            <br />
                                                            <button
                                                                className="text-blue-600 underline mt-2 hover:text-blue-800"
                                                                onClick={(e) => {
                                                                    e.preventDefault();

                                                                    const params = new URLSearchParams();
                                                                    if (record.current_region) params.set('current_region', record.current_region);
                                                                    if (record.current_district) params.set('current_district', record.current_district);
                                                                    if (record.current_community) params.set('current_community', record.current_community);
                                                                    if (record.current_settlement_name) params.set('current_settlement_name', record.current_settlement_name);

                                                                    const url = `/settlement?${params.toString()}`;
                                                                    window.open(url, '_blank', 'noopener,noreferrer');
                                                                }}
                                                            >
                                                                Переглянути всі записи населеного пункту
                                                            </button>
                                                        </div>
                                                    </Popup>
                                                </Marker>
                                            );
                                        })
                                    ) : null}
                                </MapContainer>
                            </div>
                        )}
                    </ClientOnly>
                    </>
                )}
            </div>
        </>
    );
}