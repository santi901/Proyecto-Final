/**
 * Categorías de trabajo.
 *
 * OJO: el matching de Ignacio (`GET /matching/trabajadores-disponibles`) compara por
 * string exacto contra la categoría que eligió el empleador al publicar. Esta lista
 * tiene que ser idéntica, carácter por carácter, a la de `AppEmployer/app/(tabs)/ofrecer.tsx`.
 * Si acá dice "Jardin" y allá "Jardín", el filtro nunca devuelve a este trabajador.
 */
export const CATEGORIAS = ['Limpieza', 'Mudanza', 'Jardín', 'Pintura', 'Plomería', 'Otros'] as const;

export type Categoria = typeof CATEGORIAS[number];
