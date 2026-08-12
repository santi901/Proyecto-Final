import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const unstable_settings = {
  initialRouteName: 'buscar',
};

// Barra inferior con dos íconos centrados: buscar trabajo y mi trabajo aceptado
function CenterTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rutaActual = state.routes[state.index]?.name;

  const Boton = ({ ruta, icono }: { ruta: 'buscar' | 'explore'; icono: keyof typeof MaterialIcons.glyphMap }) => {
    const activo = rutaActual === ruta;
    return (
      <Pressable
        onPress={() => navigation.navigate(ruta)}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: activo ? '#FFD942' : '#f1f5f9',
          borderWidth: activo ? 0 : 1,
          borderColor: '#e2e8f0',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MaterialIcons name={icono} size={28} color={activo ? '#1a1a1a' : '#64748b'} />
      </Pressable>
    );
  };

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 8,
        paddingBottom: insets.bottom + 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}>
      <Boton ruta="buscar" icono="home" />
      <Boton ruta="explore" icono="assignment" />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CenterTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="buscar" />
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
