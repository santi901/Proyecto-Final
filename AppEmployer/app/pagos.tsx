import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import { misTrabajosPublicados, type EstadoTrabajo, type Trabajo } from '../lib/trabajos';
import { formatearFecha, formatearMonto } from '../lib/historial';
import { Paleta, sombra } from '@/constants/theme';

// Historial de pagos del empleador (Sprint 6): cada trabajo que pagó, con el monto, la
// comisión de la plataforma y lo que le llega al trabajador. Sale de `GET /api/trabajos/mios`,
// que ya trae `precio`, `comision_monto`, `comision_porcentaje` y `monto_trabajador`.

const ESTADO_PAGO: Record<EstadoTrabajo, { texto: string; color: string }> = {
  pago_pendiente: { texto: 'Sin pagar', color: Paleta.error },
  pendiente: { texto: 'Pagado · retenido', color: Paleta.principal },
  asignado: { texto: 'Pagado · retenido', color: Paleta.principal },
  en_progreso: { texto: 'Pagado · retenido', color: Paleta.principal },
  completado: { texto: 'Liberado al trabajador', color: Paleta.exito },
  cancelado: { texto: 'Cancelado · reembolsado', color: Paleta.neutro },
};

export default function PagosEmpleadorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [error, setError] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const { trabajos } = await misTrabajosPublicados();
      setTrabajos(trabajos);
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus pagos.');
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const pagados = (trabajos ?? []).filter(t => t.estado !== 'pago_pendiente');
  const completados = pagados.filter(t => t.estado === 'completado');
  const retenido = pagados
    .filter(t => ['pendiente', 'asignado', 'en_progreso'].includes(t.estado))
    .reduce((s, t) => s + t.precio, 0);
  const totalPagado = completados.reduce((s, t) => s + t.precio, 0);
  const totalComision = completados.reduce((s, t) => s + (t.comision_monto ?? 0), 0);

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Mis pagos" subtitulo="Lo que pagaste por cada trabajo" alternativa="/(tabs)/ofrecer" />
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => { setRefrescando(true); await cargar(); setRefrescando(false); }}
            tintColor={Paleta.principal}
          />
        }>
        {trabajos === null && !error ? (
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

        {trabajos && !error ? (
          <>
            <View className="bg-principal rounded-xl p-4 mb-3">
              <Text className="text-white text-xs font-nunito opacity-80">Pagado por trabajos terminados</Text>
              <Text className="text-acento text-3xl font-nunito-bold mt-0.5">{formatearMonto(totalPagado)}</Text>
              <Text className="text-white text-xs font-nunito mt-1 opacity-80">
                {formatearMonto(totalPagado - totalComision)} para los trabajadores · {formatearMonto(totalComision)} de comisión
              </Text>
            </View>
            {retenido > 0 ? (
              <View style={sombra(Paleta.acento)} className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-4">
                <MaterialIcons name="lock-outline" size={18} color={Paleta.principal} />
                <Text className="flex-1 text-principal text-[13px] font-nunito ml-2">
                  {formatearMonto(retenido)} retenidos hasta que terminen los trabajos en curso.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        {trabajos && !error && pagados.length === 0 ? (
          <View className="items-center py-10 px-6">
            <MaterialIcons name="receipt-long" size={32} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">Todavía no pagaste ningún trabajo.</Text>
          </View>
        ) : null}

        {!error && pagados.map(t => {
          const estado = ESTADO_PAGO[t.estado];
          const verDetalle = abierto === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setAbierto(verDetalle ? null : t.id)}
              style={sombra(Paleta.neutro, 0.5)}
              className="bg-white rounded-xl p-4 mb-3 active:opacity-80">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-nunito-bold text-principal" numberOfLines={1}>{t.titulo}</Text>
                  <Text className="text-[12px] font-nunito text-neutro">{t.categoria} · {formatearFecha(t.creado_en)}</Text>
                </View>
                <Text className="text-base font-nunito-bold text-principal">{formatearMonto(t.precio)}</Text>
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <Text style={{ color: estado.color }} className="text-[12px] font-nunito-bold">{estado.texto}</Text>
                <MaterialIcons name={verDetalle ? 'expand-less' : 'expand-more'} size={20} color={Paleta.neutro} />
              </View>

              {verDetalle ? (
                <View className="mt-2 pt-2 border-t border-neutro/30">
                  <Linea texto="Pagaste" valor={formatearMonto(t.precio)} />
                  <Linea
                    texto={`Comisión ChanguitApp${t.comision_porcentaje != null ? ` (${t.comision_porcentaje}%)` : ''}`}
                    valor={`− ${formatearMonto(t.comision_monto ?? 0)}`}
                  />
                  <Linea texto="Recibe el trabajador" valor={formatearMonto(t.monto_trabajador ?? t.precio)} fuerte />
                  <Pressable
                    onPress={() => router.push({ pathname: '/seguimiento', params: { trabajoId: t.id } } as any)}
                    className="flex-row items-center justify-end mt-2 active:opacity-70">
                    <Text className="text-principal text-[13px] font-nunito-semi underline">Ver el trabajo</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Linea({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-[13px] text-principal ${fuerte ? 'font-nunito-bold' : 'font-nunito'}`}>{texto}</Text>
      <Text className={`text-[13px] text-principal ${fuerte ? 'font-nunito-bold' : 'font-nunito'}`}>{valor}</Text>
    </View>
  );
}
