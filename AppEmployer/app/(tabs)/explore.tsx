import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { misTrabajosPublicados, obtenerPinLocal, completarTrabajo, type Trabajo } from '../../lib/trabajos';

const ESTADO_LABEL: Record<Trabajo['estado'], string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  completado: 'Completado',
};

const ESTADO_COLOR: Record<Trabajo['estado'], string> = {
  pendiente: '#b9770e',
  asignado: '#0a7ea4',
  en_progreso: '#1d8348',
  completado: '#64748b',
};

// El PIN solo tiene sentido mostrarlo mientras el trabajo todavía no arrancó
// (el empleado lo necesita para pasar de 'asignado' a 'en_progreso').
const ESTADOS_CON_PIN: Trabajo['estado'][] = ['pendiente', 'asignado'];

export default function MisTrabajosScreen() {
  const insets = useSafeAreaInsets();
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [error, setError] = useState('');
  const [pins, setPins] = useState<Record<string, string | null>>({});
  const [pinVisible, setPinVisible] = useState<Record<string, boolean>>({});
  const [completandoId, setCompletandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { trabajos } = await misTrabajosPublicados();
      setTrabajos(trabajos);

      const entradas = await Promise.all(
        trabajos
          .filter((t) => ESTADOS_CON_PIN.includes(t.estado))
          .map(async (t) => [t.id, await obtenerPinLocal(t.id)] as const),
      );
      setPins(Object.fromEntries(entradas));
    } catch (e: any) {
      setError(e.message || 'No pudimos cargar tus trabajos.');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  // Recarga cada vez que se vuelve a esta pestaña (por ej. después de publicar un trabajo nuevo).
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function handleCompletar(id: string) {
    setCompletandoId(id);
    try {
      const { message } = await completarTrabajo(id);
      Alert.alert('Trabajo completado', message);
      cargar();
    } catch (e: any) {
      Alert.alert('No se pudo completar', e.message || 'Intentá de nuevo.');
    } finally {
      setCompletandoId(null);
    }
  }

  return (
    <View className="flex-1 bg-[#f1f5f9]" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-[#0f172a]">Mis trabajos</Text>
        <Text className="text-sm text-[#64748b] mt-1">Los trabajos que publicaste</Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}>
        {trabajos === null && !error && (
          <View className="items-center py-10">
            <ActivityIndicator color="#FFD942" />
          </View>
        )}

        {!!error && (
          <View className="items-center py-6">
            <Text className="text-[#e74c3c] text-sm text-center mb-3">{error}</Text>
            <Pressable onPress={cargar} className="px-4 py-2 rounded-lg border border-[#e2e8f0] active:opacity-70">
              <Text className="text-[#475569] text-sm font-semibold">Reintentar</Text>
            </Pressable>
          </View>
        )}

        {trabajos !== null && !error && trabajos.length === 0 && (
          <View className="items-center py-10">
            <Text className="text-[#64748b] text-sm text-center">
              Todavía no publicaste ningún trabajo.
            </Text>
          </View>
        )}

        {trabajos !== null && trabajos.map((t) => {
          const pin = pins[t.id];
          const mostrarPin = pinVisible[t.id];
          return (
            <View key={t.id} className="bg-white rounded-xl border border-[#e2e8f0] p-4 mb-3">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="text-base font-bold text-[#0f172a] flex-1 pr-2">{t.titulo}</Text>
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: ESTADO_COLOR[t.estado] }}>
                  <Text className="text-white text-[11px] font-bold">{ESTADO_LABEL[t.estado]}</Text>
                </View>
              </View>
              <Text className="text-[13px] text-[#64748b] mb-3">
                {t.categoria}{t.nivel_dificultad ? ` · ${t.nivel_dificultad}` : ''} · ${t.precio}
              </Text>

              {ESTADOS_CON_PIN.includes(t.estado) && (
                pin ? (
                  mostrarPin ? (
                    <View className="bg-[#fff8da] rounded-lg py-3 items-center">
                      <Text className="text-[#1a1a1a] text-lg font-black tracking-[4px]">{pin}</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setPinVisible((s) => ({ ...s, [t.id]: true }))}
                      className="rounded-lg py-2.5 items-center border border-[#e2e8f0] active:opacity-70">
                      <Text className="text-[#475569] text-sm font-semibold">Ver PIN</Text>
                    </Pressable>
                  )
                ) : (
                  <Text className="text-[#94a3b8] text-xs text-center">
                    PIN no disponible en este dispositivo
                  </Text>
                )
              )}

              {t.estado === 'en_progreso' && (
                <Pressable
                  onPress={() => handleCompletar(t.id)}
                  disabled={completandoId === t.id}
                  className={`rounded-lg py-2.5 items-center ${
                    completandoId === t.id ? 'bg-[#a8d9bd]' : 'bg-[#1d8348] active:opacity-90'
                  }`}>
                  {completandoId === t.id ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text className="text-white text-sm font-extrabold">Marcar como completado</Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
