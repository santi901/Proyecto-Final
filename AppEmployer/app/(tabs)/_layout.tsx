import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Paleta } from '@/constants/theme';

export const unstable_settings = {
  initialRouteName: 'ofrecer',
};

// Barra inferior con tres íconos centrados: publicar, mis trabajos publicados e historial
type Ruta = 'ofrecer' | 'explore' | 'historial';

// Afuera de CenterTabBar: declarar un componente adentro de otro lo recrea en cada render.
function Boton({ ruta, icono, activo, onPress }: {
  ruta: Ruta;
  icono: keyof typeof MaterialIcons.glyphMap;
  activo: boolean;
  onPress: (ruta: Ruta) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(ruta)}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: activo ? Paleta.acento : Paleta.fondoSuave,
        borderWidth: activo ? 0 : 1,
        borderColor: Paleta.neutro,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialIcons name={icono} size={28} color={activo ? Paleta.principal : Paleta.neutro} />
    </Pressable>
  );
}

function CenterTabBar({ navigateToTab, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rutaActual = state.routes[state.index]?.name;
  const ir = (ruta: Ruta) => {
    const destino = state.routes.find((r) => r.name === ruta);
    if (destino) navigateToTab(destino.key);
  };

  return (
    <View
      style={{
        backgroundColor: Paleta.blanco,
        borderTopWidth: 1,
        borderTopColor: Paleta.neutro,
        paddingTop: 8,
        paddingBottom: insets.bottom + 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}>
      <Boton ruta="ofrecer" icono="home" activo={rutaActual === 'ofrecer'} onPress={ir} />
      <Boton ruta="explore" icono="assignment" activo={rutaActual === 'explore'} onPress={ir} />
      <Boton ruta="historial" icono="history" activo={rutaActual === 'historial'} onPress={ir} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CenterTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="ofrecer" />
      <Tabs.Screen name="historial" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
