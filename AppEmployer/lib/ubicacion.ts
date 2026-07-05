import * as Location from 'expo-location';

// Backend de Ignacio (NestJS) — es distinto al backend de Nico (auth).
// Reemplazá esta URL por la de ngrok que te pase Nacho, o definí EXPO_PUBLIC_NACHO_API_URL en un .env.
export const NACHO_API_URL =
  process.env.EXPO_PUBLIC_NACHO_API_URL ?? 'https://TU_URL.ngrok-free.app';

const INTERVALO_UBICACION_MS = 10000;

export type Coordenadas = { lat: number; lng: number };

export type ResultadoUbicacion =
  | { estado: 'ok'; coords: Coordenadas }
  | { estado: 'denegado' }
  | { estado: 'error'; mensaje: string };

// Pide el permiso de ubicación y, si lo otorgan, devuelve las coordenadas actuales del GPS.
// Si el usuario no lo permite, devuelve { estado: 'denegado' } para que la pantalla bloquee el uso.
export async function pedirUbicacion(): Promise<ResultadoUbicacion> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { estado: 'denegado' };
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      estado: 'ok',
      coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    };
  } catch (e: any) {
    return { estado: 'error', mensaje: e?.message ?? 'No se pudo obtener la ubicación.' };
  }
}

// Envía las coordenadas al backend de Nacho para que las guarde en la base de datos.
// POST /location/actualizar-ubicacion  body { workerId, lat, lng, jobId? }
export async function enviarUbicacion(coords: Coordenadas, workerId: string, jobId?: string): Promise<void> {
  const res = await fetch(`${NACHO_API_URL}/location/actualizar-ubicacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workerId, lat: coords.lat, lng: coords.lng, ...(jobId ? { jobId } : {}) }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Error al enviar la ubicación (${res.status}). ${txt}`);
  }
}

// Repite el envío de la ubicación cada 10s mientras la pantalla esté montada (según lo acordado
// con Santi: el trabajador manda su GPS periódicamente). Asume que el permiso ya fue otorgado.
// Devuelve una función para cortar el seguimiento (llamarla al desmontar la pantalla).
export function seguirUbicacion(
  workerId: string,
  onCoords?: (coords: Coordenadas) => void,
  jobId?: string,
): () => void {
  let activo = true;

  const tick = async () => {
    const r = await pedirUbicacion();
    if (!activo || r.estado !== 'ok') return;
    onCoords?.(r.coords);
    enviarUbicacion(r.coords, workerId, jobId).catch(e =>
      console.log('No se pudo enviar la ubicación:', e?.message),
    );
  };

  const id = setInterval(tick, INTERVALO_UBICACION_MS);
  return () => {
    activo = false;
    clearInterval(id);
  };
}
