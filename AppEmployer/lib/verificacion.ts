import { API_URL } from '../auth';
import { leerBase64 } from './archivos';
import { fetchConTimeout } from './fetchConTimeout';

// Verificación de identidad: POST /api/verificacion/comparar-caras en el backend de Nico
// (Rekognition compara la cara del DNI con la selfie).
//
// Las fotos van como base64 dentro de un JSON, no como multipart: ver lib/archivos.ts
// (con multipart el DNI y la selfie llegaban con los mismos bytes).

export type ResultadoVerificacion = {
  coinciden?: boolean;
  similitud?: number;
  estado?: 'aprobado' | 'rechazado';
  mensaje?: string;
  error?: string;
  message?: string;
};

// Rekognition + 2 subidas a S3 pueden tardar bastante más que un request común.
const TIMEOUT_VERIFICACION_MS = 60000;

export async function verificarIdentidad(
  fotoDniUri: string,
  selfieUri: string,
  userId: string,
): Promise<{ ok: boolean; resultado: ResultadoVerificacion }> {
  const [dni, selfie] = await Promise.all([leerBase64(fotoDniUri), leerBase64(selfieUri)]);

  const res = await fetchConTimeout(
    `${API_URL}/api/verificacion/comparar-caras`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, selfie, userId }),
    },
    TIMEOUT_VERIFICACION_MS,
  );

  const resultado: ResultadoVerificacion = await res.json().catch(() => ({}));
  return { ok: res.ok, resultado };
}
