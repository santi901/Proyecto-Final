import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getUsuario } from '../auth';
import { supabase } from '../supabaseClient';
import { seguirUbicacion, type Coordenadas } from '../lib/ubicacion';
import {
  obtenerTrabajo,
  validarPin,
  completarTrabajo,
  enviarPosicionDeTrabajo,
  type Trabajo,
} from '../lib/trabajo';
import { Paleta } from '@/constants/theme';

// Pantalla de trabajo en curso. Cubre los tres momentos del trabajo aceptado:
//   1. `asignado`    → mostrar la dirección y pedir el PIN que dicta el empleador
//   2. `en_progreso` → subir la foto de evidencia y marcar como finalizado
//   3. `completado`  → confirmación
//
// Mientras la pantalla está viva, la ubicación del trabajador se manda al backend
// para que el empleador lo vea moverse en su mapa.
export default function TrabajoEnCursoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [pin, setPin] = useState('');
  const [validando, setValidando] = useState(false);
  const [errorPin, setErrorPin] = useState('');

  const [foto, setFoto] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const [confirmandoFin, setConfirmandoFin] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  const [ultimaPos, setUltimaPos] = useState<Coordenadas | null>(null);

  // ----- Traer el trabajo -----
  useEffect(() => {
    let activo = true;
    if (!trabajoId) { setError('No se recibió el trabajo.'); setCargando(false); return; }

    obtenerTrabajo(trabajoId)
      .then(t => {
        if (!activo) return;
        setTrabajo(t);
        if (t.estado === 'completado') setFinalizado(true);
      })
      .catch(e => activo && setError(e?.message ?? 'No pudimos cargar el trabajo.'))
      .finally(() => activo && setCargando(false));

    return () => { activo = false; };
  }, [trabajoId]);

  // ----- Ubicación en tiempo real hacia el empleador -----
  // Arranca apenas se acepta el trabajo y se corta al finalizar o al salir de la pantalla.
  const usuarioIdRef = useRef('');

  useEffect(() => {
    if (!trabajoId || finalizado) return;

    let cortar: (() => void) | null = null;
    let activo = true;

    (async () => {
      const u = await getUsuario();
      if (!u || !activo) return;
      usuarioIdRef.current = u.id;

      cortar = await seguirUbicacion(coords => {
        setUltimaPos(coords);
        // Fire and forget: si el endpoint de Ignacio todavía no existe, no rompe la pantalla.
        enviarPosicionDeTrabajo(trabajoId, u.id, coords).catch(e =>
          console.log('No se pudo enviar la posición:', e?.message),
        );
      });
    })();

    return () => { activo = false; cortar?.(); };
  }, [trabajoId, finalizado]);

  // ----- PIN -----
  async function handleValidarPin() {
    setErrorPin('');
    if (pin.length !== 6) { setErrorPin('El PIN tiene 6 dígitos.'); return; }

    setValidando(true);
    const r = await validarPin(trabajoId!, pin);
    setValidando(false);

    if (!r.ok) { setErrorPin(r.mensaje); return; }
    setTrabajo(t => (t ? { ...t, estado: 'en_progreso' } : t));
  }

  // ----- Foto de evidencia -----
  async function elegirFoto() {
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    // Si no hay cámara disponible (emulador), se cae a la galería.
    const resultado = r.canceled
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 })
      : r;

    if (resultado.canceled) return;
    setFoto(resultado.assets[0].uri);
    setFotoUrl(null);
  }

  async function subirEvidencia(uri: string) {
    const ext = uri.split('.').pop() ?? 'jpg';
    const nombre = `trabajo-${trabajoId}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const blob = await fetch(`data:image/${ext};base64,${base64}`).then(r => r.blob());

    const { error: errorSubida } = await supabase.storage
      .from('evidencias')
      .upload(nombre, blob, { upsert: true, contentType: `image/${ext}` });

    if (errorSubida) throw errorSubida;

    const { data } = supabase.storage.from('evidencias').getPublicUrl(nombre);
    return data.publicUrl;
  }

  // ----- Finalizar -----
  async function handleFinalizar() {
    setError('');
    if (!foto) { setError('Subí una foto del trabajo terminado antes de finalizar.'); return; }

    setFinalizando(true);
    try {
      // La foto se sube recién acá para no dejar evidencia de trabajos que no se cerraron.
      if (!fotoUrl) {
        setSubiendoFoto(true);
        const url = await subirEvidencia(foto);
        setFotoUrl(url);
        setSubiendoFoto(false);
      }

      await completarTrabajo(trabajoId!);
      setFinalizado(true);
      setConfirmandoFin(false);
    } catch (e: any) {
      setSubiendoFoto(false);
      setError(e?.message ?? 'No pudimos finalizar el trabajo.');
    } finally {
      setFinalizando(false);
    }
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
        <Text className="text-neutro text-sm font-nunito text-center mb-7">{error}</Text>
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
        <Text className="text-neutro text-sm font-nunito text-center leading-5 mb-8">
          Le avisamos al empleador para que lo confirme de su lado. En cuanto lo confirme
          se libera el pago de ${trabajo.precio}.
        </Text>
        <Pressable
          onPress={() => router.replace('/buscar' as any)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  const esperandoPin = trabajo.estado === 'asignado';

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

      {/* Dirección */}
      <View className="bg-white border border-neutro rounded-xl p-4 mb-3">
        <View className="flex-row items-start">
          <MaterialIcons name="place" size={20} color={Paleta.principal} />
          <View className="flex-1 ml-2.5">
            <Text className="text-neutro text-xs font-nunito mb-0.5">Dirección del trabajo</Text>
            <Text className="text-principal text-base font-nunito-semi">
              {trabajo.direccion || 'El empleador todavía no cargó la dirección'}
            </Text>
          </View>
        </View>
      </View>

      {/* Aviso de ubicación compartida */}
      <View className="flex-row items-center bg-fondo-suave border border-neutro rounded-xl px-4 py-3 mb-5">
        <MaterialIcons name="my-location" size={18} color={Paleta.principal} />
        <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
          {ultimaPos
            ? 'El empleador está viendo tu ubicación en tiempo real.'
            : 'Activando el envío de tu ubicación al empleador…'}
        </Text>
      </View>

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
            Sacá una foto como evidencia de que terminaste. El empleador la ve antes de confirmar.
          </Text>

          <Pressable
            onPress={elegirFoto}
            className="bg-white border border-neutro rounded-xl overflow-hidden mb-5 active:opacity-70">
            {foto ? (
              <Image source={{ uri: foto }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
            ) : (
              <View className="h-40 items-center justify-center">
                <MaterialIcons name="add-a-photo" size={34} color={Paleta.neutro} />
                <Text className="text-neutro text-sm font-nunito mt-2">Tocá para sacar la foto</Text>
              </View>
            )}
          </Pressable>

          {error ? (
            <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text>
          ) : null}

          {confirmandoFin ? (
            <View className="bg-white border border-neutro rounded-xl p-4">
              <Text className="text-principal text-base font-nunito-bold mb-1">¿Terminaste el trabajo?</Text>
              <Text className="text-neutro text-sm font-nunito mb-4 leading-5">
                Se le manda la foto al empleador y queda pendiente de su confirmación. Una vez
                que confirma, se libera el pago de ${trabajo.precio}.
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
