import { describe, it, expect } from 'vitest';
import { CATEGORIAS as CATEGORIAS_TRABAJADOR } from '../../AppEmployee/lib/categorias';
import { CATEGORIAS as CATEGORIAS_EMPLEADOR } from '../../AppEmployer/lib/categorias';

/**
 * El matching de trabajadores compara la categoria del trabajo contra las categorias
 * del trabajador **por string exacto**. Las dos listas viven en apps distintas, asi que
 * nada impide que alguien toque una y se olvide de la otra: bastaria escribir "Jardin"
 * sin tilde de un lado para que el filtro deje de devolver trabajadores, sin ningun
 * error visible. Este test existe para que ese cambio rompa el pipeline y no la app.
 */
describe('Categorias compartidas entre las dos apps', () => {
  it('las dos apps declaran exactamente la misma lista', () => {
    expect([...CATEGORIAS_TRABAJADOR]).toEqual([...CATEGORIAS_EMPLEADOR]);
  });

  it('coinciden caracter por caracter, incluidas las tildes', () => {
    // toEqual ya lo cubre, pero si falla este es el que dice *cual* difiere.
    CATEGORIAS_EMPLEADOR.forEach((categoria, i) => {
      expect(CATEGORIAS_TRABAJADOR[i]).toBe(categoria);
    });

    expect(CATEGORIAS_EMPLEADOR).toContain('Jardín');
    expect(CATEGORIAS_EMPLEADOR).toContain('Plomería');
  });

  it('no tiene categorias repetidas ni vacias', () => {
    const unicas = new Set(CATEGORIAS_EMPLEADOR);
    expect(unicas.size).toBe(CATEGORIAS_EMPLEADOR.length);

    for (const categoria of CATEGORIAS_EMPLEADOR) {
      expect(categoria.trim()).toBe(categoria); // sin espacios al borde
      expect(categoria.length).toBeGreaterThan(0);
    }
  });
});
