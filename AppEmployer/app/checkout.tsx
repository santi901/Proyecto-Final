import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { simularPago } from '../lib/pagos';

// Checkout de demo con la estética de Mercado Pago. Se usa cuando el backend está en
// modo simulado (sin credenciales de MP): no se cobra nada ni se piden datos de
// tarjeta; al tocar "Pagar" el backend aprueba el pago (POST /:id/pago/simular) y el
// trabajo se publica igual que con un pago real.
//
// Params: trabajoId, monto, titulo y `desde` ('seguimiento' si se reabrió desde ahí,
// para volver con back en vez de apilar otro seguimiento).

// Colores propios de esta pantalla (no son del design system de ChanguitApp).
const MP = {
  celeste: '#009EE3',
  celesteOscuro: '#007EB5',
  fondo: '#EDEDED',
  texto: '#333333',
  gris: '#737373',
  verde: '#00A650',
};

type Medio = { id: string; icono: keyof typeof MaterialIcons.glyphMap; titulo: string; detalle: string };

const MEDIOS: Medio[] = [
  { id: 'dinero', icono: 'account-balance-wallet', titulo: 'Dinero disponible', detalle: 'En tu cuenta de Mercado Pago' },
  { id: 'credito', icono: 'credit-card', titulo: 'Visa crédito •••• 4509', detalle: '1 cuota sin interés' },
  { id: 'debito', icono: 'credit-card', titulo: 'Mastercard débito •••• 5031', detalle: 'Se debita en el momento' },
];

type Paso = 'eligiendo' | 'procesando' | 'aprobado';

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

