import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const unstable_settings = {
  initialRouteName: 'ofrecer',
};

// Barra inferior con un único ícono centrado
function CenterTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const enPrincipal = state.routes[state.index]?.name === 'ofrecer';

  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingTop: 8,
        paddingBottom: insets.bottom + 8,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Pressable
        onPress={() => navigation.navigate('ofrecer')}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: enPrincipal ? '#FFD942' : '#f1f5f9',
          borderWidth: enPrincipal ? 0 : 1,
          borderColor: '#e2e8f0',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MaterialIcons name="home" size={28} color={enPrincipal ? '#1a1a1a' : '#64748b'} />
      </Pressable>
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
