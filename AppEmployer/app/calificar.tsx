import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import VistaFormulario from '../components/vista-formulario';
import CalificacionEstrellas from '../components/calificacion-estrellas';
import { EstrellasLectura } from '../components/tarjeta-reputacion';
import {
  calificarTrabajo,
  marcarCalificadoLocal,
  obtenerTrabajo,
  yaCalificadoLocal,
  type Trabajo,
} from '../lib/trabajos';
import { formatearPuntaje } from '../lib/reputacion';
import { formatearMonto } from '../lib/historial';
import { Paleta, sombra } from '@/constants/theme';

// Pantalla de calificación (Sprint 5): se abre sola cuando el trabajo se cierra (lo
// confirmaron las dos partes) y también desde el seguimiento. 1 a 5 estrellas + comentario.
// El backend recalcula con esto la reputación del trabajador (el promedio que se ve en su perfil).

const TEXTO_PUNTAJE = ['', 'Muy malo', 'Malo', 'Bien', 'Muy bien', '¡Excelente!'];

export default function CalificarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  // Sin trabajoId no hay nada que cargar: el error se conoce desde el primer render.
  const [cargando, setCargando] = useState(!!trabajoId);
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState(trabajoId ? '' : 'No se recibió el trabajo.');

  useEffect(() => {
    if (!trabajoId) return;
    let activo = true;
    Promise.all([obtenerTrabajo(trabajoId), yaCalificadoLocal(trabajoId)])
      .then(([{ trabajo: t }, ya]) => {
        if (!activo) return;
        setTrabajo(t);
        setListo(ya);
      })
      .catch(e => activo && setError(e?.message ?? 'No pudimos cargar el trabajo.'))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [trabajoId]);

  function salir() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/ofrecer' as any);
  }

  async function handleEnviar() {
    setError('');
    if (puntaje < 1) { setError('Elegí de 1 a 5 estrellas.'); return; }
    setEnviando(true);
    try {
      await calificarTrabajo(trabajoId!, puntaje, comentario.trim() || undefined);
      await marcarCalificadoLocal(trabajoId!);
      setListo(true);
    } catch (e: any) {
      // 409: ya estaba calificado (desde otro dispositivo o antes de reinstalar).
      if (e?.status === 409) {
        await marcarCalificadoLocal(trabajoId!);
        setListo(true);
      } else {
        setError(e?.message ?? 'No pudimos enviar la calificación.');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <View className="flex-1 bg-fondo items-center justify-center">
        <ActivityIndicator size="large" color={Paleta.principal} />
      </View>
    );
  }

  const t = trabajo?.trabajador;
  const nombre = t ? `${t.nombre} ${t.apellido}`.trim() : 'el trabajador';

  if (listo) {
    return (
      <View className="flex-1 bg-fondo items-center justify-center px-8" style={{ paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-5">
          <MaterialIcons name="star" size={44} color={Paleta.principal} />
        </View>
        <Text className="text-principal text-2xl font-nunito-bold text-center mb-2">¡Gracias por calificar!</Text>
        <Text className="text-neutro text-sm font-nunito text-center leading-5 mb-8">
          Tu calificación suma al promedio de {nombre} y ayuda a otros empleadores a elegir.
        </Text>
        <Pressable onPress={salir} className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-acento text-base font-nunito-bold">Listo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Calificar" alternativa="/(tabs)/ofrecer" />
      <VistaFormulario
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 32 }}>
        {trabajo ? (
          <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4 mb-6 flex-row items-center">
            <View className="w-14 h-14 rounded-full bg-principal items-center justify-center mr-3">
              <Text className="text-acento text-xl font-nunito-bold">{(t?.nombre?.[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-principal text-base font-nunito-bold" numberOfLines={1}>{nombre}</Text>
              {t?.reputacion?.promedio != null ? (
                <View className="flex-row items-center mt-0.5">
                  <EstrellasLectura valor={t.reputacion.promedio} tamano={14} />
                  <Text className="text-neutro text-xs font-nunito ml-1">
                    {formatearPuntaje(t.reputacion.promedio)} ({t.reputacion.cantidadCalificaciones})
                  </Text>
                </View>
              ) : (
                <Text className="text-neutro text-xs font-nunito mt-0.5">Todavía sin calificaciones</Text>
              )}
              <Text className="text-neutro text-xs font-nunito mt-0.5" numberOfLines={1}>
                {trabajo.titulo} · {formatearMonto(trabajo.precio)}
              </Text>
            </View>
          </View>
        ) : null}

        <Text className="text-principal text-xl font-nunito-bold text-center mb-1">¿Cómo trabajó?</Text>
        <Text className="text-neutro text-sm font-nunito text-center mb-5">Tocá de 1 a 5 estrellas</Text>

        <CalificacionEstrellas valor={puntaje} onCambiar={v => { setPuntaje(v); setError(''); }} />
        <Text className="text-principal text-base font-nunito-semi text-center mt-2 mb-6 h-6">
          {TEXTO_PUNTAJE[puntaje]}
        </Text>

        <TextInput
          className="bg-white rounded-[10px] px-4 py-3 mb-1 text-[15px] font-nunito text-principal h-24"
          style={[{ textAlignVertical: 'top' }, sombra(Paleta.neutro)]}
          placeholder="Contá cómo fue (opcional)"
          placeholderTextColor={Paleta.neutro}
          value={comentario}
          onChangeText={setComentario}
          multiline
          maxLength={500}
        />
        <Text className="text-[11px] font-nunito text-neutro text-right mb-5">{comentario.length}/500</Text>

        {error ? <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text> : null}

        <Pressable
          onPress={handleEnviar}
          disabled={enviando || !trabajo}
          className={`rounded-xl py-4 items-center active:opacity-90 ${puntaje ? 'bg-principal' : 'bg-neutro'}`}>
          {enviando ? (
            <ActivityIndicator color={Paleta.acento} />
          ) : (
            <Text className="text-acento text-base font-nunito-bold">Enviar calificación</Text>
          )}
        </Pressable>

        <Pressable onPress={salir} className="py-4 items-center active:opacity-70">
          <Text className="text-neutro text-sm font-nunito-semi">Calificar más tarde</Text>
        </Pressable>
      </VistaFormulario>
    </View>
  );
}
