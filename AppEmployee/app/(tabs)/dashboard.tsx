import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [usuario, setUsuario] = useState('');
  const [fichado, setFichado] = useState(false);
  const [horaIngreso, setHoraIngreso] = useState<string | null>(null);

  // Solo accesible con sesión activa; si no, vuelve a la bienvenida
  useEffect(() => {
    getUsuario().then(u => {
      if (!u) { router.replace('/'); return; }
      setUsuario(u.email || 'Empleado');
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

      <View className={`rounded-xl p-4 mb-3 ${fichado ? 'bg-exito' : 'bg-principal'}`}>
        <Text className="text-white text-xs font-nunito opacity-85">Estado actual</Text>
        <Text className="text-white text-lg font-nunito-bold mt-1">
          {fichado ? `Trabajando desde ${horaIngreso}` : 'Fuera de turno'}
        </Text>
      </View>

      <Pressable
        className={`rounded-xl p-5 items-center mb-7 active:opacity-90 ${fichado ? 'bg-error' : 'bg-principal'}`}
        onPress={fichar}>
        <Text className="text-white text-lg font-nunito-bold tracking-wider">
          {fichado ? 'Fichar SALIDA' : 'Fichar ENTRADA'}
        </Text>
      </Pressable>

      <Text className="text-sm font-nunito-bold text-neutro mb-3 uppercase">Mi semana</Text>

      <View className="flex-row justify-between mb-6">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => {
          const trabajado = i < 4;
          const actual = i === 4;
          return (
            <View
              key={i}
              className={`w-10 h-10 rounded-full items-center justify-center border ${
                trabajado
                  ? 'bg-principal border-principal'
                  : actual
                  ? 'bg-acento border-acento'
                  : 'bg-white border-neutro'
              }`}>
              <Text
                className={`text-sm font-nunito-semi ${
                  trabajado ? 'text-white' : 'text-principal'
                }`}>
                {d}
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="text-sm font-nunito-bold text-neutro mb-3 uppercase">Accesos</Text>

      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Mi horario</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Solicitar dia</Text>
      </Pressable>
      <Pressable className="bg-white rounded-lg p-4 mb-2 border border-neutro" onPress={() => {}}>
        <Text className="text-base font-nunito text-principal">Mis novedades</Text>
      </Pressable>

      <Pressable className="bg-error rounded-lg p-4 mt-6" onPress={handleLogout}>
        <Text className="text-base font-nunito-semi text-white">Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}
