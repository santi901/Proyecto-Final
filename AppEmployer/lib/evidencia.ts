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
  /** Si el backend empieza a devolver una URL (firmada) para ver la foto, se usa esa. */
  url?: string;
};

// Hoy el backend devuelve solo la key del archivo en S3, no una URL para verlo. Si el bucket
// permite lectura pública, alcanza con definir EXPO_PUBLIC_EVIDENCIA_BASE_URL en el .env.
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
