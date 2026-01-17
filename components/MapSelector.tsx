import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { useState, useEffect } from 'react';
import L from 'leaflet';

interface MapSelectorProps {
  latitude: string;
  longitude: string;
  onPositionChange: (lat: string, lng: string) => void;
}

// Компонент для централізації карти при зміні координат
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Компонент для динамічної зміни tile layer
function DynamicTileLayer({ isDarkMode }: { isDarkMode: boolean }) {
  const map = useMap();

  useEffect(() => {
    console.log('MapSelector DynamicTileLayer: isDarkMode =', isDarkMode);
    
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

    console.log('MapSelector loading tiles from:', tileUrl);

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

export default function MapSelector({ latitude, longitude, onPositionChange }: MapSelectorProps) {
  console.log('🗺️ MapSelector RENDERED!', { latitude, longitude });
  
  const parsedLat = parseFloat(latitude);
  const parsedLng = parseFloat(longitude);
  const hasValidCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  const [markerPosition, setMarkerPosition] = useState<L.LatLng | null>(
    hasValidCoords ? L.latLng(parsedLat, parsedLng) : null
  );

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
      
      console.log('MapSelector theme check:', {
        savedTheme,
        htmlHasDarkClass: document.documentElement.classList.contains('dark'),
        systemPreference: window.matchMedia('(prefers-color-scheme: dark)').matches,
        finalIsDark: isDark
      });
      
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    const observer = new MutationObserver(() => {
      console.log('MapSelector: HTML class changed');
      checkDarkMode();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'theme') {
        console.log('MapSelector: localStorage theme changed to:', e.newValue);
        checkDarkMode();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      console.log('MapSelector: System theme changed');
      checkDarkMode();
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorageChange);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

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
    <div className="h-64 border dark:border-gray-600 rounded overflow-hidden">
      <MapContainer
        center={hasValidCoords ? [parsedLat, parsedLng] : [50.4501, 30.5234]} // Київ
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Динамічний tile layer залежно від теми - Stadia Maps */}
        <DynamicTileLayer isDarkMode={isDarkMode} />
        
        <MapClickHandler />
        {markerPosition && <Marker position={markerPosition} />}
        {hasValidCoords && <RecenterMap lat={parsedLat} lng={parsedLng} />}    
      </MapContainer>
      <p className="text-sm mt-2 text-gray-600 dark:text-gray-400">
        !!!Натисніть на карту, щоб вибрати координати: {latitude}, {longitude}
      </p>
    </div>
  );
}