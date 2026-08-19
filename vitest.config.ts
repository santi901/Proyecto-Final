import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests viven en la raiz y alcanzan la logica de los cuatro proyectos.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // El E2E levanta un flujo completo contra el backend: no lo apuramos.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // El denominador son SOLO los modulos de logica de negocio pura, que es lo que
      // cubren los tests unitarios. Quedan afuera a proposito:
      //   · controllers y rutas del backend -> los ejercita el E2E, que corre contra
      //     otro proceso y por eso no reporta cobertura acá
      //   · lib/ubicacion.ts, lib/trabajo.ts, lib/perfil.ts -> son wrappers de fetch,
      //     testearlos seria testear el mock
      //   · las pantallas .tsx -> son React Native, no corren en Node
      // Esta decision esta explicada en CALIDAD.md: el numero mide lo que decimos que
      // mide, no el repositorio entero.
      include: [
        'backend/src/utils/pin.js',
        'backend-nacho/src/location/haversine.util.ts',
        'AppEmployee/lib/categorias.ts',
        'AppEmployer/lib/categorias.ts',
        'AppEmployer/lib/precios.ts',
      ],
      exclude: ['**/*.spec.ts', '**/*.test.ts'],
    },
  },
});