function formatearMonto(monto: number) {
  return `$ ${monto.toLocaleString('es-AR')}`;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId, monto: montoParam, titulo, desde } = useLocalSearchParams<{
    trabajoId: string;
    monto: string;
    titulo: string;
    desde?: string;
  }>();
  const monto = Number(montoParam) || 0;

  const [medio, setMedio] = useState(MEDIOS[0].id);
  const [paso, setPaso] = useState<Paso>('eligiendo');
  const [error, setError] = useState('');

  function volverAlSeguimiento() {
    if (desde === 'seguimiento' && router.canGoBack()) router.back();
    else router.replace({ pathname: '/seguimiento', params: { trabajoId } } as any);
  }

  async function handlePagar() {
    setError('');
    setPaso('procesando');
    try {
      // La espera es solo para que se vea el "procesando", como en un checkout real.
      await Promise.all([simularPago(trabajoId!), esperar(1500)]);
      setPaso('aprobado');
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos procesar el pago.');
      setPaso('eligiendo');
    }
  }

  // ----- Pago aprobado: comprobante -----
  if (paso === 'aprobado') {
    const operacion = (trabajoId ?? '').replace(/\D/g, '').slice(0, 11).padEnd(11, '0');
    return (
      <View className="flex-1" style={{ backgroundColor: MP.fondo }}>
        <View
          className="items-center px-6 pb-10"
          style={{ backgroundColor: MP.verde, paddingTop: insets.top + 40 }}>
          <View className="w-16 h-16 rounded-full bg-white items-center justify-center mb-4">
            <MaterialIcons name="check" size={40} color={MP.verde} />
          </View>
          <Text className="text-white text-2xl font-nunito-bold text-center">¡Listo! Se acreditó tu pago</Text>
        </View>

        <View className="mx-4 -mt-5 bg-white rounded-lg p-5" style={{ elevation: 2 }}>
          <Text className="font-nunito text-sm" style={{ color: MP.gris }}>Pagaste</Text>
          <Text className="font-nunito-bold text-3xl mb-3" style={{ color: MP.texto }}>{formatearMonto(monto)}</Text>
          <Text className="font-nunito text-sm" style={{ color: MP.texto }}>a ChanguitApp · {titulo}</Text>
          <View className="h-px my-4" style={{ backgroundColor: MP.fondo }} />
          <Text className="font-nunito text-xs" style={{ color: MP.gris }}>
            {MEDIOS.find(m => m.id === medio)?.titulo}
          </Text>
          <Text className="font-nunito text-xs mt-1" style={{ color: MP.gris }}>Operación #{operacion}</Text>
        </View>

        <View className="flex-1" />
        <View className="px-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable
            onPress={volverAlSeguimiento}
            className="rounded-md py-4 items-center active:opacity-90"
            style={{ backgroundColor: MP.celeste }}>
            <Text className="text-white text-base font-nunito-bold">Volver a ChanguitApp</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ----- Elegir medio y pagar -----
  const procesando = paso === 'procesando';
  return (
    <View className="flex-1" style={{ backgroundColor: MP.fondo }}>
      <View
        className="flex-row items-center px-4 pb-4"
        style={{ backgroundColor: MP.celeste, paddingTop: insets.top + 12 }}>
        <Pressable onPress={volverAlSeguimiento} disabled={procesando} className="p-1 mr-3 active:opacity-70">
          <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-white text-lg font-nunito-bold">Mercado Pago</Text>
          <View className="flex-row items-center">
            <MaterialIcons name="lock" size={12} color="#FFFFFF" />
            <Text className="text-white text-xs font-nunito ml-1">Pago seguro</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Resumen */}
        <View className="bg-white rounded-lg p-5 mb-4" style={{ elevation: 1 }}>
          <Text className="font-nunito text-sm" style={{ color: MP.gris }}>Estás pagando</Text>
          <Text className="font-nunito-semi text-base mb-2" style={{ color: MP.texto }} numberOfLines={2}>
            {titulo || 'Trabajo en ChanguitApp'}
          </Text>
          <Text className="font-nunito-bold text-3xl" style={{ color: MP.texto }}>{formatearMonto(monto)}</Text>
        </View>

        {/* Medios de pago */}
        <Text className="font-nunito-bold text-base mb-3 px-1" style={{ color: MP.texto }}>¿Cómo querés pagar?</Text>
        <View className="bg-white rounded-lg overflow-hidden mb-4" style={{ elevation: 1 }}>
          {MEDIOS.map((m, i) => {
            const sel = medio === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMedio(m.id)}
                disabled={procesando}
                className="flex-row items-center px-4 py-4 active:opacity-70"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: MP.fondo } : undefined}>
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#F5F5F5' }}>
                  <MaterialIcons name={m.icono} size={20} color={MP.celeste} />
                </View>
                <View className="flex-1">
                  <Text className="font-nunito-semi text-[15px]" style={{ color: MP.texto }}>{m.titulo}</Text>
                  <Text className="font-nunito text-xs" style={{ color: MP.gris }}>{m.detalle}</Text>
                </View>
                <MaterialIcons
                  name={sel ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={22}
                  color={sel ? MP.celeste : MP.gris}
                />
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <Text className="font-nunito text-sm text-center mb-3" style={{ color: '#F23D4F' }}>{error}</Text>
        ) : null}
      </ScrollView>

      <View className="bg-white px-4 pt-3" style={{ paddingBottom: insets.bottom + 12, elevation: 8 }}>
        <View className="flex-row justify-between mb-3">
          <Text className="font-nunito text-base" style={{ color: MP.texto }}>Pagás</Text>
          <Text className="font-nunito-bold text-base" style={{ color: MP.texto }}>{formatearMonto(monto)}</Text>
        </View>
        <Pressable
          onPress={handlePagar}
          disabled={procesando}
          className="rounded-md py-4 items-center active:opacity-90"
          style={{ backgroundColor: procesando ? MP.celesteOscuro : MP.celeste }}>
          {procesando ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="#FFFFFF" />
              <Text className="text-white text-base font-nunito-bold ml-2">Procesando pago…</Text>
            </View>
          ) : (
            <Text className="text-white text-base font-nunito-bold">Pagar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
