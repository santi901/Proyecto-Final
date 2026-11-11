import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import { apiGet } from '../auth';
import { misTrabajosAsignados, type Trabajo } from '../lib/trabajos';
import { formatearFecha, formatearMonto } from '../lib/historial';
import { Paleta, sombra } from '@/constants/theme';

// Historial de pagos del trabajador (Sprint 6): cada liquidación (lo que le transferimos)
// con el detalle de cuánto pagó el empleador y cuánto se descontó de comisión.
// `GET /api/pagos/mis-liquidaciones` trae las liquidaciones; el precio y la comisión de
// cada trabajo salen de `GET /api/trabajos/mios`.

type Liquidacion = {
  id: string;
  trabajo_id: string;
  motivo: 'trabajo_completado' | 'compensacion_cancelacion' | string;
  monto: number;
  estado: 'pendiente' | 'pagada' | string;
  creado_en: string;
  pagada_en: string | null;
};

const MOTIVO: Record<string, string> = {
  trabajo_completado: 'Trabajo completado',
  compensacion_cancelacion: 'Compensación por cancelación',
};

export default function PagosTrabajadorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[] | null>(null);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [aliasCobro, setAliasCobro] = useState<string | null>(null);
  const [trabajos, setTrabajos] = useState<Record<string, Trabajo>>({});
  const [error, setError] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [data, mios] = await Promise.all([
        apiGet('/api/pagos/mis-liquidaciones'),
        misTrabajosAsignados().catch(() => ({ trabajos: [] as Trabajo[] })),
      ]);
      setLiquidaciones(data.liquidaciones ?? []);
      setTotalPendiente(data.totalPendiente ?? 0);
      setAliasCobro(data.aliasCobro ?? null);
      setTrabajos(Object.fromEntries(mios.trabajos.map(t => [t.id, t])));
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar tus pagos.');
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const cobrado = (liquidaciones ?? []).filter(l => l.estado === 'pagada').reduce((s, l) => s + l.monto, 0);
  const comisiones = (liquidaciones ?? [])
    .filter(l => l.motivo === 'trabajo_completado')
    .reduce((s, l) => s + (trabajos[l.trabajo_id]?.comision_monto ?? 0), 0);

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Mis pagos" subtitulo="Lo que cobraste por cada trabajo" alternativa="/(tabs)/buscar" />
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
        {liquidaciones === null && !error ? (
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

        {liquidaciones && !error ? (
          <>
            <View className="bg-principal rounded-xl p-4 mb-3">
              <Text className="text-white text-xs font-nunito opacity-80">Ya transferido</Text>
              <Text className="text-acento text-3xl font-nunito-bold mt-0.5">{formatearMonto(cobrado)}</Text>
              <Text className="text-white text-xs font-nunito mt-1 opacity-80">
                {formatearMonto(totalPendiente)} por transferir · {formatearMonto(comisiones)} de comisión descontada
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/metodos-cobro' as any)}
              style={sombra(aliasCobro ? Paleta.acento : Paleta.error)}
              className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-4 active:opacity-70">
              <MaterialIcons name="account-balance" size={18} color={Paleta.principal} />
              <Text className="flex-1 text-principal text-[13px] font-nunito ml-2" numberOfLines={1}>
                {aliasCobro ? `Cobrás en ${aliasCobro}` : 'Cargá un CVU o alias para poder cobrar'}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color={Paleta.neutro} />
            </Pressable>
          </>
        ) : null}

        {liquidaciones && !error && liquidaciones.length === 0 ? (
          <View className="items-center py-10 px-6">
            <MaterialIcons name="receipt-long" size={32} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">
              Todavía no tenés pagos. Aparecen acá cuando terminás un trabajo.
            </Text>
          </View>
        ) : null}

        {!error && liquidaciones?.map(l => {
          const t = trabajos[l.trabajo_id];
          const pagada = l.estado === 'pagada';
          const verDetalle = abierta === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => setAbierta(verDetalle ? null : l.id)}
              style={sombra(Paleta.neutro, 0.5)}
              className="bg-white rounded-xl p-4 mb-3 active:opacity-80">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-nunito-bold text-principal" numberOfLines={1}>
                    {t?.titulo ?? MOTIVO[l.motivo] ?? 'Pago'}
                  </Text>
                  <Text className="text-[12px] font-nunito text-neutro">
                    {MOTIVO[l.motivo] ?? l.motivo} · {formatearFecha(l.pagada_en ?? l.creado_en)}
                  </Text>
                </View>
                <Text className={`text-base font-nunito-bold ${pagada ? 'text-exito' : 'text-principal'}`}>
                  {formatearMonto(l.monto)}
                </Text>
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <Text className={`text-[12px] font-nunito-bold ${pagada ? 'text-exito' : 'text-neutro'}`}>
                  {pagada ? 'Transferido' : 'Pendiente de transferencia'}
                </Text>
                <MaterialIcons name={verDetalle ? 'expand-less' : 'expand-more'} size={20} color={Paleta.neutro} />
              </View>

              {verDetalle ? (
                <View className="mt-2 pt-2 border-t border-neutro/30">
                  {t && l.motivo === 'trabajo_completado' ? (
                    <>
                      <Linea texto="Pagó el empleador" valor={formatearMonto(t.precio)} />
                      <Linea
                        texto={`Comisión ChanguitApp${t.comision_porcentaje != null ? ` (${t.comision_porcentaje}%)` : ''}`}
                        valor={`− ${formatearMonto(t.comision_monto ?? t.precio - l.monto)}`}
                      />
                    </>
                  ) : l.motivo === 'compensacion_cancelacion' ? (
                    <Text className="text-[13px] font-nunito text-principal mb-1">
                      El empleador canceló cuando ya ibas en camino: te queda el 20% del trabajo.
                    </Text>
                  ) : null}
                  <Linea texto="Recibís" valor={formatearMonto(l.monto)} fuerte />
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
