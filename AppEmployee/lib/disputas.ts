import { adjuntarImagen } from './archivos';
import { apiGet, fetchAutenticado } from '../auth';

// Disputas (Sprint 6): reportar un problema con un trabajo. El reporte va al panel de
// admin del backend (GET /admin), donde el equipo lo revisa y lo resuelve.
//   POST /api/trabajos/:id/disputas   multipart: motivo, descripcion, foto (opcional)
//   GET  /api/trabajos/:id/disputas   mis reportes de ese trabajo
//   GET  /api/trabajos/motivos-disputa
// Mismo archivo en las dos apps.

export type MotivoDisputa = { codigo: string; texto: string };

export type EstadoDisputa = 'abierta' | 'en_revision' | 'resuelta' | 'rechazada';

export type Disputa = {
  id: string;
  trabajo_id: string;
  motivo: string;
  motivoTexto: string;
  descripcion: string;
  estado: EstadoDisputa;
  resolucion: string | null;
  creado_en: string;
  fotoUrl: string | null;
};

const TIMEOUT_SUBIDA_MS = 60000;

export async function obtenerMotivosDisputa(): Promise<MotivoDisputa[]> {
  const { motivos } = await apiGet('/api/trabajos/motivos-disputa');
  return motivos;
}

export async function misDisputas(trabajoId: string): Promise<Disputa[]> {
  const { disputas } = await apiGet(`/api/trabajos/${trabajoId}/disputas`);
  return disputas;
}

export async function reportarProblema(
  trabajoId: string,
  datos: { motivo: string; descripcion: string; fotoUri?: string | null },
): Promise<Disputa> {
  // Multipart (no JSON) porque puede llevar la foto; sin foto, va igual como form.
  const form = new FormData();
  form.append('motivo', datos.motivo);
  form.append('descripcion', datos.descripcion);
  if (datos.fotoUri) await adjuntarImagen(form, 'foto', datos.fotoUri, `disputa-${trabajoId}.jpg`);

  let res: Response;
  try {
    res = await fetchAutenticado(`/api/trabajos/${trabajoId}/disputas`, { method: 'POST', body: form }, TIMEOUT_SUBIDA_MS);
  } catch (e: any) {
    console.log('Error mandando el reporte:', e?.message);
    throw new Error('No pudimos mandar el reporte. Revisá tu conexión e intentá de nuevo.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `No pudimos mandar el reporte (${res.status}).`);
  return data.disputa;
}

export const ESTADO_DISPUTA_LABEL: Record<EstadoDisputa, string> = {
  abierta: 'Enviado, esperando revisión',
  en_revision: 'En revisión',
  resuelta: 'Resuelto',
  rechazada: 'Rechazado',
};
