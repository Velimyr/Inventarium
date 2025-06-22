import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;

const placeIcon = new L.Icon({
  iconUrl: '/marker-icon.png',
  iconRetinaUrl: '/marker-icon-2x.png',
  shadowUrl: '/marker-shadow.png',
  shadowRetinaUrl: '/marker-shadow@2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
