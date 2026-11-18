import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import SelectorMotivo from '../components/selector-motivo';
import {
  ESTADO_DISPUTA_LABEL,
  misDisputas,
  obtenerMotivosDisputa,
  reportarProblema,
  type Disputa,
  type MotivoDisputa,
} from '../lib/disputas';
import { Paleta } from '@/constants/theme';

// Sprint 6 — reportar un problema con un trabajo (disputa): motivo, descripción y una
// foto opcional. Va al panel de admin del backend. Si ya hay un reporte abierto de este
// usuario para este trabajo, se muestra su estado en vez del formulario.
// Mismo archivo en las dos apps.

const MIN_DESCRIPCION = 10;
const MAX_DESCRIPCION = 1000;

export default function ReportarProblemaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [motivos, setMotivos] = useState<MotivoDisputa[] | null>(null);
  const [previas, setPrevias] = useState<Disputa[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviada, setEnviada] = useState<Disputa | null>(null);

  useEffect(() => {
    if (!trabajoId) return;
    obtenerMotivosDisputa().then(setMotivos).catch(e => setError(e?.message ?? 'No pudimos cargar los motivos.'));
    misDisputas(trabajoId).then(setPrevias).catch(() => setPrevias([]));
  }, [trabajoId]);

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  }

  async function elegirFoto(desdeCamara: boolean) {
    setError('');
    if (desdeCamara) {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) { setError('Necesitamos permiso para usar la cámara. Probá con la galería.'); return; }
    }
    const opciones = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.6 };
    const r = desdeCamara ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
    if (!r.canceled) setFoto(r.assets[0].uri);
  }

  async function enviar() {
    setError('');
    if (!motivo) { setError('Elegí qué tipo de problema tuviste.'); return; }
    const texto = descripcion.trim();
    if (texto.length < MIN_DESCRIPCION) { setError(`Contanos qué pasó (al menos ${MIN_DESCRIPCION} caracteres).`); return; }

    setEnviando(true);
    try {
      setEnviada(await reportarProblema(trabajoId!, { motivo, descripcion: texto, fotoUri: foto }));
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos mandar el reporte.');
    } finally {
      setEnviando(false);
    }
  }

  const abierta = enviada ?? previas?.find(d => d.estado === 'abierta' || d.estado === 'en_revision') ?? null;

  return (
    <ScrollView
      className="flex-1 bg-fondo"
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled">
      <Pressable onPress={volver} className="flex-row items-center mb-4 active:opacity-70">
        <MaterialIcons name="arrow-back" size={22} color={Paleta.principal} />
        <Text className="text-principal text-sm font-nunito-semi ml-1">Volver</Text>
      </Pressable>

      <Text className="text-principal text-2xl font-nunito-bold mb-1">Reportar un problema</Text>
      <Text className="text-neutro text-sm font-nunito mb-5 leading-5">
        Nuestro equipo revisa cada reporte y te avisa cuando lo resuelve.
      </Text>

      {previas === null ? (
        <ActivityIndicator color={Paleta.principal} />
      ) : abierta ? (
        <View className="bg-white border border-neutro rounded-xl p-4">
          <MaterialIcons name="support-agent" size={30} color={Paleta.principal} />
          <Text className="text-principal text-base font-nunito-bold mt-2">
            {enviada ? '¡Reporte enviado!' : 'Ya tenés un reporte abierto'}
          </Text>
          <Text className="text-neutro text-sm font-nunito mt-1">{abierta.motivoTexto}</Text>
          <Text className="text-principal text-sm font-nunito mt-2">{abierta.descripcion}</Text>
          <Text className="text-neutro text-xs font-nunito-semi mt-3 uppercase">{ESTADO_DISPUTA_LABEL[abierta.estado]}</Text>
          <Pressable onPress={volver} className="bg-principal rounded-xl py-3.5 items-center mt-4 active:opacity-90">
            <Text className="text-white text-base font-nunito-bold">Listo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Reportes ya cerrados de este trabajo, con su resolución */}
          {previas.map(d => (
            <View key={d.id} className="bg-fondo-suave border border-neutro rounded-xl p-3 mb-3">
              <Text className="text-principal text-sm font-nunito-semi">{d.motivoTexto} · {ESTADO_DISPUTA_LABEL[d.estado]}</Text>
              {d.resolucion ? <Text className="text-neutro text-xs font-nunito mt-1">{d.resolucion}</Text> : null}
            </View>
          ))}

          <Text className="text-principal text-sm font-nunito-bold mb-2">¿Qué pasó?</Text>
          <SelectorMotivo
            motivos={motivos}
            valor={motivo}
            onCambiar={setMotivo}
            detalle=""
            onDetalle={() => {}}
          />

          <Text className="text-principal text-sm font-nunito-bold mb-2">Contanos el detalle</Text>
          <TextInput
            className="bg-white border border-neutro rounded-[10px] px-4 py-3 mb-1 text-[15px] font-nunito text-principal h-32"
            style={{ textAlignVertical: 'top' }}
            placeholder="Qué pasó, cuándo, y qué esperás que hagamos"
            placeholderTextColor={Paleta.neutro}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            maxLength={MAX_DESCRIPCION}
          />
          <Text className="text-neutro text-xs font-nunito text-right mb-4">{descripcion.trim().length}/{MAX_DESCRIPCION}</Text>

          <Text className="text-principal text-sm font-nunito-bold mb-2">Foto (opcional)</Text>
          {foto ? (
            <View className="mb-3">
              <Image source={{ uri: foto }} style={{ width: '100%', height: 200, borderRadius: 12 }} resizeMode="cover" />
              <Pressable onPress={() => setFoto(null)} className="py-2 items-center active:opacity-70">
                <Text className="text-error text-sm font-nunito-semi underline">Quitar foto</Text>
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => elegirFoto(true)}
              className="flex-1 flex-row items-center justify-center bg-white border-[1.5px] border-principal rounded-xl py-3 active:opacity-70">
              <MaterialIcons name="photo-camera" size={18} color={Paleta.principal} />
              <Text className="text-principal text-sm font-nunito-bold ml-1.5">Cámara</Text>
            </Pressable>
            <Pressable
              onPress={() => elegirFoto(false)}
              className="flex-1 flex-row items-center justify-center bg-white border-[1.5px] border-principal rounded-xl py-3 active:opacity-70">
              <MaterialIcons name="photo-library" size={18} color={Paleta.principal} />
              <Text className="text-principal text-sm font-nunito-bold ml-1.5">Galería</Text>
            </Pressable>
          </View>

          {error ? <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text> : null}

          <Pressable
            onPress={enviar}
            disabled={enviando}
            className="bg-principal rounded-xl py-4 items-center active:opacity-90">
            {enviando ? <ActivityIndicator color={Paleta.blanco} /> : (
              <Text className="text-white text-base font-nunito-bold">Enviar reporte</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
