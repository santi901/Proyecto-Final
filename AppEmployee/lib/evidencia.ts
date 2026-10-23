import { adjuntarImagen } from './archivos';
import { fetchAutenticado } from '../auth';

// Foto de evidencia del trabajo terminado. La guarda el backend en S3:
// POST /api/trabajos/:trabajoId/evidencia  (multipart: campo `foto`; solo el trabajador asignado,
// con el trabajo en curso o completado — quién la sube sale del JWT)

// Subir una foto tarda bastante más que un request común.
const TIMEOUT_SUBIDA_MS = 60000;

export async function subirEvidencia(trabajoId: string, uri: string): Promise<void> {
  const form = new FormData();
  const nombre = `evidencia-${trabajoId}.jpg`;

  await adjuntarImagen(form, 'foto', uri, nombre);

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
