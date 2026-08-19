import { apiGet, API_URL, getAccessToken } from '../auth';

// Perfil del trabajador (backend de Nico, `backend/src/routes/empleados.js`).

export type PerfilEmpleado = {
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  dni: string;
  codigo_postal: string;
  direccion: string;
  radio_busqueda: number | null;
  categorias: string[] | null;
  foto_url: string | null;
  foto_dni_url: string | null;
  lat: number | null;
  lng: number | null;
};

export async function obtenerPerfil(): Promise<PerfilEmpleado> {
  const data = await apiGet('/api/empleados/perfil');
  return data.perfil;
}

/**
 * Guarda el perfil.
 *
 * IMPORTANTE: `PUT /api/empleados/perfil` **reemplaza el perfil completo**, no hace
 * update parcial. Todo campo que no se mande vuelve a su valor por defecto
 * (`radioBusqueda` a 10, `categorias` a vacío). Por eso este tipo pide todos los
 * campos y la pantalla siempre manda el formulario entero, aunque el usuario
 * haya tocado uno solo.
 */
export async function actualizarPerfil(datos: {
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  dni: string;
  codigoPostal: string;
  direccion: string;
  radioBusqueda: number;
  categorias: string[];
  fotoUrl: string | null;
  fotoDniUrl: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<PerfilEmpleado> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/empleados/perfil`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(datos),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data.perfil;
}
