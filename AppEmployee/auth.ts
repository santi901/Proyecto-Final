import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchConTimeout } from './lib/fetchConTimeout';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Backend de Nacho (NestJS). Solo se usa para lo que el de Nico no expone: registrar el
// token de notificaciones push y subir la foto de evidencia de un trabajo.
export const NACHO_API_URL = process.env.EXPO_PUBLIC_NACHO_API_URL ?? 'http://localhost:3001';

const K = {
  ACCESS:  'cg_access_token',
  REFRESH: 'cg_refresh_token',
  USER:    'cg_usuario',
  ONBOARDING: 'cg_onboarding_visto',
};

// ── Onboarding (pantallas de bienvenida) ───────────────────────────────────────

export async function onboardingVisto(): Promise<boolean> {
  return (await AsyncStorage.getItem(K.ONBOARDING)) === '1';
}

export async function marcarOnboardingVisto() {
  await AsyncStorage.setItem(K.ONBOARDING, '1');
}

// ── Storage helpers ───────────────────────────────────────────────────────────

export async function guardarSesion(data: {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; email: string; tipo: string; verificado?: boolean };
}) {
  await AsyncStorage.multiSet([
    [K.ACCESS,  data.accessToken],
    [K.REFRESH, data.refreshToken],
    [K.USER,    JSON.stringify(data.usuario)],
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(K.ACCESS);
}

export async function getUsuario(): Promise<{ id: string; email: string; tipo: string; verificado?: boolean } | null> {
  const raw = await AsyncStorage.getItem(K.USER);
  return raw ? JSON.parse(raw) : null;
}

export async function tieneSesion(): Promise<boolean> {
  return !!(await AsyncStorage.getItem(K.ACCESS));
}

export async function limpiarSesion() {
  await AsyncStorage.multiRemove([K.ACCESS, K.REFRESH, K.USER]);
}

// ── API helpers ───────────────────────────────────────────────────────────────

// Si el servidor responde algo que no es JSON (ej. la página de error de un túnel caído),
// se toma como respuesta vacía para mostrar el error genérico en vez de un SyntaxError.
async function leerRespuesta(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetchConTimeout(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return leerRespuesta(res);
}

// Llamadas autenticadas al backend de Nico: agregan solas el token guardado.
// Las usan `lib/trabajos.ts` y `lib/perfil.ts`.

export async function apiGet(path: string) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetchConTimeout(`${API_URL}${path}`, { headers });
  return leerRespuesta(res);
}

export async function apiPost(path: string, body: object = {}) {
  const token = await getAccessToken();
  return post(path, body, token ?? undefined);
}

// ── Auth functions ────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const data = await post('/api/auth/login', { email, password });
  await guardarSesion(data);
  return data;
}

export async function registrarEmpleado(datos: {
  email: string; password: string;
  nombre: string; apellido: string;
  fechaNacimiento: string; dni: string;
  codigoPostal: string; direccion: string;
  radioBusqueda?: number;
  /** Categorías en las que trabaja. Las usa el matching de Ignacio para filtrar. */
  categorias?: string[];
  fotoUrl?: string | null; fotoDniUrl?: string | null;
  lat?: number | null; lng?: number | null;
}) {
  const data = await post('/api/auth/registrar-empleado', datos);
  await guardarSesion(data);
  return data;
}

export async function logout() {
  const [token, refresh] = await Promise.all([
    AsyncStorage.getItem(K.ACCESS),
    AsyncStorage.getItem(K.REFRESH),
  ]);
  if (token) {
    try { await post('/api/auth/logout', { refreshToken: refresh }, token); } catch {}
  }
  await limpiarSesion();
}
