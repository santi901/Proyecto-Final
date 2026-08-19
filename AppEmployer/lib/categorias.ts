/**
 * Categorías de trabajo que puede elegir el empleador al publicar.
 *
 * OJO: el matching de Ignacio (`GET /matching/trabajadores-disponibles`) compara por
 * string exacto contra las categorías que cargó el trabajador. Esta lista tiene que ser
 * idéntica, carácter por carácter, a la de `AppEmployee/lib/categorias.ts`.
 * Si acá dice "Jardin" y allá "Jardín", el filtro no devuelve a nadie.
 *
 * Hay un test que compara las dos listas justamente para que eso no pase:
 * `tests/unit/categorias.test.ts`.
 */
export const CATEGORIAS = ['Limpieza', 'Mudanza', 'Jardín', 'Pintura', 'Plomería', 'Otros'] as const;

export type Categoria = typeof CATEGORIAS[number];
