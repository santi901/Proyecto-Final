import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Paleta } from '@/constants/theme';

export const unstable_settings = {
  initialRouteName: 'buscar',
};

// Barra inferior con un único ícono centrado
function CenterTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const enPrincipal = state.routes[state.index]?.name === 'buscar';

  return (
    <View
      style={{
        backgroundColor: Paleta.blanco,
        borderTopWidth: 1,
        borderTopColor: Paleta.neutro,
        paddingTop: 8,
        paddingBottom: insets.bottom + 8,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Pressable
        onPress={() => navigation.navigate('buscar')}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: enPrincipal ? Paleta.acento : Paleta.fondoSuave,
          borderWidth: enPrincipal ? 0 : 1,
          borderColor: Paleta.neutro,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MaterialIcons name="home" size={28} color={enPrincipal ? Paleta.principal : Paleta.neutro} />
      </Pressable>
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
