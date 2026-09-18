import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { getUsuario } from '../auth';
import { seguirUbicacion, distanciaKm, formatearDistancia, type Coordenadas } from '../lib/ubicacion';
import {
  obtenerTrabajo,
  validarPin,
  completarTrabajo,
  formatearDuracion,
  type Trabajo,
} from '../lib/trabajos';
import { subirEvidencia } from '../lib/evidencia';
import { Paleta } from '@/constants/theme';

// Pantalla de trabajo en curso. Cubre los tres momentos del trabajo aceptado:
//   1. `asignado`    → mostrar dónde es y pedir el PIN que dicta el empleador
//   2. `en_progreso` → sacar/subir la foto de evidencia y marcar como finalizado
//   3. `completado`  → confirmación
//
// Mientras la pantalla está viva, la ubicación del trabajador se manda al backend
// cada 10 segundos, asociada a este trabajo.
export default function TrabajoEnCursoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');

  const [pin, setPin] = useState('');
  const [validando, setValidando] = useState(false);
  const [errorPin, setErrorPin] = useState('');

  const [foto, setFoto] = useState<string | null>(null);
  const [fotoSubida, setFotoSubida] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [confirmandoFin, setConfirmandoFin] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  /** Ya confirmé la finalización, pero el empleador todavía no. */
  const [esperandoOtraParte, setEsperandoOtraParte] = useState(false);

  const [ultimaPos, setUltimaPos] = useState<Coordenadas | null>(null);

  const finalizado = trabajo?.estado === 'completado';

  // ----- Traer el trabajo -----
  // Se vuelve a consultar cada 10 segundos: el empleador también puede darlo por terminado.
  const completadoRef = useRef(false);

  useEffect(() => {
    if (!trabajoId) { setErrorCarga('No se recibió el trabajo.'); setCargando(false); return; }

    let activo = true;

    async function refrescar() {
      try {
        const { trabajo: t } = await obtenerTrabajo(trabajoId!);
        if (!activo) return;
        setTrabajo(t);
        completadoRef.current = t.estado === 'completado';
        setErrorCarga('');
      } catch (e: any) {
        if (activo) setErrorCarga(e?.message ?? 'No pudimos cargar el trabajo.');
      } finally {
        if (activo) setCargando(false);
      }
    }

    refrescar();
    const reloj = setInterval(() => {
      if (!completadoRef.current) refrescar();
    }, 10000);

    return () => { activo = false; clearInterval(reloj); };
  }, [trabajoId]);

  // ----- Ubicación en tiempo real -----
  // Arranca apenas se acepta el trabajo y se corta al finalizar o al salir de la pantalla.
  useEffect(() => {
    if (!trabajoId || finalizado) return;

    let cortar: (() => void) | null = null;
    let activo = true;

    getUsuario().then(u => {
      if (!u || !activo) return;
      // Si falla el envío (red, backend caído) se loguea y no rompe la pantalla.
      cortar = seguirUbicacion(u.id, setUltimaPos, trabajoId);
    });

    return () => { activo = false; cortar?.(); };
  }, [trabajoId, finalizado]);

  // ----- PIN -----
  async function handleValidarPin() {
    setErrorPin('');
    if (pin.length !== 6) { setErrorPin('El PIN tiene 6 dígitos.'); return; }

    setValidando(true);
    try {
      await validarPin(trabajoId!, pin);
      setTrabajo(t => (t ? { ...t, estado: 'en_progreso' } : t));
    } catch (e: any) {
      setErrorPin(e?.message ?? 'No pudimos validar el PIN.');
    } finally {
      setValidando(false);
    }
  }

  // ----- Foto de evidencia -----
  function usarFoto(uri: string) {
    setError('');
    setFoto(uri);
    setFotoSubida(false);
  }

  async function sacarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      setError('Necesitamos permiso para usar la cámara. También podés elegir la foto de la galería.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) usarFoto(r.assets[0].uri);
  }

  async function elegirDeGaleria() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) usarFoto(r.assets[0].uri);
  }

  // ----- Finalizar -----
  async function handleFinalizar() {
    setError('');
    if (!foto) { setError('Subí una foto del trabajo terminado antes de finalizar.'); return; }

    setFinalizando(true);
    try {
      // La foto se sube recién acá, para no dejar evidencia de trabajos que no se cerraron.
      // Si ya se subió en un intento anterior (y lo que falló fue completar), no se repite.
      if (!fotoSubida) {
        setSubiendoFoto(true);
        const u = await getUsuario();
        await subirEvidencia(trabajoId!, u?.id ?? '', foto);
        setFotoSubida(true);
        setSubiendoFoto(false);
      }

      // El backend cierra el trabajo sólo cuando confirmaron las dos partes. Si todavía
      // falta el empleador, el trabajo sigue 'en_progreso' y hay que decirlo, no dar por
      // terminado algo que no terminó.
      const resultado = await completarTrabajo(trabajoId!);
      if (resultado.estado === 'completado') {
        setTrabajo(t => (t ? { ...t, estado: 'completado', duracionSegundos: resultado.duracionSegundos ?? null } : t));
        completadoRef.current = true;
        setEsperandoOtraParte(false);
      } else {
        setEsperandoOtraParte(true);
      }
      setConfirmandoFin(false);
    } catch (e: any) {
      setSubiendoFoto(false);
      setError(e?.message ?? 'No pudimos finalizar el trabajo.');
    } finally {
      setFinalizando(false);
    }
  }

  function abrirChat() {
    router.push({ pathname: '/chat', params: { trabajoId } } as any);
  }

  // ----- Estados de carga / error -----
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
        <Text className="text-neutro text-sm font-nunito text-center mb-7">{errorCarga}</Text>
        <Pressable
          onPress={() => router.replace('/buscar' as any)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Volver</Text>
        </Pressable>
      </View>
    );
  }

  // ----- Trabajo terminado -----
  if (finalizado) {
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
        <Text className="text-neutro text-sm font-nunito text-center leading-5">
          El trabajo quedó completado y le avisamos al empleador. Se libera el pago de ${trabajo.precio}.
        </Text>
        {trabajo.duracionSegundos ? (
          <Text className="text-neutro text-sm font-nunito text-center mt-1">
            Duración: {formatearDuracion(trabajo.duracionSegundos)}
          </Text>
        ) : null}
        <Pressable
          onPress={() => router.replace('/buscar' as any)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90 mt-8">
          <Text className="text-white text-base font-nunito-bold">Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  const esperandoPin = trabajo.estado === 'asignado';
  const lugar = { lat: trabajo.latitud, lng: trabajo.longitud };

  return (
    <ScrollView
      className="flex-1 bg-fondo"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 32,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {/* Estado */}
      <View className="flex-row items-center gap-2 mb-5">
        <View className="w-2.5 h-2.5 rounded-full bg-exito" />
        <Text className="text-neutro text-xs font-nunito-semi uppercase tracking-wider">
          {esperandoPin ? 'En camino' : 'Trabajo en curso'}
        </Text>
      </View>

      <Text className="text-principal text-2xl font-nunito-bold mb-1">{trabajo.titulo}</Text>
      <Text className="text-neutro text-sm font-nunito mb-5">{trabajo.descripcion}</Text>

      {/* Lugar del trabajo */}
      <View className="bg-white border border-neutro rounded-xl p-4 mb-3">
        <View className="flex-row items-start">
          <MaterialIcons name="place" size={20} color={Paleta.principal} />
          <View className="flex-1 ml-2.5">
            <Text className="text-neutro text-xs font-nunito mb-0.5">Lugar del trabajo</Text>
            <Text className="text-principal text-base font-nunito-semi">
              {ultimaPos
                ? `A ${formatearDistancia(distanciaKm(ultimaPos, lugar))} de donde estás`
                : 'La ubicación que marcó el empleador'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lugar.lat},${lugar.lng}`)
          }
          className="flex-row items-center justify-center mt-3 py-2.5 rounded-lg border border-principal active:opacity-70">
          <MaterialIcons name="directions" size={18} color={Paleta.principal} />
          <Text className="text-principal text-sm font-nunito-bold ml-1.5">Cómo llegar</Text>
        </Pressable>
      </View>

      {/* Aviso de ubicación compartida */}
      <View className="flex-row items-center bg-fondo-suave border border-neutro rounded-xl px-4 py-3 mb-3">
        <MaterialIcons name="my-location" size={18} color={Paleta.principal} />
        <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
          {ultimaPos
            ? 'Estás compartiendo tu ubicación mientras dure el trabajo.'
            : 'Activando el envío de tu ubicación…'}
        </Text>
      </View>

      {/* Chat con el empleador */}
      <Pressable
        onPress={abrirChat}
        className="flex-row items-center justify-center bg-white border-[1.5px] border-principal rounded-xl py-3 mb-6 active:opacity-70">
        <MaterialIcons name="chat-bubble-outline" size={18} color={Paleta.principal} />
        <Text className="text-principal text-sm font-nunito-bold ml-2">Chat con el empleador</Text>
      </Pressable>

      {esperandoPin ? (
        <>
          {/* PIN de verificación */}
          <Text className="text-principal text-base font-nunito-bold mb-1">Código PIN de verificación</Text>
          <Text className="text-neutro text-sm font-nunito mb-3 leading-5">
            Cuando llegues, pedile al empleador el código de 6 dígitos e ingresalo acá para
            arrancar el trabajo.
          </Text>

          <TextInput
            className="bg-white rounded-[10px] px-4 py-4 mb-2 text-2xl font-nunito-bold text-principal border border-neutro text-center tracking-[8px]"
            placeholder="000000"
            placeholderTextColor={Paleta.neutro}
            value={pin}
            onChangeText={v => { setPin(v.replace(/\D/g, '').slice(0, 6)); setErrorPin(''); }}
            keyboardType="number-pad"
            maxLength={6}
          />

          {errorPin ? (
            <Text className="text-error text-[13px] font-nunito text-center mb-2">{errorPin}</Text>
          ) : null}

          <Pressable
            onPress={handleValidarPin}
            disabled={validando}
            className="bg-principal rounded-xl py-4 items-center mt-2 active:opacity-90">
            <Text className="text-white text-base font-nunito-bold">
              {validando ? 'Validando…' : 'Validar PIN e iniciar'}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {/* Foto de evidencia */}
          <Text className="text-principal text-base font-nunito-bold mb-1">Foto del trabajo terminado</Text>
          <Text className="text-neutro text-sm font-nunito mb-3 leading-5">
            Sacá una foto como evidencia de que terminaste. El empleador la ve en el detalle del trabajo.
          </Text>

          <View className="bg-white border border-neutro rounded-xl overflow-hidden mb-3">
            {foto ? (
              <Image source={{ uri: foto }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
            ) : (
              <View className="h-40 items-center justify-center">
                <MaterialIcons name="add-a-photo" size={34} color={Paleta.neutro} />
                <Text className="text-neutro text-sm font-nunito mt-2">Todavía no elegiste la foto</Text>
              </View>
            )}
          </View>

          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={sacarFoto}
              disabled={finalizando}
              className="flex-1 flex-row items-center justify-center bg-white border-[1.5px] border-principal rounded-xl py-3 active:opacity-70">
              <MaterialIcons name="photo-camera" size={18} color={Paleta.principal} />
              <Text className="text-principal text-sm font-nunito-bold ml-1.5">
                {foto ? 'Sacar otra' : 'Sacar foto'}
              </Text>
            </Pressable>
            <Pressable
              onPress={elegirDeGaleria}
              disabled={finalizando}
              className="flex-1 flex-row items-center justify-center bg-white border-[1.5px] border-principal rounded-xl py-3 active:opacity-70">
              <MaterialIcons name="photo-library" size={18} color={Paleta.principal} />
              <Text className="text-principal text-sm font-nunito-bold ml-1.5">Galería</Text>
            </Pressable>
          </View>

          {error ? (
            <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text>
          ) : null}

          {esperandoOtraParte ? (
            <View className="bg-fondo-suave border border-neutro rounded-xl p-4 items-center">
              <MaterialIcons name="hourglass-top" size={30} color={Paleta.principal} />
              <Text className="text-principal text-base font-nunito-bold text-center mt-2 mb-1">
                Esperando al empleador
              </Text>
              <Text className="text-neutro text-sm font-nunito text-center leading-5">
                Ya marcaste el trabajo como terminado. Cuando el empleador lo confirme, se cierra
                y se libera el pago de ${trabajo.precio}.
              </Text>
            </View>
          ) : confirmandoFin ? (
            <View className="bg-white border border-neutro rounded-xl p-4">
              <Text className="text-principal text-base font-nunito-bold mb-1">¿Terminaste el trabajo?</Text>
              <Text className="text-neutro text-sm font-nunito mb-4 leading-5">
                Se sube la foto como evidencia y queda esperando que el empleador confirme.
                Cuando confirme se cierra el trabajo y se libera el pago de ${trabajo.precio}.
              </Text>

              <Pressable
                onPress={handleFinalizar}
                disabled={finalizando}
                className="bg-principal rounded-xl py-4 items-center active:opacity-90 mb-2.5">
                <Text className="text-white text-base font-nunito-bold">
                  {subiendoFoto ? 'Subiendo la foto…' : finalizando ? 'Finalizando…' : 'Sí, finalizar'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmandoFin(false)}
                disabled={finalizando}
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
      )}
    </ScrollView>
  );
}
