/** @type {import('tailwindcss').Config} */
// Los colores y las fuentes son los mismos que están en `constants/theme.ts`.
// Si cambia uno, hay que cambiar el otro.
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
      extend: {
        colors: {
          principal: "#0C1531",
          acento: "#FFD539",
          neutro: "#909090",
          fondo: "#FFFDF3",
          "fondo-suave": "#FFFEF9",
          error: "#E5484D",
          exito: "#2E9E5B",
        },
        fontFamily: {
          // En React Native el peso se elige con la familia, no con `font-bold`.
          nunito: ["NunitoSans_400Regular"],
          "nunito-semi": ["NunitoSans_600SemiBold"],
          "nunito-bold": ["NunitoSans_700Bold"],
        },
      },
    },
    plugins: [],
  };
