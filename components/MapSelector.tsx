import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useState, useEffect } from 'react';
import L from 'leaflet';

interface MapSelectorProps {
  latitude: string;
  longitude: string;
  //onChange: (lat: string, lng: string) => void;
  onPositionChange: (lat: string, lng: string) => void;
}

export default function MapSelector({ latitude, longitude, onPositionChange }: MapSelectorProps) {
  const parsedLat = parseFloat(latitude);
  const parsedLng = parseFloat(longitude);
  const hasValidCoords = !isNaN(parsedLat) && !isNaN(parsedLng);
  const [markerPosition, setMarkerPosition] = useState<L.LatLng | null>(
    hasValidCoords ? L.latLng(parsedLat, parsedLng) : null
  );

  const center = hasValidCoords ? [parsedLat, parsedLng] : [48.3794, 31.1656]; // Центр України

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

  // Синхронізуй маркер, якщо координати змінюються зовні
  useEffect(() => {
    if (hasValidCoords) {
      setMarkerPosition(L.latLng(parsedLat, parsedLng));
    }
  }, [parsedLat, parsedLng]);

  return (
    <div className="h-64 border dark:border-gray-600 rounded overflow-hidden">
      <MapContainer center={center as [number, number]} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler />
        {markerPosition && <Marker position={markerPosition} />}
      </MapContainer>
      <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
        Натисніть на карту, щоб вибрати координати: {latitude}, {longitude}
      </p>
    </div>
  );
}
