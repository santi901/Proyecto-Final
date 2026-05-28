import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseClient';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [usuario, setUsuario] = useState('');

  // Solo accesible con sesión activa; si no, vuelve a la bienvenida
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/');
        return;
      }
      setUsuario(data.user.email || 'Empleador');
    });
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <ScrollView
      className="flex-1 bg-[#f1f5f9]"
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 24, paddingBottom: 24 }}>
      <View className="mb-5">
        <Text className="text-base text-[#475569]">Hola,</Text>
        <Text className="text-2xl font-bold text-[#0f172a]">{usuario}</Text>
      </View>

      <View className="flex-row gap-2 mb-6">
        <View className="flex-1 rounded-xl p-4 items-center bg-[#0a7ea4]">
          <Text className="text-3xl font-bold text-white">12</Text>
          <Text className="text-xs text-white mt-1">Empleados</Text>
        </View>
        <View className="flex-1 rounded-xl p-4 items-center bg-[#1d8348]">
          <Text className="text-3xl font-bold text-white">8</Text>
          <Text className="text-xs text-white mt-1">En turno</Text>
        </View>
        <View className="flex-1 rounded-xl p-4 items-center bg-[#b9770e]">
          <Text className="text-3xl font-bold text-white">3</Text>
          <Text className="text-xs text-white mt-1">Novedades</Text>
        </View>
      </View>

      <Text className="text-sm font-bold text-[#475569] mb-3 uppercase">Acciones rapidas</Text>

      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Cargar turno</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Registrar novedad</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Ver liquidaciones</Text>
      </Pressable>

      <Pressable className="bg-[#e74c3c] rounded-lg p-4 mt-6" onPress={handleLogout}>
        <Text className="text-base text-white">Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}
