import { Platform } from 'react-native';
import { NACHO_API_URL } from '../auth';
import { fetchConTimeout } from './fetchConTimeout';

// Foto de evidencia del trabajo terminado. La guarda el backend de Nacho (NestJS) en S3:
// POST {NACHO_API_URL}/trabajos/:trabajoId/evidencia  (multipart: campo `foto` + `subidoPor`)

// Subir una foto tarda bastante más que un request común.
const TIMEOUT_SUBIDA_MS = 60000;

export async function subirEvidencia(trabajoId: string, subidoPor: string, uri: string): Promise<void> {
  const form = new FormData();
  const nombre = `evidencia-${trabajoId}.jpg`;

  if (Platform.OS === 'web') {
    // En web el picker devuelve una URI de blob: hay que adjuntar el archivo en sí.
    const blob = await (await fetch(uri)).blob();
    form.append('foto', blob, nombre);
  } else {
    form.append('foto', { uri, name: nombre, type: 'image/jpeg' } as any);
  }
  form.append('subidoPor', subidoPor);

  let res: Response;
  try {
    res = await fetchConTimeout(
      `${NACHO_API_URL}/trabajos/${trabajoId}/evidencia`,
      { method: 'POST', body: form },
      TIMEOUT_SUBIDA_MS,
    );
  } catch (e: any) {
    console.log('Error subiendo la evidencia:', e?.message);
    throw new Error('No pudimos subir la foto. Revisá tu conexión e intentá de nuevo.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Nest devuelve el motivo en `message` (a veces como lista de errores).
    const motivo = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(motivo || `No pudimos subir la foto (${res.status}).`);
  }
}
