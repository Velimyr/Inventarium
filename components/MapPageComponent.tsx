// components/MapPageComponent.tsx
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/header';
import ClientOnly from '../components/clientonly';

// Динамічний імпорт react-leaflet компонентів
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(mod => mod.Circle), { ssr: false });

const center: [number, number] = [48.3794, 31.1656];

let defaultIcon: any = null;
if (typeof window !== 'undefined') {
  const L = require('leaflet');
  defaultIcon = new L.Icon({
    iconUrl: '/markers_default.png',
    iconRetinaUrl: '/markers_default@2x.png',
    shadowUrl: '/markers_shadow.png',
    shadowRetinaUrl: '/markers_shadow@2x.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

interface Record {
  id: string;
  latitude: number | null;
  longitude: number | null;
  mark_type: string | null;
  current_settlement_name: string | null;
}

export default function MapPageComponent() {
  const [records, setRecords] = useState<Record[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('records')
        .select('id, latitude, longitude, mark_type, current_settlement_name')
        .eq('approved', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) {
        console.error('Помилка завантаження:', error);
      } else {
        setRecords(data);
      }
    };

    fetchData();
  }, []);

  return (
    <>
      <Header />
      <div style={{ height: 'calc(100vh - 80px)', width: '100%' }}>
        <ClientOnly>
          {typeof window !== 'undefined' && (
            <div style={{ height: '100%', width: '100%' }}>
              <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {records.map((record) => {
                  if (!record.latitude || !record.longitude) return null;
                  const position: [number, number] = [record.latitude, record.longitude];
                  const isRegion = record.mark_type === 'Регіон';

                  return (
                    <Marker key={record.id} position={position} icon={defaultIcon}>
                      <Popup>
                        <div>
                          <strong>{record.current_settlement_name || 'Невідома назва'}</strong>
                          <br />
                          <button
                            className="text-blue-600 underline"
                            onClick={() => router.push(`/record/${record.id}`)}
                          >
                            Переглянути запис
                          </button>
                        </div>
                      </Popup>
                      {isRegion && (
                        <Circle center={position} radius={20000} pathOptions={{ color: 'rgba(255,0,0,0.3)' }} />
                      )}
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          )}
        </ClientOnly>
      </div>
    </>
  );
}
