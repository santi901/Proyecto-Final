import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { contarNoLeidas } from '../lib/notificaciones';
import { Paleta, sombra } from '@/constants/theme';

// Campanita de la barra superior con la cantidad de notificaciones sin ver. Se recuenta
// cada vez que la pantalla vuelve a tener foco (por ej. al volver de la bandeja).
export default function BotonNotificaciones() {
  const router = useRouter();
  const [noLeidas, setNoLeidas] = useState(0);

  useFocusEffect(useCallback(() => {
    let activo = true;
    contarNoLeidas().then(n => activo && setNoLeidas(n)).catch(() => {});
    return () => { activo = false; };
  }, []));

  return (
    <Pressable
      onPress={() => router.push('/notificaciones' as any)}
      style={sombra(Paleta.neutro)}
      className="w-11 h-11 rounded-full bg-white items-center justify-center active:opacity-70">
      <MaterialIcons name="notifications-none" size={22} color={Paleta.principal} />
      {noLeidas > 0 ? (
        <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error items-center justify-center">
          <Text className="text-white text-[10px] font-nunito-bold">{noLeidas > 9 ? '9+' : noLeidas}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
