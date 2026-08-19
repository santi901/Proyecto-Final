/**
 * Tarifario de la app.
 *
 * El precio lo fija ChanguitApp según la dificultad declarada por el empleador: no se
 * negocia con el trabajador. Vive acá y no adentro de la pantalla para poder testearlo
 * sin montar React Native (ver `tests/unit/precios.test.ts`).
 */

export const DIFICULTADES = ['Simple', 'Intermedio', 'Complejo'] as const;

export type Dificultad = typeof DIFICULTADES[number];

const PRECIOS: Record<Dificultad, number> = {
  Simple: 2500,
  Intermedio: 4500,
  Complejo: 7000,
};

/**
 * Precio final del trabajo. Devuelve `null` si todavía no se eligió dificultad,
 * para que la pantalla pueda distinguir "sin elegir" de un precio de $0.
 */
export function precioPara(dificultad: Dificultad | null): number | null {
  if (!dificultad) return null;
  return PRECIOS[dificultad] ?? null;
}
