import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost } from '../auth';

// Flujo de un trabajo del lado del empleador, contra el backend de Nico
// (`backend/src/routes/trabajos.js`): publicación → PIN → seguimiento → finalización.

export type EstadoTrabajo = 'pendiente' | 'asignado' | 'en_progreso' | 'completado';

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
export async function completarTrabajo(id: string): Promise<{ message: string; duracionSegundos: number | null }> {
  return apiPost(`/api/trabajos/${id}/completar`);
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
