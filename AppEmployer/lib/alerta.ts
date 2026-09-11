import { Alert, Platform } from 'react-native';

// En web, Alert.alert de react-native-web es un no-op (no muestra nada) —
// sin esto, mensajes como el PIN al publicar un trabajo se pierden en silencio.
export function alertaSimple(titulo: string, mensaje: string) {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensaje}`);
  } else {
    Alert.alert(titulo, mensaje);
  }
}
