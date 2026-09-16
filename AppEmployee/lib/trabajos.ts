import { apiGet, apiPost } from '../auth';

// Flujo de un trabajo del lado del trabajador, contra el backend de Nico
// (`backend/src/routes/trabajos.js`): solicitud → aceptación → PIN → finalización.

export type EstadoTrabajo = 'pendiente' | 'asignado' | 'en_progreso' | 'completado';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: EstadoTrabajo;
  /** Lugar del trabajo: la ubicación del empleador cuando lo publicó. */
  latitud: number;
  longitud: number;
  creado_en: string;
  /** Hasta cuándo se puede aceptar (el backend le da 15 minutos desde que se publica). */
  solicitud_expira_en: string | null;
  iniciado_en: string | null;
  finalizado_en: string | null;
  /** Solo viene en el detalle (`GET /api/trabajos/:id`): segundos entre el PIN y la finalización. */
  duracionSegundos?: number | null;
};

/** Tiempo para responder una solicitud entrante, salvo que expire antes. */
export const SEGUNDOS_LIMITE_POR_DEFECTO = 30;

export function segundosParaResponder(trabajo: Trabajo): number {
  if (!trabajo.solicitud_expira_en) return SEGUNDOS_LIMITE_POR_DEFECTO;
  const hastaQueExpira = Math.floor((new Date(trabajo.solicitud_expira_en).getTime() - Date.now()) / 1000);
  return Math.max(1, Math.min(SEGUNDOS_LIMITE_POR_DEFECTO, hastaQueExpira));
}

// "45 min", "1 h 20 min".
export function formatearDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

// GET /api/trabajos — como empleado, devuelve solo los trabajos en estado 'pendiente'.
export async function listarTrabajos(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos');
}

// GET /api/trabajos/mios — los trabajos que este empleado tiene asignados/en curso/completados.
export async function misTrabajosAsignados(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos/mios');
}

// GET /api/trabajos/:id
export async function obtenerTrabajo(id: string): Promise<{ trabajo: Trabajo }> {
  return apiGet(`/api/trabajos/${id}`);
}

// POST /api/trabajos/:id/aceptar
export async function aceptarTrabajo(id: string): Promise<{ message: string }> {
  return apiPost(`/api/trabajos/${id}/aceptar`);
}

// POST /api/trabajos/:id/validar-pin — el empleado ingresa el PIN que le dio el
// empleador en persona para pasar el trabajo de 'asignado' a 'en_progreso'.
export async function validarPin(id: string, pin: string): Promise<{ success: boolean; message: string }> {
  return apiPost(`/api/trabajos/${id}/validar-pin`, { pin });
}

// POST /api/trabajos/:id/completar
export async function completarTrabajo(id: string): Promise<{ message: string; duracionSegundos: number | null }> {
  return apiPost(`/api/trabajos/${id}/completar`);
}
