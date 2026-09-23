import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario } from '../auth';
import { listarMensajes, enviarMensaje, type Mensaje } from '../lib/chat';
import { obtenerTrabajo, type Trabajo } from '../lib/trabajos';
import { Paleta, sombra } from '@/constants/theme';

// El backend no tiene tiempo real (websockets): mientras la pantalla está abierta se
// consultan los mensajes nuevos cada 4 segundos.
const INTERVALO_MS = 4000;

function horaDe(fecha: string) {
  const d = new Date(fecha);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Chat con el trabajador de un trabajo publicado.
export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trabajoId } = useLocalSearchParams<{ trabajoId: string }>();

  const [usuarioId, setUsuarioId] = useState('');
  const [trabajo, setTrabajo] = useState<Trabajo | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getUsuario().then(u => setUsuarioId(u?.id ?? ''));
  }, []);

  const refrescar = useCallback(async () => {
    if (!trabajoId) return;
    try {
      const [{ trabajo: t }, { mensajes: m }] = await Promise.all([
        obtenerTrabajo(trabajoId),
        listarMensajes(trabajoId),
      ]);
      setTrabajo(t);
      setMensajes(m);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cargar el chat.');
    }
  }, [trabajoId]);

  useEffect(() => {
    refrescar();
    const reloj = setInterval(refrescar, INTERVALO_MS);
    return () => clearInterval(reloj);
  }, [refrescar]);

  async function handleEnviar() {
    const contenido = texto.trim();
    if (!contenido || !trabajoId) return;

    setEnviando(true);
    try {
      const { mensaje } = await enviarMensaje(trabajoId, contenido);
      setTexto('');
      setMensajes(prev => [...(prev ?? []).filter(m => m.id !== mensaje.id), mensaje]);
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }

  const puedeEscribir = trabajo?.estado === 'en_progreso';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Paleta.fondo }} behavior="padding">
      {/* Cabecera */}
      <View
        className="flex-row items-center px-3 pb-3 bg-white border-b border-neutro"
        style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/ofrecer' as any))}
          className="w-10 h-10 rounded-full items-center justify-center active:opacity-70">
          <MaterialIcons name="arrow-back" size={24} color={Paleta.principal} />
        </Pressable>
        <View className="flex-1 ml-1">
          <Text className="text-principal text-base font-nunito-bold">Chat con el trabajador</Text>
          {trabajo ? (
            <Text className="text-neutro text-xs font-nunito" numberOfLines={1}>{trabajo.titulo}</Text>
          ) : null}
        </View>
      </View>

      {/* Mensajes */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled">
        {mensajes === null ? (
          <View className="flex-1 items-center justify-center">
            {error ? null : <ActivityIndicator color={Paleta.principal} />}
          </View>
        ) : mensajes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <MaterialIcons name="chat-bubble-outline" size={36} color={Paleta.neutro} />
            <Text className="text-neutro text-sm font-nunito text-center mt-3">Todavía no hay mensajes.</Text>
          </View>
        ) : (
          mensajes.map(m => {
            const mio = m.remitente_id === usuarioId;
            return (
              <View key={m.id} className={`mb-2 max-w-[80%] ${mio ? 'self-end items-end' : 'self-start items-start'}`}>
                <View
                  style={mio ? undefined : sombra(Paleta.neutro)}
                  className={`rounded-2xl px-4 py-2.5 ${
                    mio ? 'bg-principal rounded-br-sm' : 'bg-white rounded-bl-sm'
                  }`}>
                  <Text className={`text-[15px] font-nunito ${mio ? 'text-white' : 'text-principal'}`}>
                    {m.mensaje}
                  </Text>
                </View>
                <Text className="text-neutro text-[11px] font-nunito mt-0.5 mx-1">{horaDe(m.enviado_en)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {error ? <Text className="text-error text-[13px] font-nunito text-center px-4 pb-2">{error}</Text> : null}

      {/* Entrada de texto: solo mientras el trabajo está en curso */}
      {puedeEscribir ? (
        <View
          className="flex-row items-end px-3 pt-2 bg-white border-t border-neutro"
          style={{ paddingBottom: insets.bottom + 8 }}>
          <TextInput
            className="flex-1 bg-fondo-suave rounded-2xl px-4 py-2.5 text-[15px] font-nunito text-principal max-h-28"
            style={sombra(Paleta.acento)}
            placeholder="Escribí un mensaje"
            placeholderTextColor={Paleta.neutro}
            value={texto}
            onChangeText={setTexto}
            multiline
          />
          <Pressable
            onPress={handleEnviar}
            disabled={enviando || !texto.trim()}
            className={`w-11 h-11 rounded-full items-center justify-center ml-2 ${
              texto.trim() ? 'bg-principal active:opacity-90' : 'bg-neutro'
            }`}>
            {enviando ? (
              <ActivityIndicator size="small" color={Paleta.blanco} />
            ) : (
              <MaterialIcons name="send" size={20} color={Paleta.blanco} />
            )}
          </Pressable>
        </View>
      ) : trabajo ? (
        <View className="px-6 pt-3 bg-white border-t border-neutro" style={{ paddingBottom: insets.bottom + 12 }}>
          <Text className="text-neutro text-[13px] font-nunito text-center leading-5">
            {trabajo.estado === 'completado'
              ? 'El trabajo terminó: el chat queda como historial.'
              : 'Vas a poder escribir cuando arranque el trabajo, cuando el trabajador valide el PIN.'}
          </Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
