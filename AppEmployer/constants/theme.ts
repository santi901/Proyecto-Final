/**
 * Design system de ChanguitApp.
 *
 * Los valores de `Paleta` y `Tipografia` son la única fuente de verdad de los colores
 * y las fuentes de la app: los mismos tokens están replicados en `tailwind.config.js`
 * para poder usarlos como clases (`bg-principal`, `text-neutro`, `font-nunito-bold`, …).
 * Si cambia un color acá, hay que cambiarlo también allá.
 */

export const Paleta = {
  /** Navy. Color principal: headers, botones importantes y texto. */
  principal: '#0C1531',
  /** Amarillo. Acento: estado seleccionado, resaltados y detalles sobre el navy. */
  acento: '#FFD539',
  /** Gris neutro. Texto secundario y bordes/sombras de chrome secundario. */
  neutro: '#909090',
  /** Fondo secundario (crema) de las pantallas. */
  fondo: '#FFFDF3',
  /** Variante más clara del fondo, para tarjetas apoyadas sobre el crema. */
  fondoSuave: '#FFFEF9',
  blanco: '#FFFFFF',
  /** "Extras" de la lámina: bordes/sombras/destacados, siempre al 50% de opacidad salvo excepción puntual. */
  rojo: '#FF0000',
  verde: '#2AB511',
  /** Estados. No están en la lámina del design system: se eligieron para acompañarla. */
  error: '#E5484D',
  exito: '#2E9E5B',
} as const;

/**
 * Sombra suave centrada que reemplaza los bordes de la lámina: en Figma el "spread" es
 * 0 en casi todos los casos (acá, `radio` chico). La única excepción documentada es el
 * selector de categoría seleccionado, con spread 2 — para eso se sube `radio`.
 */
export function sombra(color: string, opacidad = 0.7, radio = 3) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: opacidad,
    shadowRadius: radio,
    elevation: radio,
  } as const;
}

/**
 * Nunito Sans en los tres pesos de la lámina. Se cargan en `app/_layout.tsx`.
 * En React Native el peso no se elige con `fontWeight` sino con la familia,
 * por eso cada peso es una familia distinta.
 */
export const Tipografia = {
  /** Regular text */
  regular: 'NunitoSans_400Regular',
  /** Important text */
  semibold: 'NunitoSans_600SemiBold',
  /** Headers */
  bold: 'NunitoSans_700Bold',
} as const;

// ── Compatibilidad con los componentes que vienen de la plantilla de Expo ──────
// (`themed-text`, `themed-view`, `use-theme-color`). La app tiene un único tema
// claro, así que light y dark apuntan a los mismos valores.

const esquema = {
  text: Paleta.principal,
  background: Paleta.fondo,
  tint: Paleta.principal,
  icon: Paleta.neutro,
  tabIconDefault: Paleta.neutro,
  tabIconSelected: Paleta.principal,
};

export const Colors = {
  light: esquema,
  dark: esquema,
};

export const Fonts = {
  sans: Tipografia.regular,
  serif: Tipografia.regular,
  rounded: Tipografia.regular,
  mono: 'monospace',
};
