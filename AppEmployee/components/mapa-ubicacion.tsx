import { WebView } from 'react-native-webview';

type Props = {
  lat: number;
  lng: number;
};

// Mapa con la ubicación actual del trabajador.
// Usa WebView + Leaflet (mismo patrón que el mapa del registro) para no depender
// de un dev build ni de una API key de Google Maps, y funcionar en Expo Go.
export default function MapaUbicacion({ lat, lng }: Props) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false, attributionControl: false })
          .setView([${lat}, ${lng}], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        // Punto "estás acá" con halo, estilo Cabify/Uber
        L.circle([${lat}, ${lng}], { radius: 90, color: '#FFD539', fillColor: '#FFD539', fillOpacity: 0.18, weight: 1 }).addTo(map);
        L.circleMarker([${lat}, ${lng}], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#0C1531', fillOpacity: 1 }).addTo(map);
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      source={{ html }}
      style={{ flex: 1 }}
      scrollEnabled={false}
      originWhitelist={['*']}
    />
  );
}
