import { apiGet, fetchAutenticado } from '../auth';

// Perfil del empleador (backend de Nico, `backend/src/routes/perfiles.js`, tabla `perfiles`).

export type PerfilEmpleador = {
  id: string;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  dni: string;
  codigo_postal: string;
  direccion: string;
  piso_departamento: string | null;
  indicaciones: string | null;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
};

export async function obtenerPerfil(): Promise<PerfilEmpleador> {
  const data = await apiGet('/api/perfiles/perfil');
  return data.perfil;
}

/**
 * `PUT /api/perfiles/perfil` reemplaza todos los campos (lo que no se manda queda en null),
 * así que la pantalla siempre manda el perfil completo.
 */
export async function actualizarPerfil(datos: {
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  dni: string;
  codigoPostal: string;
  direccion: string;
  pisoDepartamento: string | null;
  indicaciones: string | null;
  fotoUrl: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<PerfilEmpleador> {
  // El esquema del backend rechaza null en los opcionales: se omiten en vez de mandarlos.
  const cuerpo = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== ''));
  const res = await fetchAutenticado('/api/perfiles/perfil', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No pudimos guardar los cambios.');
  return data.perfil;
}
