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

// GET /api/trabajos — como empleado, devuelve solo los trabajos en estado 'pendiente'.
export async function listarTrabajos(): Promise<{ trabajos: Trabajo[] }> {
  return authFetch('/api/trabajos');
}

// POST /api/trabajos/:id/aceptar
export async function aceptarTrabajo(id: string): Promise<{ message: string }> {
  return authFetch(`/api/trabajos/${id}/aceptar`, { method: 'POST' });
}

// GET /api/trabajos/mios — los trabajos que este empleado tiene asignados/en curso/completados.
export async function misTrabajosAsignados(): Promise<{ trabajos: Trabajo[] }> {
  return authFetch('/api/trabajos/mios');
}

// POST /api/trabajos/:id/validar-pin — el empleado ingresa el PIN que le dio el
// empleador en persona para pasar el trabajo de 'asignado' a 'en_progreso'.
export async function validarPin(id: string, pin: string): Promise<{ success: boolean; message: string }> {
  return authFetch(`/api/trabajos/${id}/validar-pin`, { method: 'POST', body: JSON.stringify({ pin }) });
}

// POST /api/trabajos/:id/completar
export async function completarTrabajo(id: string): Promise<{ message: string }> {
  return authFetch(`/api/trabajos/${id}/completar`, { method: 'POST' });
}
