import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario } from '../../auth';
import { formatearDuracion, type EstadoTrabajo } from '../../lib/trabajos';
import {
  formatearFecha,
  formatearMonto,
  obtenerHistorial,
  type ResumenHistorial,
  type TrabajoHistorial,
} from '../../lib/historial';
import { EstrellasLectura } from '../../components/tarjeta-reputacion';
import { Paleta } from '@/constants/theme';

// Historial de trabajos con estado, fecha, duración y ganancia (Sprint 5). La misma
// pantalla en las dos apps: el trabajador ve lo que cobró; el empleador, lo que pagó.

const ESTADO_LABEL: Record<EstadoTrabajo, string> = {
  pago_pendiente: 'Falta pagar',
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ESTADO_CHIP: Record<EstadoTrabajo, { fondo: string; texto: string }> = {
  pago_pendiente: { fondo: 'bg-fondo-suave border border-error', texto: 'text-error' },
  pendiente: { fondo: 'bg-fondo-suave border border-neutro', texto: 'text-neutro' },
  asignado: { fondo: 'bg-acento', texto: 'text-principal' },
  en_progreso: { fondo: 'bg-exito', texto: 'text-white' },
  completado: { fondo: 'bg-principal', texto: 'text-white' },
  cancelado: { fondo: 'bg-error', texto: 'text-white' },
};

const QUIEN_CANCELO: Record<string, string> = {
  empleado: 'Lo canceló el trabajador',
  empleador: 'Lo canceló el empleador',
  sistema: 'Nadie lo aceptó a tiempo',
};

type Filtro = 'todos' | 'completado' | 'cancelado';

export default function HistorialScreen() {
  const insets = useSafeAreaInsets();
  const [esEmpleado, setEsEmpleado] = useState(true);
  const [trabajos, setTrabajos] = useState<TrabajoHistorial[] | null>(null);
  const [resumen, setResumen] = useState<ResumenHistorial | null>(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const u = await getUsuario();
      setEsEmpleado(u?.tipo !== 'empleador');
      const data = await obtenerHistorial();
      setTrabajos(data.trabajos);
      setResumen(data.resumen);
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tu historial.');
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const visibles = (trabajos ?? []).filter(t => filtro === 'todos' || t.estado === filtro);
  const etiquetaMonto = esEmpleado ? 'Ganado' : 'Pagado';

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pt-4 pb-2">
        <View>
          <Text className="text-2xl font-nunito-bold text-principal">Historial</Text>
          <Text className="text-sm font-nunito text-neutro mt-1">
            {esEmpleado ? 'Los trabajos que hiciste' : 'Los trabajos que publicaste'}
          </Text>
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

        {resumen && !error && (
          <>
            <View className="bg-principal rounded-xl p-4 mb-3">
              <Text className="text-white text-xs font-nunito opacity-80">{etiquetaMonto} en total</Text>
              <Text className="text-acento text-3xl font-nunito-bold mt-0.5">{formatearMonto(resumen.gananciaTotal)}</Text>
              <Text className="text-white text-xs font-nunito mt-1 opacity-80">
                {formatearMonto(resumen.gananciaMes)} este mes
                {resumen.duracionTotalSegundos > 0
                  ? ` · ${formatearDuracion(resumen.duracionTotalSegundos)} trabajadas`
                  : ''}
              </Text>
            </View>

            <View className="flex-row gap-2 mb-4">
              <Contador valor={resumen.completados} etiqueta="Completados" />
              <Contador valor={resumen.enCurso} etiqueta="En curso" />
              <Contador valor={resumen.cancelados} etiqueta="Cancelados" />
            </View>

            <View className="flex-row gap-2 mb-3">
              {(['todos', 'completado', 'cancelado'] as Filtro[]).map(f => (
                <Pressable
                  key={f}
                  onPress={() => setFiltro(f)}
                  className={`px-3.5 py-1.5 rounded-full border ${
                    filtro === f ? 'bg-principal border-principal' : 'bg-white border-neutro'
                  }`}>
                  <Text className={`text-[13px] font-nunito-semi ${filtro === f ? 'text-white' : 'text-principal'}`}>
                    {f === 'todos' ? 'Todos' : f === 'completado' ? 'Completados' : 'Cancelados'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {trabajos !== null && !error && visibles.length === 0 && (
          <View className="items-center py-10 px-6">
            <MaterialIcons name="history" size={32} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">
              {trabajos.length === 0 ? 'Todavía no tenés trabajos en tu historial.' : 'No hay trabajos con ese filtro.'}
            </Text>
          </View>
        )}

        {!error && visibles.map(t => {
          const chip = ESTADO_CHIP[t.estado];
          return (
            <View key={t.id} className="bg-white rounded-xl border border-neutro p-4 mb-3">
              <View className="flex-row justify-between items-start mb-1">
                <Text className="text-base font-nunito-bold text-principal flex-1 pr-2">{t.titulo}</Text>
                <View className={`rounded-full px-2.5 py-1 ${chip.fondo}`}>
                  <Text className={`text-[11px] font-nunito-bold ${chip.texto}`}>{ESTADO_LABEL[t.estado]}</Text>
                </View>
              </View>
              <Text className="text-[13px] font-nunito text-neutro">
                {t.categoria} · {formatearFecha(t.fecha)}
              </Text>

              <View className="flex-row items-center justify-between mt-3">
                <View className="flex-row items-center">
                  <MaterialIcons name="schedule" size={16} color={Paleta.neutro} />
                  <Text className="text-[13px] font-nunito text-principal ml-1">
                    {t.duracionSegundos != null ? formatearDuracion(t.duracionSegundos) : '—'}
                  </Text>
                </View>
                <Text
                  className={`text-base font-nunito-bold ${t.estado === 'completado' ? 'text-exito' : 'text-neutro'}`}>
                  {t.estado === 'completado' ? formatearMonto(t.ganancia) : formatearMonto(t.precio)}
                </Text>
              </View>

              {t.estado === 'cancelado' && t.cancelado_por ? (
                <Text className="text-error text-xs font-nunito mt-2">{QUIEN_CANCELO[t.cancelado_por] ?? 'Cancelado'}</Text>
              ) : null}

              {t.calificacion ? (
                <View className="mt-2.5 pt-2.5 border-t border-neutro">
                  <EstrellasLectura valor={t.calificacion.puntaje} tamano={14} />
                  {t.calificacion.comentario ? (
                    <Text className="text-principal text-[13px] font-nunito mt-0.5">“{t.calificacion.comentario}”</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Contador({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <View className="flex-1 bg-white border border-neutro rounded-xl py-3 items-center">
      <Text className="text-principal text-xl font-nunito-bold">{valor}</Text>
      <Text className="text-neutro text-[11px] font-nunito">{etiqueta}</Text>
    </View>
  );
}
