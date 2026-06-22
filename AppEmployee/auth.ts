import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const K = {
  ACCESS:  'cg_access_token',
  REFRESH: 'cg_refresh_token',
  USER:    'cg_usuario',
};

// ── Storage helpers ───────────────────────────────────────────────────────────

export async function guardarSesion(data: {
  accessToken: string;
  refreshToken: string;
  usuario: { id: string; email: string; tipo: string };
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

export async function getUsuario(): Promise<{ id: string; email: string; tipo: string } | null> {
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

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
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
