import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseClient';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [usuario, setUsuario] = useState('');
  const [fichado, setFichado] = useState(false);
  const [horaIngreso, setHoraIngreso] = useState<string | null>(null);

  // Solo accesible con sesión activa; si no, vuelve a la bienvenida
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/');
        return;
      }
      setUsuario(data.user.email || 'Empleado');
    });
  }, [router]);

  const ahora = () => {
    const d = new Date();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const fichar = () => {
    if (!fichado) {
      setHoraIngreso(ahora());
    } else {
      setHoraIngreso(null);
    }
    setFichado(!fichado);
  };

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

      <View className={`rounded-xl p-4 mb-3 ${fichado ? 'bg-[#1d8348]' : 'bg-[#64748b]'}`}>
        <Text className="text-white text-xs opacity-85">Estado actual</Text>
        <Text className="text-white text-lg font-bold mt-1">
          {fichado ? `Trabajando desde ${horaIngreso}` : 'Fuera de turno'}
        </Text>
      </View>

      <Pressable
        className={`rounded-xl p-5 items-center mb-7 active:opacity-90 ${fichado ? 'bg-[#e74c3c]' : 'bg-[#1d8348]'}`}
        onPress={fichar}>
        <Text className="text-white text-lg font-bold tracking-wider">
          {fichado ? 'Fichar SALIDA' : 'Fichar ENTRADA'}
        </Text>
      </Pressable>

      <Text className="text-sm font-bold text-[#475569] mb-3 uppercase">Mi semana</Text>

      <View className="flex-row justify-between mb-6">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
          const trabajado = i < 4;
          const actual = i === 4;
          return (
            <View
              key={i}
              className={`w-10 h-10 rounded-full items-center justify-center border ${
                trabajado
                  ? 'bg-[#1d8348] border-[#1d8348]'
                  : actual
                  ? 'bg-[#0a7ea4] border-[#0a7ea4]'
                  : 'bg-white border-[#e2e8f0]'
              }`}>
              <Text className={`text-sm font-semibold ${trabajado || actual ? 'text-white' : 'text-[#475569]'}`}>
                {d}
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="text-sm font-bold text-[#475569] mb-3 uppercase">Accesos</Text>

      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Mi horario</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Solicitar dia</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-[#e2e8f0]" onPress={() => {}}>
        <Text className="text-base text-[#0f172a]">Mis novedades</Text>
      </Pressable>

      <Pressable className="bg-[#e74c3c] rounded-lg p-4 mt-6" onPress={handleLogout}>
        <Text className="text-base text-white">Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}
