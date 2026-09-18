import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost } from '../auth';

// Flujo de un trabajo del lado del empleador, contra el backend de Nico
// (`backend/src/routes/trabajos.js`): publicación → PIN → seguimiento → finalización.

// 'cancelado' lo pone el empleador (POST /:id/cancelar) o, automáticamente, el poller de
// reasignación del backend cuando nadie acepta el trabajo después de 3 reintentos.
export type EstadoTrabajo = 'pendiente' | 'asignado' | 'en_progreso' | 'completado' | 'cancelado';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: EstadoTrabajo;
  latitud: number;
  longitud: number;
  creado_en: string;
  /** Hasta cuándo un trabajador puede aceptarlo (15 minutos desde que se publica). */
  solicitud_expira_en: string | null;
  iniciado_en: string | null;
  finalizado_en: string | null;
  /** Solo viene en el detalle (`GET /api/trabajos/:id`). */
  duracionSegundos?: number | null;
};

// POST /api/trabajos — el PIN devuelto solo viaja en esta respuesta, no se puede
// volver a consultar después: hay que mostrárselo al empleador en el momento.
export async function crearTrabajo(datos: {
  titulo: string;
  descripcion: string;
  categoria: string;
  nivelDificultad?: string | null;
  precio: number;
  latitud: number;
  longitud: number;
}): Promise<{ trabajo: Trabajo; pin: string }> {
  return apiPost('/api/trabajos', datos);
}

// GET /api/trabajos/mios — los trabajos que publicó este empleador, en cualquier estado.
export async function misTrabajosPublicados(): Promise<{ trabajos: Trabajo[] }> {
  return apiGet('/api/trabajos/mios');
}

// GET /api/trabajos/:id
export async function obtenerTrabajo(id: string): Promise<{ trabajo: Trabajo }> {
  return apiGet(`/api/trabajos/${id}`);
}

// POST /api/trabajos/:id/completar
/**
 * Completar necesita que confirmen **las dos partes**: la primera llamada deja el trabajo
 * en `en_progreso` con `esperandoConfirmacion: true`, y recién la segunda lo pasa a
 * `completado`. Hay que mirar `estado`: que la llamada no falle no significa que cerró.
 */
export type ResultadoCompletar = {
  message: string;
  estado: EstadoTrabajo;
  esperandoConfirmacion?: boolean;
  duracionSegundos?: number | null;
};

export async function completarTrabajo(id: string): Promise<ResultadoCompletar> {
  return apiPost(`/api/trabajos/${id}/completar`);
}

/** Cancela un trabajo `pendiente` o `asignado`. Solo el empleador dueño. */
export async function cancelarTrabajo(id: string, motivo?: string): Promise<{ message: string }> {
  return apiPost(`/api/trabajos/${id}/cancelar`, motivo ? { motivo } : {});
}

// El PIN solo viaja una vez en la respuesta de crearTrabajo (el backend guarda el hash,
// no el texto plano) — se guarda localmente en el dispositivo para poder mostrarlo de nuevo.
const PIN_KEY_PREFIX = 'cg_pin_trabajo_';

export async function guardarPinLocal(trabajoId: string, pin: string) {
  await AsyncStorage.setItem(PIN_KEY_PREFIX + trabajoId, pin);
}

export async function obtenerPinLocal(trabajoId: string): Promise<string | null> {
  return AsyncStorage.getItem(PIN_KEY_PREFIX + trabajoId);
}

// POST /api/trabajos/:id/calificar — el empleador califica al trabajador (1 a 5) cuando el
// trabajo ya está completado. El backend de Nico se la pasa al de Nacho, que recalcula la
// reputación del trabajador (con eso el matching ordena a los candidatos).
export async function calificarTrabajo(id: string, puntaje: number, comentario?: string): Promise<{ message: string }> {
  return apiPost(`/api/trabajos/${id}/calificar`, { puntaje, ...(comentario ? { comentario } : {}) });
}

// El backend no expone si un trabajo ya se calificó: se recuerda en el dispositivo para no
// volver a pedir la calificación.
const CALIFICADO_KEY_PREFIX = 'cg_calificado_trabajo_';

export async function marcarCalificadoLocal(trabajoId: string) {
  await AsyncStorage.setItem(CALIFICADO_KEY_PREFIX + trabajoId, '1');
}

export async function yaCalificadoLocal(trabajoId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(CALIFICADO_KEY_PREFIX + trabajoId)) === '1';
}

// "45 min", "1 h 20 min".
export function formatearDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}
