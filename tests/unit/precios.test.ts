import { describe, it, expect } from 'vitest';
import { DIFICULTADES, precioPara } from '../../AppEmployer/lib/precios';

/**
 * El precio es lo que el empleador termina pagando y lo que el trabajador ve antes de
 * aceptar. Se calcula en el front y se manda al backend, asi que un error aca se
 * convierte directamente en plata mal cobrada.
 */
describe('Tarifario por dificultad', () => {
  it('devuelve null si todavia no se eligio dificultad', () => {
    // Importa distinguirlo de 0: la pantalla muestra "Elegí la dificultad"
    // en vez de "$0", y `handleOfrecer` corta antes de publicar.
    expect(precioPara(null)).toBeNull();
  });

  it('tiene un precio definido para cada dificultad', () => {
    for (const dificultad of DIFICULTADES) {
      const precio = precioPara(dificultad);
      expect(precio).not.toBeNull();
      expect(precio).toBeGreaterThan(0);
    }
  });

  it('cobra mas a mayor dificultad', () => {
    const simple = precioPara('Simple')!;
    const intermedio = precioPara('Intermedio')!;
    const complejo = precioPara('Complejo')!;

    expect(simple).toBeLessThan(intermedio);
    expect(intermedio).toBeLessThan(complejo);
  });

  it('respeta los valores acordados con el equipo', () => {
    expect(precioPara('Simple')).toBe(2500);
    expect(precioPara('Intermedio')).toBe(4500);
    expect(precioPara('Complejo')).toBe(7000);
  });
});
