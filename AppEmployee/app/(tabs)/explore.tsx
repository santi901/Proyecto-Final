import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { misTrabajosAsignados, type EstadoTrabajo, type Trabajo } from '../../lib/trabajos';
import { Paleta } from '@/constants/theme';

const ESTADO_LABEL: Record<EstadoTrabajo, string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  completado: 'Completado',
};

// Clases del chip de estado (fondo y texto), con los colores del design system.
const ESTADO_CHIP: Record<EstadoTrabajo, { fondo: string; texto: string }> = {
  pendiente: { fondo: 'bg-fondo-suave border border-neutro', texto: 'text-neutro' },
  asignado: { fondo: 'bg-acento', texto: 'text-principal' },
  en_progreso: { fondo: 'bg-exito', texto: 'text-white' },
  completado: { fondo: 'bg-principal', texto: 'text-white' },
};

const PROXIMO_PASO: Partial<Record<EstadoTrabajo, string>> = {
  asignado: 'Cuando llegues, ingresá el PIN que te dicta el empleador.',
  en_progreso: 'Al terminar, subí la foto y marcalo como finalizado.',
};

// Los trabajos que aceptó el trabajador. Cada uno abre su pantalla de trabajo en curso,
// que es donde se valida el PIN, se sube la foto y se finaliza.
export default function MiTrabajoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { trabajos } = await misTrabajosAsignados();
      setTrabajos(trabajos);
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus trabajos.');
    }
  }, []);

  // Carga al entrar y cada vez que se vuelve a esta pestaña (por ej. después de aceptar un trabajo).
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pt-4 pb-2">
        <View>
          <Text className="text-2xl font-nunito-bold text-principal">Mis trabajos</Text>
          <Text className="text-sm font-nunito text-neutro mt-1">Los trabajos que aceptaste</Text>
        </View>
        <Pressable onPress={cargar} className="p-2 active:opacity-60">
          <MaterialIcons name="refresh" size={22} color={Paleta.principal} />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}>
        {trabajos === null && !error && (
          <View className="items-center py-10">
            <ActivityIndicator color={Paleta.principal} />
          </View>
        )}

        {!!error && (
          <View className="items-center py-6">
            <Text className="text-error text-sm font-nunito text-center mb-3">{error}</Text>
            <Pressable onPress={cargar} className="px-4 py-2 rounded-lg border border-principal active:opacity-70">
              <Text className="text-principal text-sm font-nunito-semi">Reintentar</Text>
            </Pressable>
          </View>
        )}

        {trabajos !== null && !error && trabajos.length === 0 && (
          <View className="items-center py-10 px-6">
            <MaterialIcons name="assignment" size={32} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">
              Todavía no aceptaste ningún trabajo. Buscá uno disponible desde la pantalla principal.
            </Text>
          </View>
        )}

        {trabajos?.map(t => {
          const chip = ESTADO_CHIP[t.estado];
          const paso = PROXIMO_PASO[t.estado];
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/trabajo-en-curso', params: { trabajoId: t.id } } as any)}
              className="bg-white rounded-xl border border-neutro p-4 mb-3 active:opacity-70">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="text-base font-nunito-bold text-principal flex-1 pr-2">{t.titulo}</Text>
                <View className={`rounded-full px-2.5 py-1 ${chip.fondo}`}>
                  <Text className={`text-[11px] font-nunito-bold ${chip.texto}`}>{ESTADO_LABEL[t.estado]}</Text>
                </View>
              </View>
              <Text className="text-[13px] font-nunito text-neutro">
                {t.categoria}{t.nivel_dificultad ? ` · ${t.nivel_dificultad}` : ''} · ${t.precio}
              </Text>

              {paso ? (
                <View className="flex-row items-center mt-3">
                  <Text className="flex-1 text-[13px] font-nunito-semi text-principal">{paso}</Text>
                  <MaterialIcons name="chevron-right" size={22} color={Paleta.principal} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
