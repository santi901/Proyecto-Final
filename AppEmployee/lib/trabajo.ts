import { apiGet, apiPost } from '../auth';
import { NACHO_API_URL, type Coordenadas } from './ubicacion';

// Flujo completo de un trabajo (Sprint 4): solicitud → aceptación → PIN → evidencia → finalización.
//
// Los endpoints de trabajos son los del backend de Nico (`backend/src/routes/trabajos.js`).
// Los de ubicación en tiempo real son de Ignacio y todavía no existen, así que las
// funciones que los usan degradan sin romper la pantalla (ver `ubicacionDelTrabajador`).

export type EstadoTrabajo = 'pendiente' | 'asignado' | 'en_progreso' | 'completado';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: EstadoTrabajo;
  creado_en: string;
  /** Dirección donde hay que presentarse. La manda el empleador al publicar. */
  direccion?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Segundos que tiene el trabajador para responder la solicitud. Lo define Ignacio. */
  segundos_limite?: number | null;
};

/** Si el backend no manda un límite propio, la solicitud dura 30 segundos. */
export const SEGUNDOS_LIMITE_POR_DEFECTO = 30;

// ── Trabajos (backend de Nico) ────────────────────────────────────────────────

/** Trabajos que el trabajador todavía puede tomar. */
export async function listarDisponibles(): Promise<Trabajo[]> {
  const data = await apiGet('/api/trabajos');
  return data.trabajos ?? [];
}

export async function obtenerTrabajo(trabajoId: string): Promise<Trabajo> {
  const data = await apiGet(`/api/trabajos/${trabajoId}`);
  return data.trabajo;
}

export async function aceptarTrabajo(trabajoId: string): Promise<void> {
  await apiPost(`/api/trabajos/${trabajoId}/aceptar`);
}

/**
 * Valida el PIN que le dictó el empleador. Si es correcto el trabajo pasa a `en_progreso`.
 * Devuelve el mensaje de error del backend en vez de tirar, para poder mostrarlo en el campo.
 */
export async function validarPin(trabajoId: string, pin: string): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const data = await apiPost(`/api/trabajos/${trabajoId}/validar-pin`, { pin });
    return { ok: true, mensaje: data.message ?? 'PIN validado.' };
  } catch (e: any) {
    return { ok: false, mensaje: e?.message ?? 'No pudimos validar el PIN.' };
  }
}

export async function completarTrabajo(trabajoId: string): Promise<void> {
  await apiPost(`/api/trabajos/${trabajoId}/completar`);
}

// ── Ubicación en tiempo real (backend de Ignacio) ─────────────────────────────

/**
 * Manda una posición del trabajador asociada a un trabajo, para que el empleador
 * la vea moverse en su mapa. El endpoint todavía no existe del lado de Ignacio:
 * si falla, se ignora (la pantalla no se bloquea por esto).
 */
export async function enviarPosicionDeTrabajo(
  trabajoId: string,
  userId: string,
  coords: Coordenadas,
): Promise<void> {
  await fetch(`${NACHO_API_URL}/location/trabajo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trabajoId, userId, lat: coords.lat, lng: coords.lng }),
  });
}
