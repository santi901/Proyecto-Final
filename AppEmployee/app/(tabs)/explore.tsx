import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { misTrabajosAsignados, validarPin, completarTrabajo, type Trabajo } from '../../lib/trabajos';

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

export default function MiTrabajoScreen() {
  const insets = useSafeAreaInsets();
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [error, setError] = useState('');
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [validandoId, setValidandoId] = useState<string | null>(null);
  const [completandoId, setCompletandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { trabajos } = await misTrabajosAsignados();
      setTrabajos(trabajos);
    } catch (e: any) {
      setError(e.message || 'No pudimos cargar tu trabajo.');
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  // Recarga al volver a esta pestaña (por ej. después de aceptar un trabajo nuevo).
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function handleValidarPin(id: string) {
    const pin = (pinInputs[id] || '').trim();
    if (pin.length !== 6) {
      Alert.alert('PIN inválido', 'El PIN tiene 6 dígitos.');
      return;
    }

    setValidandoId(id);
    try {
      const { message } = await validarPin(id, pin);
      Alert.alert('Trabajo iniciado', message);
      setPinInputs((s) => ({ ...s, [id]: '' }));
      cargar();
    } catch (e: any) {
      Alert.alert('PIN incorrecto', e.message || 'Intentá de nuevo.');
    } finally {
      setValidandoId(null);
    }
  }

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
        <Text className="text-2xl font-bold text-[#0f172a]">Mi trabajo</Text>
        <Text className="text-sm text-[#64748b] mt-1">Los trabajos que aceptaste</Text>
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
              Todavía no aceptaste ningún trabajo. Buscá uno disponible desde la pantalla principal.
            </Text>
          </View>
        )}

        {trabajos !== null && trabajos.map((t) => (
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

            {t.estado === 'asignado' && (
              <View>
                <Text className="text-[13px] text-[#475569] mb-2">
                  Pedile el PIN al empleador cuando llegues, para iniciar el trabajo:
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={pinInputs[t.id] || ''}
                    onChangeText={(v) => setPinInputs((s) => ({ ...s, [t.id]: v.replace(/[^0-9]/g, '').slice(0, 6) }))}
                    placeholder="PIN"
                    keyboardType="number-pad"
                    maxLength={6}
                    className="flex-1 bg-[#f1f5f9] rounded-lg px-4 py-2.5 text-base text-[#0f172a] border border-[#e2e8f0] tracking-[4px]"
                  />
                  <Pressable
                    onPress={() => handleValidarPin(t.id)}
                    disabled={validandoId === t.id}
                    className={`rounded-lg px-4 items-center justify-center ${
                      validandoId === t.id ? 'bg-[#f5e08a]' : 'bg-[#FFD942] active:opacity-90'
                    }`}>
                    {validandoId === t.id ? (
                      <ActivityIndicator color="#1a1a1a" size="small" />
                    ) : (
                      <Text className="text-[#1a1a1a] text-sm font-extrabold">Iniciar</Text>
                    )}
                  </Pressable>
                </View>
              </View>
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
        ))}
      </ScrollView>
    </View>
  );
}
