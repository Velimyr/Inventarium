// components/CaseMapComponent.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
const GeocoderControl = dynamic(() => import('./GeocoderControl'), { ssr: false });

interface Record {
    id: string;
    latitude: number | null;
    longitude: number | null;
    mark_type: number | null;
    current_settlement_name: string | null;
    current_settlement_type: string | null;
    old_settlement_name: string | null;
    old_settlement_type: string | null;
    inventory_start_page: string | null;
}

interface CaseMapComponentProps {
    records: Record[];
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
            className: 'map-tiles',
        });

        tileLayer.addTo(map);

        return () => {
            map.removeLayer(tileLayer);
        };
    }, [isDarkMode, map]);

    return null;
}

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

export default function CaseMapComponent({ records }: CaseMapComponentProps) {
    const router = useRouter();
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Визначаємо тему
    useEffect(() => {
        const checkDarkMode = () => {
            const savedTheme = localStorage.getItem('theme');
            let isDark = false;
            
            if (savedTheme) {
                isDark = savedTheme === 'dark';
            } else if (document.documentElement.classList.contains('dark')) {
                isDark = true;
            } else {
                isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            }
            
            setIsDarkMode(isDark);
        };

        checkDarkMode();

        const observer = new MutationObserver(() => {
            checkDarkMode();
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'theme') {
                checkDarkMode();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleMediaChange = () => {
            checkDarkMode();
        };
        mediaQuery.addEventListener('change', handleMediaChange);

        return () => {
            observer.disconnect();
            window.removeEventListener('storage', handleStorageChange);
            mediaQuery.removeEventListener('change', handleMediaChange);
        };
    }, []);

    // Обчислюємо центр карти
    const getMapCenter = (): [number, number] => {
        const validRecords = records.filter(r => r.latitude && r.longitude);
        if (validRecords.length === 0) return [50.4501, 30.5234]; // Київ

        const avgLat = validRecords.reduce((sum, r) => sum + (r.latitude || 0), 0) / validRecords.length;
        const avgLon = validRecords.reduce((sum, r) => sum + (r.longitude || 0), 0) / validRecords.length;

        return [avgLat, avgLon];
    };

    return (
        <MapContainer 
            center={getMapCenter()} 
            zoom={9} 
            style={{ height: '100%', width: '100%' }} 
            scrollWheelZoom={true}
        >
            {/* Динамічний tile layer - Stadia Maps */}
            <DynamicTileLayer isDarkMode={isDarkMode} />
            
            <GeocoderControl />
            
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
                        <Popup>
                            <div>
                                <strong>{record.current_settlement_name || 'Невідома назва'}</strong>
                                {record.current_settlement_type && (
                                    <span> ({record.current_settlement_type})</span>
                                )}
                                <br />
                                {record.old_settlement_name && (
                                    <>
                                        <span className="text-sm text-gray-600">
                                            Історична назва: {record.old_settlement_type} {record.old_settlement_name}
                                        </span>
                                        <br />
                                    </>
                                )}
                                {record.inventory_start_page && (
                                    <span className="text-sm text-gray-600">
                                        Сторінка: {record.inventory_start_page}
                                    </span>
                                )}
                            </div>
                        </Popup>
                        {isRegion && (
                            <Circle center={position} radius={20000} pathOptions={{ color: 'rgba(255,0,0,0.3)' }} />
                        )}
                    </Marker>
                );
            })}
        </MapContainer>
    );
}