import { describe, it, expect } from 'vitest';
import { calcularDistanciaKm } from '../../backend-nacho/src/location/haversine.util';

/**
 * De esta distancia dependen dos cosas: el radio de busqueda (que trabajos se le
 * ofrecen a cada trabajador) y el calculo de nafta del viaje. Si devolviera metros en
 * vez de kilometros, o confundiera lat con lng, el matching mostraria trabajos a
 * 300 km como si estuvieran a la vuelta.
 */
describe('Distancia entre dos puntos (Haversine)', () => {
  it('da 0 para el mismo punto', () => {
    expect(calcularDistanciaKm(-34.6037, -58.3816, -34.6037, -58.3816)).toBe(0);
  });

  it('calcula bien una distancia conocida: Obelisco a La Plata', () => {
    // ~53 km en linea recta.
    const km = calcularDistanciaKm(-34.6037, -58.3816, -34.9205, -57.9536);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(58);
  });

  it('devuelve kilometros, no metros', () => {
    // Buenos Aires a Cordoba: ~640 km. Si el resultado diera cientos de miles,
    // estaria devolviendo metros y el radio de busqueda no filtraria nada.
    const km = calcularDistanciaKm(-34.6037, -58.3816, -31.4201, -64.1888);
    expect(km).toBeGreaterThan(600);
    expect(km).toBeLessThan(700);
  });

  it('es simetrica: ida y vuelta miden lo mismo', () => {
    const ida = calcularDistanciaKm(-34.6037, -58.3816, -31.4201, -64.1888);
    const vuelta = calcularDistanciaKm(-31.4201, -64.1888, -34.6037, -58.3816);
    expect(ida).toBeCloseTo(vuelta, 6);
  });

  it('no confunde latitud con longitud', () => {
    // Si el calculo tomara los argumentos en otro orden, estas dos darian igual.
    const a = calcularDistanciaKm(0, 0, 10, 0);
    const b = calcularDistanciaKm(0, 0, 0, 10);
    expect(a).toBeCloseTo(1111.9, 0); // 10 grados de latitud son siempre ~1112 km
    expect(b).toBeCloseTo(1111.9, 0); // sobre el ecuador coinciden...
    const c = calcularDistanciaKm(60, 0, 60, 10); // ...pero a 60 de latitud no
    expect(c).toBeLessThan(600);
  });
});
