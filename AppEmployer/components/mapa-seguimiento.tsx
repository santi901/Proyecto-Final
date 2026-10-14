import { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';
import type { Coordenadas } from '../lib/ubicacion';

type Props = {
  /** Dónde está el empleador (el lugar del trabajo). */
  empleador: Coordenadas;
  /** Última posición conocida del trabajador. `null` mientras no llega ninguna. */
  trabajador: Coordenadas | null;
};

// Mapa de seguimiento: muestra el lugar del trabajo y el pin del trabajador moviéndose.
//
// Mismo patrón que `mapa-ubicacion` (WebView + Leaflet, para no depender de un dev build
// ni de una API key de Google), pero acá el pin del trabajador se mueve sin recargar el
// mapa: el HTML se arma una sola vez y después se le inyecta la posición nueva.
export default function MapaSeguimiento({ empleador, trabajador }: Props) {
  const webRef = useRef<WebView>(null);

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
          .setView([${empleador.lat}, ${empleador.lng}], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        // Lugar del trabajo (fijo)
        L.circle([${empleador.lat}, ${empleador.lng}], { radius: 90, color: '#FFD539', fillColor: '#FFD539', fillOpacity: 0.18, weight: 1 }).addTo(map);
        L.circleMarker([${empleador.lat}, ${empleador.lng}], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#FFD539', fillOpacity: 1 }).addTo(map);

        // Pin del trabajador: se crea al recibir la primera posición y después sólo se mueve.
        var pinTrabajador = null;

        function moverTrabajador(lat, lng) {
          if (pinTrabajador) {
            pinTrabajador.setLatLng([lat, lng]);
          } else {
            pinTrabajador = L.circleMarker([lat, lng], {
              radius: 10, color: '#ffffff', weight: 3, fillColor: '#0C1531', fillOpacity: 1,
            }).addTo(map);
          }
          map.fitBounds(
            L.latLngBounds([[lat, lng], [${empleador.lat}, ${empleador.lng}]]),
            { padding: [60, 60], maxZoom: 16 }
          );
        }
      </script>
    </body>
    </html>
  `;

  useEffect(() => {
    if (!trabajador) return;
    webRef.current?.injectJavaScript(
      `moverTrabajador(${trabajador.lat}, ${trabajador.lng}); true;`,
    );
  }, [trabajador]);

  return (
    <WebView
      ref={webRef}
      source={{ html }}
      style={{ flex: 1 }}
      scrollEnabled={false}
      originWhitelist={['*']}
    />
  );
}
