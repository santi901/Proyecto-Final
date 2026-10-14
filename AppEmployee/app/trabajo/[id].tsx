import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario } from '../../auth';
import {
  calificarTrabajo,
  enviarMensaje,
  listarEvidencia,
  listarMensajes,
  obtenerCalificacion,
  obtenerTrabajo,
  subirEvidencia,
  type Calificacion,
  type Evidencia,
  type Mensaje,
  type TrabajoDetalle,
} from '../../lib/trabajos';
import { alertaSimple } from '../../lib/alerta';

// Mismo detalle para las dos apps: lo que se muestra depende del tipo de usuario
// (el empleado sube la evidencia; el empleador la ve y califica). El backend
// vuelve a chequear todo esto, la UI solo esconde lo que no corresponde.

const ESTADO_LABEL: Record<TrabajoDetalle['estado'], string> = {
  pendiente: 'Pendiente',
  asignado: 'Asignado',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ESTADO_COLOR: Record<TrabajoDetalle['estado'], string> = {
  pendiente: '#b9770e',
  asignado: '#0a7ea4',
  en_progreso: '#1d8348',
  completado: '#64748b',
  cancelado: '#e74c3c',
};

const CHAT_POLL_MS = 5000;

function formatearDuracion(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${segundos} s`;
}

function formatearHora(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatearFechaHora(iso: string) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${formatearHora(iso)}`;
}

export default function DetalleTrabajoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [tipo, setTipo] = useState<'empleado' | 'empleador' | null>(null);
  const [trabajo, setTrabajo] = useState<TrabajoDetalle | null>(null);
  const [error, setError] = useState('');

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const [calificacion, setCalificacion] = useState<Calificacion | null>(null);
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState('');
  const [calificando, setCalificando] = useState(false);

  const cargarMensajes = useCallback(async () => {
    try {
      const { mensajes } = await listarMensajes(id);
      setMensajes(mensajes);
    } catch (e: any) {
      console.log('No se pudieron cargar los mensajes:', e?.message);
    }
  }, [id]);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const u = await getUsuario();
      if (!u) { router.replace('/'); return; }
      setTipo(u.tipo as 'empleado' | 'empleador');

      const { trabajo } = await obtenerTrabajo(id);
      setTrabajo(trabajo);

      // Estas tres no deberían tirar abajo toda la pantalla si alguna falla.
      await Promise.all([
        cargarMensajes(),
        listarEvidencia(id).then(r => setEvidencias(r.evidencias)).catch(e => console.log('Evidencia:', e?.message)),
        trabajo.estado === 'completado'
          ? obtenerCalificacion(id).then(r => setCalificacion(r.calificacion)).catch(e => console.log('Calificación:', e?.message))
          : Promise.resolve(),
      ]);
    } catch (e: any) {
      setError(e.message || 'No pudimos cargar el trabajo.');
    }
  }, [id, router, cargarMensajes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras el trabajo está activo, el chat se refresca solo cada 5s.
  const chatActivo = trabajo?.estado === 'en_progreso';
  useEffect(() => {
    if (!chatActivo) return;
    const intervalo = setInterval(cargarMensajes, CHAT_POLL_MS);
    return () => clearInterval(intervalo);
  }, [chatActivo, cargarMensajes]);

  async function handleEnviar() {
    const mensaje = texto.trim();
    if (!mensaje) return;
    setEnviando(true);
    try {
      const { mensaje: nuevo } = await enviarMensaje(id, mensaje);
      setMensajes(prev => [...prev, nuevo]);
      setTexto('');
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      alertaSimple('No se pudo enviar', e.message || 'Intentá de nuevo.');
      // Si el trabajo cambió de estado (por ej. se completó), refrescar para cerrar el chat.
      cargar();
    } finally {
      setEnviando(false);
    }
  }

  async function handleSubirFoto(origen: 'camara' | 'galeria') {
    const permiso = origen === 'camara'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      alertaSimple('Permiso necesario', origen === 'camara'
        ? 'Necesitamos acceso a la cámara para sacar la foto.'
        : 'Necesitamos acceso a tus fotos para elegir una.');
      return;
    }

    const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    const resultado = origen === 'camara'
      ? await ImagePicker.launchCameraAsync(opciones)
      : await ImagePicker.launchImageLibraryAsync(opciones);
    if (resultado.canceled || !resultado.assets[0]) return;

    setSubiendo(true);
    try {
      const { evidencia } = await subirEvidencia(id, resultado.assets[0].uri);
      setEvidencias(prev => [evidencia, ...prev]);
      alertaSimple('Foto subida', 'El empleador ya puede ver la evidencia del trabajo.');
    } catch (e: any) {
      alertaSimple('No se pudo subir la foto', e.message || 'Intentá de nuevo.');
    } finally {
      setSubiendo(false);
    }
  }

  async function handleCalificar() {
    if (puntaje < 1) {
      alertaSimple('Falta el puntaje', 'Elegí de 1 a 5 estrellas.');
      return;
    }
    setCalificando(true);
    try {
      await calificarTrabajo(id, puntaje, comentario.trim() || undefined);
      const { calificacion } = await obtenerCalificacion(id);
      setCalificacion(calificacion);
      alertaSimple('¡Gracias!', 'Tu calificación quedó registrada.');
    } catch (e: any) {
      alertaSimple('No se pudo calificar', e.message || 'Intentá de nuevo.');
    } finally {
      setCalificando(false);
    }
  }

  if (!trabajo) {
    return (
      <View className="flex-1 bg-[#f1f5f9] items-center justify-center px-8" style={{ paddingTop: insets.top }}>
        {error ? (
          <>
            <Text className="text-[#e74c3c] text-sm text-center mb-3">{error}</Text>
            <Pressable onPress={cargar} className="px-4 py-2 rounded-lg border border-[#e2e8f0] active:opacity-70 mb-2">
              <Text className="text-[#475569] text-sm font-semibold">Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} className="px-4 py-2 active:opacity-70">
              <Text className="text-[#475569] text-sm">Volver</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color="#FFD942" size="large" />
        )}
      </View>
    );
  }

  const esEmpleado = tipo === 'empleado';
  const puedeSubirEvidencia = esEmpleado && (trabajo.estado === 'en_progreso' || trabajo.estado === 'completado');
  const yoConfirme = esEmpleado ? trabajo.confirmado_empleado_en : trabajo.confirmado_empleador_en;
  const otroConfirmo = esEmpleado ? trabajo.confirmado_empleador_en : trabajo.confirmado_empleado_en;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#f1f5f9]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ paddingTop: insets.top }}>
      {/* Cabecera */}
      <View className="flex-row items-center px-3 pt-2 pb-3 bg-white border-b border-[#e2e8f0]">
        <Pressable onPress={() => router.back()} className="p-2 active:opacity-60">
          <MaterialIcons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-[#0f172a] ml-1" numberOfLines={1}>{trabajo.titulo}</Text>
        <View className="rounded-full px-2.5 py-1 mr-2" style={{ backgroundColor: ESTADO_COLOR[trabajo.estado] }}>
          <Text className="text-white text-[11px] font-bold">{ESTADO_LABEL[trabajo.estado]}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled">
        {/* Resumen + tiempos */}
        <View className="bg-white rounded-xl border border-[#e2e8f0] p-4 mb-4">
          <Text className="text-[13px] text-[#64748b] mb-2">
            {trabajo.categoria}{trabajo.nivel_dificultad ? ` · ${trabajo.nivel_dificultad}` : ''} · ${trabajo.precio}
          </Text>
          <Text className="text-sm text-[#475569] mb-3">{trabajo.descripcion}</Text>

          {!!trabajo.iniciado_en && (
            <Text className="text-[13px] text-[#475569]">Inicio: {formatearFechaHora(trabajo.iniciado_en)}</Text>
          )}
          {!!trabajo.finalizado_en && (
            <Text className="text-[13px] text-[#475569]">Fin: {formatearFechaHora(trabajo.finalizado_en)}</Text>
          )}
          {trabajo.duracionSegundos != null && (
            <Text className="text-[13px] font-bold text-[#0f172a] mt-1">
              Duración: {formatearDuracion(trabajo.duracionSegundos)}
            </Text>
          )}

          {trabajo.estado === 'en_progreso' && (yoConfirme || otroConfirmo) && (
            <View className="bg-[#fff8da] rounded-lg px-3 py-2 mt-3">
              <Text className="text-[13px] text-[#1a1a1a]">
                {yoConfirme
                  ? 'Ya confirmaste que terminó. Falta que confirme la otra parte.'
                  : 'La otra parte marcó el trabajo como terminado. Confirmalo desde la lista de trabajos.'}
              </Text>
            </View>
          )}
        </View>

        {/* Evidencia */}
        <Text className="text-sm font-bold text-[#475569] mb-2 uppercase">Foto de evidencia</Text>
        <View className="bg-white rounded-xl border border-[#e2e8f0] p-4 mb-4">
          {evidencias.length === 0 ? (
            <Text className="text-[13px] text-[#94a3b8] mb-1">
              {esEmpleado ? 'Subí una foto del trabajo terminado.' : 'El trabajador todavía no subió fotos del trabajo.'}
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2 mb-1">
              {evidencias.map(ev => (
                <View key={ev.id}>
                  <Image source={{ uri: ev.url }} style={{ width: 140, height: 140, borderRadius: 10, backgroundColor: '#e2e8f0' }} />
                  <Text className="text-[11px] text-[#94a3b8] mt-1">{formatearFechaHora(ev.creado_en)}</Text>
                </View>
              ))}
            </View>
          )}

          {puedeSubirEvidencia && (
            subiendo ? (
              <View className="items-center py-3"><ActivityIndicator color="#FFD942" /></View>
            ) : (
              <View className="flex-row gap-2 mt-3">
                {Platform.OS !== 'web' && (
                  <Pressable
                    onPress={() => handleSubirFoto('camara')}
                    className="flex-1 flex-row items-center justify-center rounded-lg py-2.5 bg-[#FFD942] active:opacity-90">
                    <MaterialIcons name="photo-camera" size={18} color="#1a1a1a" />
                    <Text className="text-[#1a1a1a] text-sm font-extrabold ml-1.5">Sacar foto</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleSubirFoto('galeria')}
                  className="flex-1 flex-row items-center justify-center rounded-lg py-2.5 border border-[#e2e8f0] active:opacity-70">
                  <MaterialIcons name="photo-library" size={18} color="#475569" />
                  <Text className="text-[#475569] text-sm font-semibold ml-1.5">Elegir de galería</Text>
                </Pressable>
              </View>
            )
          )}
        </View>

        {/* Calificación (solo el empleador califica al empleado) */}
        {trabajo.estado === 'completado' && (
          <>
            <Text className="text-sm font-bold text-[#475569] mb-2 uppercase">Calificación</Text>
            <View className="bg-white rounded-xl border border-[#e2e8f0] p-4 mb-4">
              {calificacion ? (
                <>
                  <View className="flex-row mb-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <MaterialIcons key={n} name={n <= calificacion.puntaje ? 'star' : 'star-border'} size={24} color="#f5b301" />
                    ))}
                  </View>
                  {!!calificacion.comentario && (
                    <Text className="text-sm text-[#475569]">“{calificacion.comentario}”</Text>
                  )}
                </>
              ) : esEmpleado ? (
                <Text className="text-[13px] text-[#94a3b8]">El empleador todavía no calificó este trabajo.</Text>
              ) : (
                <>
                  <Text className="text-[13px] text-[#475569] mb-2">¿Cómo fue el trabajo?</Text>
                  <View className="flex-row mb-3">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Pressable key={n} onPress={() => setPuntaje(n)} className="p-1 active:opacity-60">
                        <MaterialIcons name={n <= puntaje ? 'star' : 'star-border'} size={34} color="#f5b301" />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={comentario}
                    onChangeText={setComentario}
                    placeholder="Comentario (opcional)"
                    multiline
                    className="bg-[#f1f5f9] rounded-lg px-3 py-2.5 text-sm text-[#0f172a] border border-[#e2e8f0] mb-3 min-h-[60px]"
                  />
                  <Pressable
                    onPress={handleCalificar}
                    disabled={calificando}
                    className={`rounded-lg py-2.5 items-center ${calificando ? 'bg-[#f5e08a]' : 'bg-[#FFD942] active:opacity-90'}`}>
                    {calificando
                      ? <ActivityIndicator color="#1a1a1a" size="small" />
                      : <Text className="text-[#1a1a1a] text-sm font-extrabold">Enviar calificación</Text>}
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}

        {/* Chat */}
        <Text className="text-sm font-bold text-[#475569] mb-2 uppercase">Chat</Text>
        <View className="bg-white rounded-xl border border-[#e2e8f0] p-3">
          {mensajes.length === 0 ? (
            <Text className="text-[13px] text-[#94a3b8] text-center py-3">
              {chatActivo
                ? 'Todavía no hay mensajes.'
                : trabajo.estado === 'completado' || trabajo.estado === 'cancelado'
                ? 'No hubo mensajes en este trabajo.'
                : 'El chat se habilita cuando el trabajo arranca (al validar el PIN).'}
            </Text>
          ) : (
            mensajes.map(m => {
              const mio = m.remitente_tipo === tipo;
              return (
                <View key={m.id} className={`mb-2 max-w-[80%] ${mio ? 'self-end' : 'self-start'}`}>
                  <View className={`rounded-2xl px-3 py-2 ${mio ? 'bg-[#FFD942]' : 'bg-[#f1f5f9]'}`}>
                    <Text className="text-sm text-[#0f172a]">{m.mensaje}</Text>
                  </View>
                  <Text className={`text-[10px] text-[#94a3b8] mt-0.5 ${mio ? 'text-right' : 'text-left'}`}>
                    {formatearHora(m.enviado_en)}
                  </Text>
                </View>
              );
            })
          )}
          {!chatActivo && mensajes.length > 0 && (
            <Text className="text-[11px] text-[#94a3b8] text-center mt-1">
              Chat cerrado — se muestra el historial.
            </Text>
          )}
        </View>
      </ScrollView>

      {chatActivo && (
        <View
          className="flex-row items-end px-3 pt-2 bg-white border-t border-[#e2e8f0]"
          style={{ paddingBottom: insets.bottom + 8 }}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribí un mensaje…"
            multiline
            className="flex-1 bg-[#f1f5f9] rounded-2xl px-4 py-2.5 text-sm text-[#0f172a] border border-[#e2e8f0] max-h-[100px]"
          />
          <Pressable
            onPress={handleEnviar}
            disabled={enviando || !texto.trim()}
            className={`w-11 h-11 rounded-full items-center justify-center ml-2 ${
              enviando || !texto.trim() ? 'bg-[#f5e08a]' : 'bg-[#FFD942] active:opacity-90'
            }`}>
            {enviando
              ? <ActivityIndicator color="#1a1a1a" size="small" />
              : <MaterialIcons name="send" size={20} color="#1a1a1a" />}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
