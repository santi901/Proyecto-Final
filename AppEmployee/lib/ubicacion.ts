import * as Location from 'expo-location';

// Backend de Ignacio (NestJS) — es distinto al backend de Nico (auth).
// Reemplazá esta URL por la de ngrok que te pase Nacho, o definí EXPO_PUBLIC_NACHO_API_URL en un .env.
export const NACHO_API_URL =
  process.env.EXPO_PUBLIC_NACHO_API_URL ?? 'https://TU_URL.ngrok-free.app';

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

// Sigue la posición del trabajador mientras va al trabajo y llama a `alMoverse` cada
// vez que cambia. Devuelve una función para cortar el seguimiento (hay que llamarla
// al desmontar la pantalla, si no el GPS queda prendido).
export async function seguirUbicacion(
  alMoverse: (coords: Coordenadas) => void,
): Promise<() => void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return () => {};

  const suscripcion = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
    pos => alMoverse({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
  );

  return () => suscripcion.remove();
}

// Envía las coordenadas al backend de Nacho para que las guarde en la base de datos.
// Contrato a acordar con backend: POST /location  body { userId, lat, lng }
// (el endpoint todavía no existe en Nacho-Back; el front ya queda listo para cuando exista)
export async function enviarUbicacion(coords: Coordenadas, userId: string): Promise<void> {
  const res = await fetch(`${NACHO_API_URL}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, lat: coords.lat, lng: coords.lng }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Error al enviar la ubicación (${res.status}). ${txt}`);
  }
}
