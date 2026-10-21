import { NACHO_API_URL } from '../auth';
import { leerBase64 } from './archivos';
import { fetchConTimeout } from './fetchConTimeout';

// Foto de evidencia del trabajo terminado. La guarda el backend de Nacho (NestJS) en S3:
// POST {NACHO_API_URL}/trabajos/:trabajoId/evidencia  (JSON: `fotoBase64` + `subidoPor`;
// ver lib/archivos.ts por qué no va como multipart)

// Subir una foto tarda bastante más que un request común.
const TIMEOUT_SUBIDA_MS = 60000;

export async function subirEvidencia(trabajoId: string, subidoPor: string, uri: string): Promise<void> {
  let res: Response;
  try {
    const fotoBase64 = await leerBase64(uri);
    res = await fetchConTimeout(
      `${NACHO_API_URL}/trabajos/${trabajoId}/evidencia`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotoBase64, subidoPor }),
      },
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
