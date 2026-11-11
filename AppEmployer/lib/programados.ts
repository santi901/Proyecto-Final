import AsyncStorage from '@react-native-async-storage/async-storage';

// Trabajos programados (Sprint 6): el empleador puede publicar un trabajo para una fecha
// y hora futuras. El backend todavía no tiene una columna para eso (`trabajos.fecha_programada`
// queda pendiente del lado de back), así que:
//   · la fecha viaja dentro de la descripción ("📅 Programado para …"), para que el
//     trabajador la vea antes de aceptar;
//   · y se guarda en el dispositivo por trabajo, para armar la sección "Próximos trabajos".

const PREFIJO = 'cg_programado_';
export const MARCA_PROGRAMADO = '📅 Programado para';

export async function guardarProgramacion(trabajoId: string, fecha: Date) {
  await AsyncStorage.setItem(PREFIJO + trabajoId, fecha.toISOString());
}

export async function programacionesDe(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const pares = await AsyncStorage.multiGet(ids.map(id => PREFIJO + id));
  return Object.fromEntries(
    pares.filter(([, v]) => !!v).map(([k, v]) => [k.slice(PREFIJO.length), v as string]),
  );
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "martes 12/11 a las 10:00" */
export function formatearProgramacion(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${DIAS[d.getDay()]} ${dd}/${mm} a las ${hh}:${mi}`;
}

/** Texto que se agrega al final de la descripción del trabajo. */
export function lineaProgramacion(fecha: Date): string {
  return `\n\n${MARCA_PROGRAMADO} el ${formatearProgramacion(fecha)}.`;
}

/** Próximos 7 días (hoy incluido), a medianoche. */
export function proximosDias(): Date[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i));
}

export const HORAS_PROGRAMABLES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
