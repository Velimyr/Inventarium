import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import L from 'leaflet';

interface MapSelectorProps {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
}

const LocationMarker = ({ onSelect }: { onSelect: (lat: string, lng: string) => void }) => {
  const [position, setPosition] = useState<L.LatLng | null>(null);

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition(e.latlng);
      onSelect(lat.toFixed(6), lng.toFixed(6));
    },
  });

  return position ? <Marker position={position} /> : null;
};

export default function MapSelector({ latitude, longitude, onChange }: MapSelectorProps) {
  const center = latitude && longitude ? [parseFloat(latitude), parseFloat(longitude)] : [48.3794, 31.1656]; // Центр України

  return (
    <div className="h-64 border dark:border-gray-600 rounded overflow-hidden">
      <MapContainer center={center as [number, number]} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker onSelect={onChange} />
      </MapContainer>
      <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
        Натисніть на карту, щоб вибрати координати: {latitude}, {longitude}
      </p>
    </div>
  );
}
