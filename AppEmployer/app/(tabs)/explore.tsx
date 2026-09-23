import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { misTrabajosPublicados, obtenerPinLocal, type EstadoTrabajo, type Trabajo } from '../../lib/trabajos';
import { Paleta, sombra } from '@/constants/theme';

const ESTADO_LABEL: Record<EstadoTrabajo, string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

// Clases del chip de estado (fondo y texto), con los colores del design system.
const ESTADO_CHIP: Record<EstadoTrabajo, { fondo: string; texto: string; sombra?: string }> = {
  pendiente: { fondo: 'bg-fondo-suave', texto: 'text-neutro', sombra: Paleta.neutro },
  asignado: { fondo: 'bg-acento', texto: 'text-principal' },
  en_progreso: { fondo: 'bg-exito', texto: 'text-white' },
  completado: { fondo: 'bg-principal', texto: 'text-white' },
  cancelado: { fondo: 'bg-error', texto: 'text-white' },
};

// El PIN solo tiene sentido mostrarlo mientras el trabajo todavía no arrancó
// (el empleado lo necesita para pasar de 'asignado' a 'en_progreso').
const ESTADOS_CON_PIN: EstadoTrabajo[] = ['pendiente', 'asignado'];

function proximoPaso(t: Trabajo): string {
  if (t.estado === 'pendiente') {
    const vencida = !!t.solicitud_expira_en && new Date(t.solicitud_expira_en).getTime() < Date.now();
    return vencida ? 'Nadie lo aceptó a tiempo: la solicitud expiró.' : 'Esperando que un trabajador lo acepte.';
  }
  if (t.estado === 'asignado') return 'El trabajador va en camino. Dictale el PIN cuando llegue.';
  if (t.estado === 'en_progreso') return 'Trabajo en curso.';
  // El backend cancela solo los trabajos que nadie acepta después de 3 reintentos.
  if (t.estado === 'cancelado') return 'Este trabajo se canceló. Podés volver a publicarlo.';
  return 'Tocá para ver la foto y calificar al trabajador.';
}

// Los trabajos que publicó el empleador. Cada uno abre su seguimiento / detalle.
export default function MisTrabajosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [error, setError] = useState('');
  const [pins, setPins] = useState<Record<string, string | null>>({});
  const [pinVisible, setPinVisible] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { trabajos } = await misTrabajosPublicados();
      setTrabajos(trabajos);

      const entradas = await Promise.all(
        trabajos
          .filter(t => ESTADOS_CON_PIN.includes(t.estado))
          .map(async t => [t.id, await obtenerPinLocal(t.id)] as const),
      );
      setPins(Object.fromEntries(entradas));
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus trabajos.');
    }
  }, []);

  // Carga al entrar y cada vez que se vuelve a esta pestaña (por ej. después de publicar un trabajo).
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pt-4 pb-2">
        <View>
          <Text className="text-2xl font-nunito-bold text-principal">Mis trabajos</Text>
          <Text className="text-sm font-nunito text-neutro mt-1">Los trabajos que publicaste</Text>
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
            <Pressable onPress={cargar} style={sombra(Paleta.principal, 0.75)} className="px-4 py-2 rounded-lg active:opacity-70">
              <Text className="text-principal text-sm font-nunito-semi">Reintentar</Text>
            </Pressable>
          </View>
        )}

        {trabajos !== null && !error && trabajos.length === 0 && (
          <View className="items-center py-10 px-6">
            <MaterialIcons name="assignment" size={32} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">
              Todavía no publicaste ningún trabajo.
            </Text>
          </View>
        )}

        {trabajos?.map(t => {
          const chip = ESTADO_CHIP[t.estado];
          const pin = pins[t.id];
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/seguimiento', params: { trabajoId: t.id } } as any)}
              style={sombra(Paleta.acento)}
              className="bg-white rounded-xl p-4 mb-3 active:opacity-70">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="text-base font-nunito-bold text-principal flex-1 pr-2">{t.titulo}</Text>
                <View
                  style={chip.sombra ? sombra(chip.sombra) : undefined}
                  className={`rounded-full px-2.5 py-1 ${chip.fondo}`}>
                  <Text className={`text-[11px] font-nunito-bold ${chip.texto}`}>{ESTADO_LABEL[t.estado]}</Text>
                </View>
              </View>
              <Text className="text-[13px] font-nunito text-neutro">
                {t.categoria}{t.nivel_dificultad ? ` · ${t.nivel_dificultad}` : ''} · ${t.precio}
              </Text>

              <View className="flex-row items-center mt-3">
                <Text className="flex-1 text-[13px] font-nunito-semi text-principal">{proximoPaso(t)}</Text>
                <MaterialIcons name="chevron-right" size={22} color={Paleta.principal} />
              </View>

              {ESTADOS_CON_PIN.includes(t.estado) && pin ? (
                pinVisible[t.id] ? (
                  <View className="bg-acento rounded-lg py-3 items-center mt-3">
                    <Text className="text-principal text-lg font-nunito-bold tracking-[4px]">{pin}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setPinVisible(s => ({ ...s, [t.id]: true }))}
                    style={sombra(Paleta.principal, 0.75)}
                    className="rounded-lg py-2.5 items-center mt-3 active:opacity-70">
                    <Text className="text-principal text-sm font-nunito-semi">Ver PIN</Text>
                  </Pressable>
                )
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
