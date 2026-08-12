import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, getAccessToken } from '../auth';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: 'pendiente' | 'asignado' | 'en_progreso' | 'completado';
  latitud: number;
  longitud: number;
  creado_en: string;
};

async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

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
  return authFetch('/api/trabajos', { method: 'POST', body: JSON.stringify(datos) });
}

// GET /api/trabajos/mios — los trabajos que publicó este empleador, en cualquier estado.
export async function misTrabajosPublicados(): Promise<{ trabajos: Trabajo[] }> {
  return authFetch('/api/trabajos/mios');
}

// POST /api/trabajos/:id/completar
export async function completarTrabajo(id: string): Promise<{ message: string }> {
  return authFetch(`/api/trabajos/${id}/completar`, { method: 'POST' });
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
