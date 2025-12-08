// pages/case.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import ClientOnly from '../components/clientonly';

// Динамічний імпорт react-leaflet компонентів БЕЗ SSR
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });
const GeocoderControl = dynamic(() => import('../components/GeocoderControl'), { ssr: false });

interface Record {
    id: string;
    latitude: number | null;
    longitude: number | null;
    mark_type: number | null;
    current_settlement_name: string | null;
    current_settlement_type: string | null;
    current_region: string | null;
    current_district: string | null;
    current_community: string | null;
    old_settlement_name: string | null;
    old_settlement_type: string | null;
    old_province: string | null;
    old_district: string | null;
    old_community: string | null;
    inventory_start_page: string | null;
    case_signature: string | null;
    case_title: string | null;
    inventory_year: string | null;
    archive: string | null;
    fonds: string | null;
    series: string | null;
    record: string | null;
}

export default function CasePage() {
    const router = useRouter();
    const { case_signature } = router.query;
    const [records, setRecords] = useState<Record[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [caseInfo, setCaseInfo] = useState<any>(null);
    const [icons, setIcons] = useState<any>({ blueIcon: null, redIcon: null });

    // Створюємо іконки тільки на клієнті після монтування
    useEffect(() => {
        if (typeof window !== 'undefined') {
            import('leaflet').then((L) => {
                const leaflet = L.default || L;
                setIcons({
                    blueIcon: leaflet.icon({
                        iconUrl: '/icons/marker-blue.svg',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -41],
                    }),
                    redIcon: leaflet.icon({
                        iconUrl: '/icons/marker-red.svg',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -41],
                    })
                });
            }).catch(err => {
                console.error('Failed to load Leaflet:', err);
            });
        }
    }, []);

    useEffect(() => {
        if (!case_signature) return;

        const fetchRecords = async () => {
            setIsLoading(true);

            const { data, error } = await supabase
                .from('records')
                .select('*')
                .eq('case_signature', case_signature);

            if (error) {
                console.error('Помилка завантаження:', error);
            } else {
                setRecords(data || []);
                
                if (data && data.length > 0) {
                    setCaseInfo(data[0]);
                }
            }

            setIsLoading(false);
        };

        fetchRecords();
    }, [case_signature]);

    // Обчислюємо центр карти на основі записів
    const getMapCenter = (): [number, number] => {
        const validRecords = records.filter(r => r.latitude && r.longitude);
        if (validRecords.length === 0) return [48.3794, 31.1656];

        const avgLat = validRecords.reduce((sum, r) => sum + (r.latitude || 0), 0) / validRecords.length;
        const avgLon = validRecords.reduce((sum, r) => sum + (r.longitude || 0), 0) / validRecords.length;

        return [avgLat, avgLon];
    };

    return (
        <>
            <Header />
            <main className="w-full bg-white dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
                {caseInfo && (
                    <section className="p-6 border-b dark:border-gray-700">
                        <h1 className="text-2xl font-bold mb-4">Справа: {case_signature}</h1>
                    </section>
                )}

                <div style={{ height: '500px', width: '100%', position: 'relative' }}>
                    {isLoading ? (
                        <div className="absolute z-[1001] top-0 left-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-lg font-medium text-gray-900 dark:text-gray-100">Завантаження даних...</span>
                            </div>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="absolute z-[1001] top-0 left-0 w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                            <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                Записів не знайдено
                            </span>
                        </div>
                    ) : (
                        <ClientOnly>
                            <MapContainer 
                                center={getMapCenter()} 
                                zoom={8} 
                                style={{ height: '100%', width: '100%' }} 
                                scrollWheelZoom={true}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <GeocoderControl />
                                {records.map((record) => {
                                    if (!record.latitude || !record.longitude) return null;
                                    const position: [number, number] = [record.latitude, record.longitude];
                                    const isRegion = record.mark_type === 0;

                                    return (
                                        <Marker 
                                            key={record.id} 
                                            position={position} 
                                            icon={isRegion ? (icons.redIcon || undefined) : (icons.blueIcon || undefined)}
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
                        </ClientOnly>
                    )}
                </div>

                {!isLoading && records.length > 0 && (
                    <section className="p-6">
                        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                            Знайдено записів: {records.length}
                        </div>
                        <h2 className="text-xl font-semibold mb-4">Населені пункти у справі</h2>

                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                                <thead>
                                    <tr className="bg-gray-100 dark:bg-gray-800">
                                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Сучасна назва</th>
                                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Історична назва</th>
                                        <th className="border border-gray-300 dark:border-gray-600 p-2 text-left">Адміністративний поділ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((record) => (
                                        <tr 
                                            key={record.id} 
                                            className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                                            onClick={() => router.push(`/record/${record.id}`)}
                                        >
                                            <td className="border border-gray-300 dark:border-gray-600 p-2">
                                                {record.current_settlement_type} {record.current_settlement_name || '—'}
                                            </td>
                                            <td className="border border-gray-300 dark:border-gray-600 p-2">
                                                {record.old_settlement_type && record.old_settlement_name
                                                    ? `${record.old_settlement_type} ${record.old_settlement_name}`
                                                    : '—'}
                                            </td>
                                            <td className="border border-gray-300 dark:border-gray-600 p-2">
                                                <div className="text-sm">
                                                    {[
                                                        record.current_region,
                                                        record.current_district,
                                                        record.current_community,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(', ') || '—'}
                                                </div>
                                                {(record.old_province || record.old_district || record.old_community) && (
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                        Історично: {[record.old_province, record.old_district, record.old_community]
                                                            .filter(Boolean)
                                                            .join(', ')}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="block sm:hidden space-y-4">
                            {records.map((record) => (
                                <div
                                    key={record.id}
                                    className="border rounded p-4 shadow-sm bg-white dark:bg-gray-800 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                                    onClick={() => router.push(`/record/${record.id}`)}
                                >
                                    <div className="mb-2">
                                        <div className="font-semibold text-lg">
                                            {record.current_settlement_type} {record.current_settlement_name || '—'}
                                        </div>
                                    </div>

                                    {(record.old_settlement_type || record.old_settlement_name) && (
                                        <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                                            <span className="font-semibold">Історична назва: </span>
                                            {record.old_settlement_type} {record.old_settlement_name}
                                        </div>
                                    )}

                                    <div className="mb-2 text-sm">
                                        <span className="font-semibold">Адміністративний поділ: </span>
                                        {[record.current_region, record.current_district, record.current_community]
                                            .filter(Boolean)
                                            .join(', ') || '—'}
                                    </div>

                                    {(record.old_province || record.old_district || record.old_community) && (
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            <span className="font-semibold">Історичний поділ: </span>
                                            {[record.old_province, record.old_district, record.old_community]
                                                .filter(Boolean)
                                                .join(', ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </>
    );
}