import { NACHO_API_URL } from '../auth';
import { fetchConTimeout } from './fetchConTimeout';

// Fotos de evidencia que sube el trabajador al terminar. Las guarda el backend de Nacho en S3:
// GET {NACHO_API_URL}/trabajos/:trabajoId/evidencia  → la más nueva primero

export type Evidencia = {
  id: string;
  trabajo_id: string;
  s3_key: string;
  subido_por: string;
  creado_en: string;
  /**
   * URL firmada para ver la foto (el bucket es privado, así que con `s3_key` sola no alcanza).
   * La agrega el backend en cada fila y vence a la hora, por eso se relee en cada consulta.
   * Queda opcional por si el backend responde una fila vieja sin firmar.
   */
  url?: string;
};

// Respaldo por si el backend no manda la URL firmada: si el bucket permitiera lectura
// pública, alcanza con definir EXPO_PUBLIC_EVIDENCIA_BASE_URL en el .env.
const EVIDENCIA_BASE_URL = process.env.EXPO_PUBLIC_EVIDENCIA_BASE_URL;

export function urlDeEvidencia(evidencia: Evidencia): string | null {
  if (evidencia.url) return evidencia.url;
  if (EVIDENCIA_BASE_URL) return `${EVIDENCIA_BASE_URL.replace(/\/$/, '')}/${evidencia.s3_key}`;
  return null;
}

export async function listarEvidencia(trabajoId: string): Promise<Evidencia[]> {
  const res = await fetchConTimeout(`${NACHO_API_URL}/trabajos/${trabajoId}/evidencia`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `No se pudo cargar la evidencia (${res.status}).`);
  return Array.isArray(data) ? data : [];
}
