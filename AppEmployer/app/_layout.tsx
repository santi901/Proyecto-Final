import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import "../global.css";

import { Paleta, Tipografia } from '@/constants/theme';

export const unstable_settings = {
  anchor: 'index',
};

// El splash se mantiene hasta que Nunito Sans esté cargada, así ninguna pantalla
// llega a dibujarse con la fuente del sistema.
SplashScreen.preventAutoHideAsync();

// La app tiene un único tema claro, con el crema del design system de fondo.
const TemaNavegacion = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Paleta.principal,
    background: Paleta.fondo,
    card: Paleta.blanco,
    text: Paleta.principal,
    border: Paleta.neutro,
  },
};

export default function RootLayout() {
  const [fuentesListas] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  useEffect(() => {
    if (fuentesListas) SplashScreen.hideAsync();
  }, [fuentesListas]);

  if (!fuentesListas) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={TemaNavegacion}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: Paleta.fondo } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="seguimiento" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              title: 'Modal',
              headerTitleStyle: { fontFamily: Tipografia.bold, color: Paleta.principal },
            }}
          />
        </Stack>
        {/* Fondo claro: los íconos de la barra de estado van oscuros. */}
        <StatusBar style="dark" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
