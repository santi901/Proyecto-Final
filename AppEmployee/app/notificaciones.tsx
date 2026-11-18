import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Encabezado from '../components/encabezado';
import {
  ICONO_NOTIFICACION,
  listarNotificaciones,
  marcarNotificacionesVistas,
  type Notificacion,
} from '../lib/notificaciones';
import { abrirDesdeNotificacion } from '../lib/navegacion';
import { Paleta, sombra } from '@/constants/theme';

// Bandeja de notificaciones (Sprint 6): solicitudes, aceptaciones, pagos y demás avisos
// que mandó el backend. Funciona aunque el push no llegue (Expo Go, sin permiso).

function haceCuanto(iso: string): string {
  const seg = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'recién';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

export default function NotificacionesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<Notificacion[] | null>(null);
  const [vistasHasta, setVistasHasta] = useState(0);
  const [error, setError] = useState('');
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const previa = await AsyncStorage.getItem('cg_notificaciones_vistas_hasta');
      const datos = await listarNotificaciones();
      setVistasHasta(previa ? new Date(previa).getTime() : 0);
      setLista(datos);
      // Al abrir la bandeja, todo lo que hay queda visto (se resalta igual esta vez).
      if (datos[0]) await marcarNotificacionesVistas(datos[0].enviado_en);
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus notificaciones.');
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function refrescar() {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Notificaciones" subtitulo="Solicitudes, aceptaciones y pagos" />
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={Paleta.principal} />}>
        {lista === null && !error ? (
          <View className="items-center py-10"><ActivityIndicator color={Paleta.principal} /></View>
        ) : null}

        {error ? (
          <View className="items-center py-6">
            <Text className="text-error text-sm font-nunito text-center mb-3">{error}</Text>
            <Pressable onPress={cargar} style={sombra(Paleta.principal, 0.75)} className="px-4 py-2 rounded-lg active:opacity-70">
              <Text className="text-principal text-sm font-nunito-semi">Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {lista && !error && lista.length === 0 ? (
          <View className="items-center py-12 px-6">
            <MaterialIcons name="notifications-none" size={36} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">
              Todavía no tenés notificaciones. Acá vas a ver las solicitudes, aceptaciones y pagos.
            </Text>
          </View>
        ) : null}

        {!error && lista?.map(n => {
          const nueva = new Date(n.enviado_en).getTime() > vistasHasta;
          return (
            <Pressable
              key={n.id}
              onPress={() => abrirDesdeNotificacion(router, { tipo: n.tipo, trabajoId: n.trabajo_id })}
              style={sombra(nueva ? Paleta.acento : Paleta.neutro, nueva ? 1 : 0.5)}
              className="flex-row bg-white rounded-xl p-4 mb-3 active:opacity-70">
              <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${nueva ? 'bg-acento' : 'bg-fondo'}`}>
                <MaterialIcons name={ICONO_NOTIFICACION[n.tipo] ?? 'notifications-none'} size={20} color={Paleta.principal} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between items-start">
                  <Text className="flex-1 text-sm font-nunito-bold text-principal pr-2">{n.titulo ?? 'ChanguitApp'}</Text>
                  <Text className="text-[11px] font-nunito text-neutro">{haceCuanto(n.enviado_en)}</Text>
                </View>
                <Text className="text-[13px] font-nunito text-principal mt-0.5 leading-[18px]">{n.mensaje}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
