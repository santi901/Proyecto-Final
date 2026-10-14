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

// Barra inferior con dos íconos centrados: publicar trabajo y mis trabajos publicados
function CenterTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rutaActual = state.routes[state.index]?.name;

  const Boton = ({ ruta, icono }: { ruta: 'ofrecer' | 'explore'; icono: keyof typeof MaterialIcons.glyphMap }) => {
    const activo = rutaActual === ruta;
    return (
      <Pressable
        onPress={() => navigation.navigate(ruta)}
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
      <Boton ruta="ofrecer" icono="home" />
      <Boton ruta="explore" icono="assignment" />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CenterTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="ofrecer" />
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
