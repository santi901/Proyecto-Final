import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { fetchAutenticado } from '../auth';

// Foto de evidencia del trabajo terminado. La guarda el backend en S3:
// POST /api/trabajos/:trabajoId/evidencia  (multipart: campo `foto`; solo el trabajador asignado,
// con el trabajo en curso o completado — quién la sube sale del JWT)

// Subir una foto tarda bastante más que un request común.
const TIMEOUT_SUBIDA_MS = 60000;

export async function subirEvidencia(trabajoId: string, uri: string): Promise<void> {
  const form = new FormData();
  const nombre = `evidencia-${trabajoId}.jpg`;

  if (Platform.OS === 'web') {
    // En web el picker devuelve una URI de blob: hay que adjuntar el archivo en sí.
    const blob = await (await fetch(uri)).blob();
    form.append('foto', blob, nombre);
  } else {
    form.append('foto', new File(uri), nombre);
  }

  let res: Response;
  try {
    res = await fetchAutenticado(
      `/api/trabajos/${trabajoId}/evidencia`,
      { method: 'POST', body: form },
      TIMEOUT_SUBIDA_MS,
    );
  } catch (e: any) {
    console.log('Error subiendo la evidencia:', e?.message);
    throw new Error('No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `No pudimos subir la foto (${res.status}).`);
  }
}
