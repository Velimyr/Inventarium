import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { useState, useEffect } from 'react';
import L from 'leaflet';
import GeocoderControl from './GeocoderControl';

interface MapSelectorProps {
  latitude: string;
  longitude: string;
  onPositionChange: (lat: string, lng: string) => void;
  center?: [number, number];   // куди дивитись, поки координат ще немає
  height?: string;
}

// Компонент для централізації карти при зміні координат
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function MapSelector({
  latitude,
  longitude,
  onPositionChange,
  center = [50.4501, 30.5234],
  height = 'h-64',
}: MapSelectorProps) {
  const parsedLat = parseFloat(latitude);
  const parsedLng = parseFloat(longitude);
  const hasValidCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  const [markerPosition, setMarkerPosition] = useState<L.LatLng | null>(
    hasValidCoords ? L.latLng(parsedLat, parsedLng) : null
  );

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setMarkerPosition(e.latlng);
        onPositionChange(lat.toFixed(6), lng.toFixed(6));
      },
    });
    return null;
  };

  useEffect(() => {
    if (hasValidCoords) {
      setMarkerPosition(L.latLng(parsedLat, parsedLng));
    }
  }, [parsedLat, parsedLng, hasValidCoords]);

  useEffect(() => {
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      setMarkerPosition(L.latLng(parsedLat, parsedLng));
    } else {
      // якщо координати порожні або некоректні → прибираємо маркер
      setMarkerPosition(null);
    }
  }, [parsedLat, parsedLng]);

  return (
    <div className="space-y-2">
      {/* Карта */}
      <div className={`${height} border dark:border-gray-600 rounded-lg overflow-hidden`}>
        <MapContainer
          center={hasValidCoords ? [parsedLat, parsedLng] : center}
          zoom={hasValidCoords ? 12 : 7}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          <MapClickHandler />
          <GeocoderControl />
          {markerPosition && <Marker position={markerPosition} />}
          {hasValidCoords && <RecenterMap lat={parsedLat} lng={parsedLng} />}    
        </MapContainer>
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Натисніть на карту або скористайтесь пошуком (🔍). Координати: {latitude}, {longitude}
      </p>
    </div>
  );
}