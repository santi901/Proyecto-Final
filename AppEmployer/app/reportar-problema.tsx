import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import CampoTexto from '../components/campo-texto';
import VistaFormulario from '../components/vista-formulario';
import {
  MOTIVOS_DISPUTA,
  reintentarReportesPendientes,
  reportarProblema,
  reportesDelTrabajo,
  type MotivoDisputa,
  type ReporteGuardado,
} from '../lib/disputas';
import { formatearFecha } from '../lib/historial';
import { Paleta, sombra } from '@/constants/theme';

// Sistema de disputas (Sprint 6): formulario de "Reportar problema" sobre un trabajo,
// con motivo, descripción y una foto opcional. Misma pantalla en las dos apps.
export default function ReportarProblemaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId, titulo } = useLocalSearchParams<{ trabajoId: string; titulo?: string }>();

  const [motivo, setMotivo] = useState<MotivoDisputa | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<'enviado' | 'guardado' | null>(null);
  const [anteriores, setAnteriores] = useState<ReporteGuardado[]>([]);

  useEffect(() => {
    if (!trabajoId) return;
    reintentarReportesPendientes().finally(() => reportesDelTrabajo(trabajoId).then(setAnteriores));
  }, [trabajoId, resultado]);

  async function sacarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      setError('Necesitamos permiso para usar la cámara. También podés elegir una foto de la galería.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) { setFoto(r.assets[0].uri); setError(''); }
  }

  async function elegirDeGaleria() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!r.canceled) { setFoto(r.assets[0].uri); setError(''); }
  }

  async function handleEnviar() {
    setError('');
    if (!trabajoId) { setError('No se recibió el trabajo.'); return; }
    if (!motivo) { setError('Elegí el motivo del reporte.'); return; }
    if (descripcion.trim().length < 10) { setError('Contanos un poco más qué pasó (mínimo 10 caracteres).'); return; }

    setEnviando(true);
    try {
      const { enviado } = await reportarProblema({
        trabajoId,
        motivo,
        descripcion: descripcion.trim(),
        fotoUri: foto,
      });
      setResultado(enviado ? 'enviado' : 'guardado');
      setMotivo(null);
      setDescripcion('');
      setFoto(null);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos enviar el reporte.');
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <View className="flex-1 bg-fondo">
        <Encabezado titulo="Reportar problema" />
        <View className="flex-1 items-center justify-center px-8" style={{ paddingBottom: insets.bottom + 40 }}>
          <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-5">
            <MaterialIcons name={resultado === 'enviado' ? 'check' : 'schedule-send'} size={40} color={Paleta.principal} />
          </View>
          <Text className="text-principal text-xl font-nunito-bold text-center mb-2">
            {resultado === 'enviado' ? 'Recibimos tu reporte' : 'Guardamos tu reporte'}
          </Text>
          <Text className="text-neutro text-sm font-nunito text-center leading-5 mb-7">
            {resultado === 'enviado'
              ? 'El equipo de ChanguitApp lo va a revisar y te va a contactar. Si hay un pago en juego, queda retenido hasta resolverlo.'
              : 'Todavía no lo pudimos mandar al servidor. Queda guardado en tu teléfono y lo enviamos solo apenas se pueda.'}
          </Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as any))}
            className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
            <Text className="text-acento text-base font-nunito-bold">Volver al trabajo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Reportar problema" subtitulo={titulo ? `Trabajo: ${titulo}` : undefined} />

      <VistaFormulario
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32 }}>
        <Text className="text-[13px] font-nunito-semi text-principal mb-2">¿Qué pasó?</Text>
        <View style={sombra(Paleta.neutro)} className="bg-white rounded-xl mb-5 overflow-hidden">
          {MOTIVOS_DISPUTA.map((m, i) => {
            const sel = motivo === m;
            return (
              <Pressable
                key={m}
                onPress={() => { setMotivo(m); setError(''); }}
                className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${i > 0 ? 'border-t border-neutro/30' : ''} ${
                  sel ? 'bg-acento' : 'bg-white'
                }`}>
                <MaterialIcons
                  name={sel ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={Paleta.principal}
                />
                <Text className={`flex-1 ml-3 text-sm text-principal ${sel ? 'font-nunito-bold' : 'font-nunito'}`}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Contanos el detalle:</Text>
        <CampoTexto
          className="h-28"
          style={sombra(Paleta.neutro)}
          value={descripcion}
          onChangeText={t => setDescripcion(t.slice(0, 1000))}
          placeholder="Qué pasó, cuándo y cómo te gustaría que lo resolvamos"
          multiline
        />
        <Text className="text-[11px] font-nunito text-neutro text-right mt-1 mb-4">{descripcion.length}/1000</Text>

        <Text className="text-[13px] font-nunito-semi text-principal mb-2">Foto (opcional):</Text>
        {foto ? (
          <View className="mb-5">
            <Image source={{ uri: foto }} style={{ width: '100%', height: 200, borderRadius: 12 }} resizeMode="cover" />
            <Pressable onPress={() => setFoto(null)} className="flex-row items-center justify-center mt-2 py-2 active:opacity-70">
              <MaterialIcons name="delete-outline" size={18} color={Paleta.error} />
              <Text className="text-error text-sm font-nunito-semi ml-1">Quitar foto</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={sacarFoto}
              style={sombra(Paleta.neutro)}
              className="flex-1 bg-white rounded-xl py-4 items-center active:opacity-70">
              <MaterialIcons name="photo-camera" size={24} color={Paleta.principal} />
              <Text className="text-principal text-[13px] font-nunito-semi mt-1">Sacar foto</Text>
            </Pressable>
            <Pressable
              onPress={elegirDeGaleria}
              style={sombra(Paleta.neutro)}
              className="flex-1 bg-white rounded-xl py-4 items-center active:opacity-70">
              <MaterialIcons name="photo-library" size={24} color={Paleta.principal} />
              <Text className="text-principal text-[13px] font-nunito-semi mt-1">Galería</Text>
            </Pressable>
          </View>
        )}

        {error ? <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text> : null}

        <Pressable
          onPress={handleEnviar}
          disabled={enviando}
          className="bg-principal rounded-xl py-4 items-center active:opacity-90">
          {enviando ? (
            <ActivityIndicator color={Paleta.acento} />
          ) : (
            <Text className="text-acento text-base font-nunito-bold">Enviar reporte</Text>
          )}
        </Pressable>

        {anteriores.length > 0 ? (
          <View className="mt-7">
            <Text className="text-[13px] font-nunito-semi text-principal mb-2">Reportes anteriores de este trabajo</Text>
            {anteriores.map(r => (
              <View key={r.creadoEn} className="bg-white rounded-xl border border-neutro/50 p-3 mb-2">
                <View className="flex-row justify-between items-center">
                  <Text className="flex-1 text-[13px] font-nunito-bold text-principal pr-2">{r.motivo}</Text>
                  <Text className={`text-[11px] font-nunito-bold ${r.estado === 'enviado' ? 'text-exito' : 'text-neutro'}`}>
                    {r.estado === 'enviado' ? 'Enviado' : 'Pendiente de envío'}
                  </Text>
                </View>
                <Text className="text-[12px] font-nunito text-neutro mt-0.5">{formatearFecha(r.creadoEn)}</Text>
                <Text className="text-[13px] font-nunito text-principal mt-1" numberOfLines={3}>{r.descripcion}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </VistaFormulario>
    </View>
  );
}
