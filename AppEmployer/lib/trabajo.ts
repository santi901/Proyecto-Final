import { apiGet, apiPost } from '../auth';
import { NACHO_API_URL, type Coordenadas } from './ubicacion';

// Flujo completo de un trabajo (Sprint 4) desde el lado del empleador:
// publicación → PIN → seguimiento del trabajador → confirmación de finalización.
//
// Los endpoints de trabajos son los del backend de Nico (`backend/src/routes/trabajos.js`).
// El de ubicación en tiempo real es de Ignacio y todavía no existe: ver `ubicacionDelTrabajador`.

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
  direccion?: string | null;
  /** URL de la foto que sube el trabajador al terminar. */
  evidencia_url?: string | null;
};

export type TrabajoCreado = { trabajo: Trabajo; pin: string };

// ── Trabajos (backend de Nico) ────────────────────────────────────────────────

/**
 * Publica el trabajo. El backend devuelve el PIN **una sola vez**, acá: es el código
 * que el empleador le dicta al trabajador cuando llega. No se puede volver a pedir.
 */
export async function crearTrabajo(datos: {
  titulo: string;
  descripcion: string;
  categoria: string;
  nivelDificultad?: string | null;
  precio: number;
}): Promise<TrabajoCreado> {
  return apiPost('/api/trabajos', datos);
}

export async function obtenerTrabajo(trabajoId: string): Promise<Trabajo> {
  const data = await apiGet(`/api/trabajos/${trabajoId}`);
  return data.trabajo;
}

export async function completarTrabajo(trabajoId: string): Promise<void> {
  await apiPost(`/api/trabajos/${trabajoId}/completar`);
}

// ── Ubicación del trabajador (backend de Ignacio) ─────────────────────────────

/**
 * Última posición conocida del trabajador asignado a este trabajo.
 *
 * El endpoint todavía no existe del lado de Ignacio (hoy sólo tiene
 * `GET /location/calcular-viaje`). Devuelve `null` si no se puede obtener, y la
 * pantalla de seguimiento muestra el aviso correspondiente en vez de romperse.
 */
export async function ubicacionDelTrabajador(trabajoId: string): Promise<Coordenadas | null> {
  try {
    const res = await fetch(`${NACHO_API_URL}/location/trabajo/${trabajoId}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return null;

    return { lat: data.lat, lng: data.lng };
  } catch {
    return null;
  }
}
