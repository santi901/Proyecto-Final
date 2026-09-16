import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapaSeguimiento from '../components/mapa-seguimiento';
import {
  obtenerTrabajo,
  completarTrabajo,
  obtenerPinLocal,
  type Trabajo,
} from '../lib/trabajos';
import { Paleta } from '@/constants/theme';

// Seguimiento del trabajo publicado, del lado del empleador:
//   · mapa con el lugar del trabajo
//   · el PIN de verificación que hay que dictarle al trabajador cuando llega
//   · la foto de evidencia y la confirmación de finalización
//
// Nota sobre el PIN: el backend de Nico lo devuelve **una sola vez**, al publicar el
// trabajo (`POST /api/trabajos`), y quien lo valida contra la base es el trabajador
// (`POST /api/trabajos/:id/validar-pin`, que es `soloEmpleado`). Por eso al publicar se
// guarda en el dispositivo (`guardarPinLocal`) y acá se lee de ahí para dictarlo; el campo
// de abajo sirve para chequear lo que el trabajador repite — no vuelve a pegarle al backend.
//
// El pin del trabajador en el mapa queda sin datos: el backend guarda la ubicación que
// manda la app del trabajador, pero todavía no expone un endpoint para leerla.
export default function SeguimientoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [pinDelTrabajo, setPinDelTrabajo] = useState<string | null>(null);
  const [pinIngresado, setPinIngresado] = useState('');
  const [pinVerificado, setPinVerificado] = useState(false);
  const [errorPin, setErrorPin] = useState('');

  const [confirmando, setConfirmando] = useState(false);
  const [confirmandoFin, setConfirmandoFin] = useState(false);

  // ----- PIN guardado en este dispositivo al publicar -----
  useEffect(() => {
    if (trabajoId) obtenerPinLocal(trabajoId).then(setPinDelTrabajo);
  }, [trabajoId]);

  // ----- Estado del trabajo -----
  // Se refresca cada 5 segundos mientras el trabajo no esté completado.
  const completadoRef = useRef(false);

  useEffect(() => {
    if (!trabajoId) { setError('No se recibió el trabajo.'); setCargando(false); return; }

    let activo = true;

    async function refrescar() {
      try {
        const { trabajo: t } = await obtenerTrabajo(trabajoId!);
        if (!activo) return;
        setTrabajo(t);
        completadoRef.current = t.estado === 'completado';
        setError('');
      } catch (e: any) {
        if (activo) setError(e?.message ?? 'No pudimos cargar el trabajo.');
      } finally {
        if (activo) setCargando(false);
      }
    }

    refrescar();
    const reloj = setInterval(() => {
      if (!completadoRef.current) refrescar();
    }, 5000);

    return () => { activo = false; clearInterval(reloj); };
  }, [trabajoId]);

  // Objeto estable: el mapa no se vuelve a armar en cada refresco del trabajo.
  const lugar = useMemo(
    () => (trabajo ? { lat: trabajo.latitud, lng: trabajo.longitud } : null),
    [trabajo?.latitud, trabajo?.longitud],
  );

  function verificarPin() {
    setErrorPin('');
    if (pinIngresado.length !== 6) { setErrorPin('El PIN tiene 6 dígitos.'); return; }
    if (pinIngresado !== pinDelTrabajo) { setErrorPin('El código no coincide con el de este trabajo.'); return; }
    setPinVerificado(true);
  }

  async function handleConfirmarFin() {
    setError('');
    setConfirmando(true);
    try {
      await completarTrabajo(trabajoId!);
      setTrabajo(t => (t ? { ...t, estado: 'completado' } : t));
      completadoRef.current = true;
      setConfirmandoFin(false);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos confirmar la finalización.');
    } finally {
      setConfirmando(false);
    }
  }

  if (cargando) {
    return (
      <View className="flex-1 bg-fondo items-center justify-center">
        <ActivityIndicator size="large" color={Paleta.principal} />
        <Text className="text-neutro text-sm font-nunito mt-3">Cargando el trabajo…</Text>
      </View>
    );
  }

  if (!trabajo) {
    return (
      <View
        className="flex-1 bg-fondo items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <MaterialIcons name="error-outline" size={44} color={Paleta.error} />
        <Text className="text-principal text-lg font-nunito-bold text-center mt-4 mb-2">
          No pudimos abrir el trabajo
        </Text>
        <Text className="text-neutro text-sm font-nunito text-center mb-7">{error}</Text>
        <Pressable
          onPress={() => router.replace('/(tabs)/ofrecer' as any)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Volver</Text>
        </Pressable>
      </View>
    );
  }

  // ----- Trabajo confirmado por las dos partes -----
  if (trabajo.estado === 'completado') {
    return (
      <View
        className="flex-1 bg-fondo items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-24 h-24 rounded-full bg-exito items-center justify-center mb-6">
          <MaterialIcons name="check" size={56} color="#ffffff" />
        </View>
        <Text className="text-principal text-2xl font-nunito-bold text-center mb-2">
          ¡Trabajo finalizado!
        </Text>
        <Text className="text-neutro text-sm font-nunito text-center leading-5 mb-8">
          Confirmaron los dos. Se liberó el pago de ${trabajo.precio} al trabajador.
        </Text>
        <Pressable
          onPress={() => router.replace('/(tabs)/ofrecer' as any)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  const enProgreso = trabajo.estado === 'en_progreso';
  const solicitudVencida =
    trabajo.estado === 'pendiente' &&
    !!trabajo.solicitud_expira_en &&
    new Date(trabajo.solicitud_expira_en).getTime() < Date.now();

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top }}>
      {/* Mapa con el lugar del trabajo */}
      <View style={{ height: 260 }}>
        {lugar ? <MapaSeguimiento empleador={lugar} trabajador={null} /> : null}

        <Pressable
          onPress={() => router.replace('/(tabs)/ofrecer' as any)}
          className="absolute top-3 left-4 w-10 h-10 rounded-full bg-white items-center justify-center border border-neutro active:opacity-70">
          <MaterialIcons name="arrow-back" size={22} color={Paleta.principal} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Estado */}
        <View className="flex-row items-center gap-2 mb-4">
          <View className={`w-2.5 h-2.5 rounded-full ${solicitudVencida ? 'bg-error' : trabajo.estado === 'pendiente' ? 'bg-neutro' : 'bg-exito'}`} />
          <Text className="text-neutro text-xs font-nunito-semi uppercase tracking-wider">
            {solicitudVencida
              ? 'Ningún trabajador lo tomó a tiempo'
              : trabajo.estado === 'pendiente'
              ? 'Esperando que un trabajador lo tome'
              : enProgreso
              ? 'Trabajo en curso'
              : 'El trabajador va en camino'}
          </Text>
        </View>

        <Text className="text-principal text-2xl font-nunito-bold mb-1">{trabajo.titulo}</Text>
        <Text className="text-neutro text-sm font-nunito mb-5">{trabajo.descripcion}</Text>

        {solicitudVencida ? (
          <View className="flex-row items-center bg-fondo-suave border border-neutro rounded-xl px-4 py-3 mb-5">
            <MaterialIcons name="timer-off" size={18} color={Paleta.neutro} />
            <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
              La solicitud expiró sin que nadie la acepte. Podés publicar el trabajo de nuevo.
            </Text>
          </View>
        ) : null}

        {/* PIN de verificación */}
        {!enProgreso && !solicitudVencida ? (
          <View className="bg-white border border-neutro rounded-xl p-4 mb-5">
            <Text className="text-neutro text-xs font-nunito mb-1">
              Código PIN — dictáselo al trabajador cuando llegue
            </Text>

            {pinDelTrabajo ? (
              <>
                <Text className="text-principal text-3xl font-nunito-bold tracking-[6px] mb-4">
                  {pinDelTrabajo}
                </Text>

                {pinVerificado ? (
                  <View className="flex-row items-center">
                    <MaterialIcons name="check-circle" size={20} color={Paleta.exito} />
                    <Text className="text-principal text-sm font-nunito-semi ml-2">
                      Código verificado. El trabajador puede arrancar.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="text-neutro text-xs font-nunito mb-2 leading-4">
                      Si querés chequear que te lo repita bien, ingresalo acá.
                    </Text>
                    <TextInput
                      className="bg-fondo-suave rounded-[10px] px-4 py-3 mb-2 text-lg font-nunito-bold text-principal border border-neutro text-center tracking-[6px]"
                      placeholder="000000"
                      placeholderTextColor={Paleta.neutro}
                      value={pinIngresado}
                      onChangeText={v => { setPinIngresado(v.replace(/\D/g, '').slice(0, 6)); setErrorPin(''); }}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    {errorPin ? (
                      <Text className="text-error text-[13px] font-nunito text-center mb-2">{errorPin}</Text>
                    ) : null}
                    <Pressable
                      onPress={verificarPin}
                      className="bg-white rounded-xl py-3 items-center border-[1.5px] border-principal active:opacity-70">
                      <Text className="text-principal text-sm font-nunito-bold">Verificar código</Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : (
              <Text className="text-neutro text-sm font-nunito leading-5">
                El PIN solo se puede ver en el celular desde el que publicaste el trabajo.
              </Text>
            )}
          </View>
        ) : null}

        {/* Evidencia + confirmación */}
        {enProgreso ? (
          <>
            <Text className="text-principal text-base font-nunito-bold mb-1">Foto del trabajo terminado</Text>
            <Text className="text-neutro text-sm font-nunito mb-3 leading-5">
              Es la evidencia que sube el trabajador al marcar el trabajo como finalizado.
            </Text>

            <View className="bg-white border border-neutro rounded-xl overflow-hidden mb-5">
              <View className="h-32 items-center justify-center">
                <MaterialIcons name="hourglass-empty" size={28} color={Paleta.neutro} />
                <Text className="text-neutro text-sm font-nunito mt-2">
                  Esperando la foto del trabajador
                </Text>
              </View>
            </View>

            {error ? (
              <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text>
            ) : null}

            {confirmandoFin ? (
              <View className="bg-white border border-neutro rounded-xl p-4">
                <Text className="text-principal text-base font-nunito-bold mb-1">
                  ¿Confirmás que el trabajo está terminado?
                </Text>
                <Text className="text-neutro text-sm font-nunito mb-4 leading-5">
                  Al confirmar se libera el pago de ${trabajo.precio} al trabajador. No se puede deshacer.
                </Text>

                <Pressable
                  onPress={handleConfirmarFin}
                  disabled={confirmando}
                  className="bg-principal rounded-xl py-4 items-center active:opacity-90 mb-2.5">
                  <Text className="text-white text-base font-nunito-bold">
                    {confirmando ? 'Confirmando…' : 'Sí, confirmar y pagar'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setConfirmandoFin(false)}
                  disabled={confirmando}
                  className="bg-white rounded-xl py-4 items-center border-[1.5px] border-principal active:opacity-70">
                  <Text className="text-principal text-base font-nunito-bold">Volver</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setError(''); setConfirmandoFin(true); }}
                className="bg-principal rounded-xl py-4 items-center active:opacity-90">
                <Text className="text-white text-base font-nunito-bold">Marcar como finalizado</Text>
              </Pressable>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
