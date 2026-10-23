import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Lee una foto local (la URI que devuelve expo-image-picker) como base64.
//
// Lo usa la verificación de identidad (lib/verificacion.ts), que manda el DNI y la
// selfie como base64 dentro de un JSON: leyendo el archivo acá, lo que viaja es
// exactamente su contenido. La foto de evidencia va como multipart (adjuntarImagen).
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

// Adjunta una imagen local (la URI que devuelve expo-image-picker) a un FormData.
//
// En el celular hay que usar el objeto { uri, name, type }: React Native lee el
// archivo de esa URI al mandar el request. NO usar `new File(uri)` de
// expo-file-system acá — el FormData de React Native no lo serializa como archivo
// y la imagen llega vacía (0 bytes) al backend; con dos fotos vacías, la
// verificación responde "El DNI y la selfie no pueden ser la misma imagen".
//
// En web el picker devuelve una URI blob:/data:, así que se adjunta el Blob en sí.
export async function adjuntarImagen(form: FormData, campo: string, uri: string, nombre: string) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append(campo, blob, nombre);
  } else {
    form.append(campo, { uri, name: nombre, type: 'image/jpeg' } as any);
  }
}
