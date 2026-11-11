import { DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
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
import { escucharToquesDeNotificaciones } from '../lib/notificaciones';
import { abrirDesdeNotificacion } from '../lib/navegacion';

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

  // Tocar un push (solicitud, aceptación, pago…) abre la pantalla del trabajo.
  const router = useRouter();
  useEffect(() => {
    if (!fuentesListas) return;
    return escucharToquesDeNotificaciones(datos => abrirDesdeNotificacion(router, datos));
  }, [fuentesListas, router]);

  if (!fuentesListas) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={TemaNavegacion}>
        {/* Animaciones de transición (Sprint 6): las pantallas apiladas entran deslizando desde
            la derecha; las de "acción puntual" (calificar, reportar) suben desde abajo. */}
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: Paleta.fondo },
            animation: 'slide_from_right',
            animationDuration: 250,
            gestureEnabled: true,
          }}>
          <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="pagos" options={{ headerShown: false }} />
          <Stack.Screen name="notificaciones" options={{ headerShown: false }} />
          <Stack.Screen name="reportar-problema" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="trabajo-en-curso" options={{ headerShown: false }} />
          <Stack.Screen name="perfil" options={{ headerShown: false }} />
          <Stack.Screen name="metodos-cobro" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />
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
