import { Platform } from 'react-native';
import { API_URL, getAccessToken } from '../auth';
import { fetchConTimeout } from './fetchConTimeout';

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  nivel_dificultad: string | null;
  precio: number;
  estado: 'pendiente' | 'asignado' | 'en_progreso' | 'completado' | 'cancelado';
  latitud: number;
  longitud: number;
  creado_en: string;
  solicitud_expira_en?: string | null;
  iniciado_en?: string | null;
  finalizado_en?: string | null;
  confirmado_empleado_en?: string | null;
  confirmado_empleador_en?: string | null;
};

async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetchConTimeout(`${API_URL}${path}`, {
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
export async function completarTrabajo(id: string): Promise<{ message: string; estado: Trabajo['estado']; esperandoConfirmacion?: boolean }> {
  return authFetch(`/api/trabajos/${id}/completar`, { method: 'POST' });
}

// ── Detalle del trabajo: chat, evidencia, calificación (Sprint 4) ─────────────

export type TrabajoDetalle = Trabajo & {
  trabajador_id: string | null;
  empleador_id: string;
  duracionSegundos: number | null;
};

export type Mensaje = {
  id: string;
  remitente_id: string;
  remitente_tipo: 'empleado' | 'empleador';
  mensaje: string;
  enviado_en: string;
};

export type Evidencia = {
  id: string;
  url: string;
  subido_por: string;
  creado_en: string;
};

export type Calificacion = {
  id: string;
  puntaje: number;
  comentario: string | null;
  creado_en: string;
};

// GET /api/trabajos/:id — incluye duracionSegundos (iniciado_en → finalizado_en).
export async function obtenerTrabajo(id: string): Promise<{ trabajo: TrabajoDetalle }> {
  return authFetch(`/api/trabajos/${id}`);
}

// GET /api/trabajos/:id/mensajes — sigue disponible como historial después de completado.
export async function listarMensajes(id: string): Promise<{ mensajes: Mensaje[] }> {
  return authFetch(`/api/trabajos/${id}/mensajes`);
}

// POST /api/trabajos/:id/mensajes — el backend solo lo permite con el trabajo 'en_progreso'.
export async function enviarMensaje(id: string, mensaje: string): Promise<{ mensaje: Mensaje }> {
  return authFetch(`/api/trabajos/${id}/mensajes`, { method: 'POST', body: JSON.stringify({ mensaje }) });
}

// GET /api/trabajos/:id/evidencia — cada foto viene con una URL firmada (vale 1h).
export async function listarEvidencia(id: string): Promise<{ evidencias: Evidencia[] }> {
  return authFetch(`/api/trabajos/${id}/evidencia`);
}

// POST /api/trabajos/:id/evidencia (multipart, campo 'foto') — solo el empleado asignado.
// No pasa por authFetch porque no es JSON: el Content-Type multipart lo arma fetch solo.
export async function subirEvidencia(id: string, uri: string): Promise<{ evidencia: Evidencia }> {
  const token = await getAccessToken();
  const formData = new FormData();
  if (Platform.OS === 'web') {
    // En web el picker devuelve un blob:/data: URI, no un archivo del sistema.
    formData.append('foto', await (await fetch(uri)).blob(), 'evidencia.jpg');
  } else {
    formData.append('foto', { uri, name: 'evidencia.jpg', type: 'image/jpeg' } as any);
  }

  const res = await fetchConTimeout(`${API_URL}/api/trabajos/${id}/evidencia`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error subiendo la foto');
  return data;
}

// GET /api/trabajos/:id/calificacion — null si todavía no se calificó.
export async function obtenerCalificacion(id: string): Promise<{ calificacion: Calificacion | null }> {
  return authFetch(`/api/trabajos/${id}/calificacion`);
}

// POST /api/trabajos/:id/calificar — solo el empleador, solo con el trabajo 'completado'.
export async function calificarTrabajo(id: string, puntaje: number, comentario?: string): Promise<{ message: string }> {
  return authFetch(`/api/trabajos/${id}/calificar`, { method: 'POST', body: JSON.stringify({ puntaje, comentario }) });
}

// POST /api/trabajos/:id/cancelar — solo el empleador, mientras esté 'pendiente'/'asignado'.
export async function cancelarTrabajo(id: string, motivo?: string): Promise<{ message: string }> {
  return authFetch(`/api/trabajos/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) });
}
