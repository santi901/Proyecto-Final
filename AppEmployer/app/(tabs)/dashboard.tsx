import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [usuario, setUsuario] = useState('');

  // Solo accesible con sesión activa; si no, vuelve a la bienvenida
  useEffect(() => {
    getUsuario().then(u => {
      if (!u) { router.replace('/'); return; }
      setUsuario(u.email || 'Empleador');
    });
  }, [router]);

  async function handleLogout() {
    await authLogout();
    router.replace('/');
  }

  return (
    <ScrollView
      className="flex-1 bg-fondo"
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 24, paddingBottom: 24 }}>
      <View className="mb-5">
        <Text className="text-base font-nunito text-neutro">Hola,</Text>
        <Text className="text-2xl font-nunito-bold text-principal">{usuario}</Text>
      </View>

      <View className="flex-row gap-2 mb-6">
        <View className="flex-1 rounded-xl p-4 items-center bg-principal">
          <Text className="text-3xl font-nunito-bold text-white">12</Text>
          <Text className="text-xs font-nunito text-white mt-1">Empleados</Text>
        </View>
        <View className="flex-1 rounded-xl p-4 items-center bg-exito">
          <Text className="text-3xl font-nunito-bold text-white">8</Text>
          <Text className="text-xs font-nunito text-white mt-1">En turno</Text>
        </View>
        <View className="flex-1 rounded-xl p-4 items-center bg-acento">
          <Text className="text-3xl font-nunito-bold text-principal">3</Text>
          <Text className="text-xs font-nunito text-principal mt-1">Novedades</Text>
        </View>
      </View>

      <Text className="text-sm font-nunito-bold text-neutro mb-3 uppercase">Acciones rapidas</Text>

      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Cargar turno</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Registrar novedad</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Ver liquidaciones</Text>
      </Pressable>

      <Pressable className="bg-error rounded-lg p-4 mt-6" onPress={handleLogout}>
        <Text className="text-base font-nunito-semi text-white">Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}
