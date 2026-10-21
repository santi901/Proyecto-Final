import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Lee una foto local (la URI que devuelve expo-image-picker) como base64.
//
// Las fotos se mandan a los backends como base64 dentro de un JSON y no como multipart:
// con objetos `File` de expo-file-system en un FormData, según qué fetch quedara activo
// (el de React Native o el de Expo) el contenido no llegaba bien (en la verificación,
// el DNI y la selfie llegaban con los mismos bytes). Leyendo el archivo acá, lo que
// viaja es exactamente su contenido.
export async function leerBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  }
  // En web el picker devuelve un blob: o data: URI.
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}
