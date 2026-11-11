import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Paleta } from '@/constants/theme';

type Props = {
  titulo: string;
  subtitulo?: string;
  /** Adónde ir si no hay pantalla anterior (ej. se abrió desde un push). */
  alternativa?: string;
  derecha?: ReactNode;
};

// Cabecera con flecha para volver, que usan las pantallas apiladas (perfil, pagos,
// notificaciones, reportar problema…). Respeta el notch con el inset de arriba.
export default function Encabezado({ titulo, subtitulo, alternativa = '/(tabs)', derecha }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace(alternativa as any);
  }

  return (
    <View className="flex-row items-center px-5 pb-3 bg-fondo" style={{ paddingTop: insets.top + 12 }}>
      <Pressable onPress={volver} hitSlop={8} className="p-1 -ml-1 mr-2 active:opacity-70">
        <MaterialIcons name="arrow-back" size={24} color={Paleta.principal} />
      </Pressable>
      <View className="flex-1">
        <Text className="text-2xl font-nunito-bold text-principal" numberOfLines={1}>{titulo}</Text>
        {subtitulo ? <Text className="text-sm font-nunito text-neutro" numberOfLines={2}>{subtitulo}</Text> : null}
      </View>
      {derecha}
    </View>
  );
}
