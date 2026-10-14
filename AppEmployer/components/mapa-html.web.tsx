import type { CSSProperties } from 'react';

type Props = {
  html: string;
  style?: CSSProperties;
};

// react-native-webview no soporta web (renderiza solo el texto "React Native
// WebView does not support this platform." y el mapa queda en blanco) — en
// esta plataforma se usa un <iframe srcDoc> nativo del navegador en su lugar,
// que sirve el mismo HTML de Leaflet.
export default function MapaHtml({ html, style }: Props) {
  return (
    <iframe
      srcDoc={html}
      style={{ border: 0, ...style }}
    />
  );
}
