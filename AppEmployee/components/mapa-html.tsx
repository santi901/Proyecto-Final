import { WebView } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  html: string;
  style?: StyleProp<ViewStyle>;
};

// Envoltorio nativo: renderiza el HTML (Leaflet) dentro de una WebView.
// En web se usa mapa-html.web.tsx en su lugar (react-native-webview no
// soporta esa plataforma — ver ese archivo para el detalle).
export default function MapaHtml({ html, style }: Props) {
  return (
    <WebView
      source={{ html }}
      style={style}
      scrollEnabled={false}
      originWhitelist={['*']}
    />
  );
}
