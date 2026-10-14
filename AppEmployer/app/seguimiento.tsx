import { useEffect, useMemo, useRef, useState } from 'react';
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
import MapaSeguimiento from '../components/mapa-seguimiento';
import CalificacionEstrellas from '../components/calificacion-estrellas';
import {
  obtenerTrabajo,
  completarTrabajo,
  cancelarTrabajo,
  obtenerPinLocal,
  calificarTrabajo,
  marcarCalificadoLocal,
  yaCalificadoLocal,
  formatearDuracion,
  type Trabajo,
} from '../lib/trabajos';
import { listarEvidencia, urlDeEvidencia, type Evidencia } from '../lib/evidencia';
import { obtenerUbicacionTrabajador, type Coordenadas } from '../lib/ubicacion';
import { Paleta, sombra } from '@/constants/theme';

function fechaCorta(iso: string) {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

// Última foto de evidencia que subió el trabajador, o el aviso de que todavía no hay.
function FotoEvidencia({ evidencias }: { evidencias: Evidencia[] | null }) {
  const [noCargo, setNoCargo] = useState(false);
  const ultima = evidencias?.[0] ?? null;
  const url = ultima ? urlDeEvidencia(ultima) : null;

  if (evidencias === null) {
    return (
      <View className="h-32 items-center justify-center">
        <ActivityIndicator color={Paleta.principal} />
      </View>
    );
  }

  if (!ultima) {
    return (
      <View className="h-32 items-center justify-center px-6">
        <MaterialIcons name="hourglass-empty" size={28} color={Paleta.neutro} />
        <Text className="text-neutro text-sm font-nunito mt-2 text-center">
          Todavía no hay foto del trabajador
        </Text>
      </View>
    );
  }

  if (url && !noCargo) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: 220 }}
        resizeMode="cover"
        onError={() => setNoCargo(true)}
      />
    );
  }

  return (
    <View className="h-32 items-center justify-center px-6">
      <MaterialIcons name="photo" size={28} color={Paleta.principal} />
      <Text className="text-principal text-sm font-nunito-semi mt-2 text-center">
        El trabajador subió la foto ({fechaCorta(ultima.creado_en)})
      </Text>
      <Text className="text-neutro text-xs font-nunito mt-1 text-center">
        No se pudo mostrar la imagen en la app.
      </Text>
    </View>
  );
}

// Seguimiento / detalle del trabajo publicado, del lado del empleador:
//   · mapa con el lugar del trabajo
//   · el PIN de verificación que hay que dictarle al trabajador cuando llega
//   · chat con el trabajador, la foto de evidencia y la confirmación de finalización
//   · una vez completado: la foto y la calificación del trabajador
//
// Nota sobre el PIN: el backend de Nico lo devuelve **una sola vez**, al publicar el
// trabajo (`POST /api/trabajos`), y quien lo valida contra la base es el trabajador
// (`POST /api/trabajos/:id/validar-pin`, que es `soloEmpleado`). Por eso al publicar se
// guarda en el dispositivo (`guardarPinLocal`) y acá se lee de ahí para dictarlo; el campo
// de abajo sirve para chequear lo que el trabajador repite — no vuelve a pegarle al backend.
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
  /** Ya confirmé la finalización, pero el trabajador todavía no. */
  const [esperandoOtraParte, setEsperandoOtraParte] = useState(false);

  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const [evidencias, setEvidencias] = useState<Evidencia[] | null>(null);

  // Última posición conocida del trabajador, para verlo moverse en el mapa.
  const [ubicTrabajador, setUbicTrabajador] = useState<Coordenadas | null>(null);

  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState('');
  const [calificando, setCalificando] = useState(false);
  const [calificado, setCalificado] = useState(false);
  const [errorCalificacion, setErrorCalificacion] = useState('');

  // ----- Datos guardados en este dispositivo: el PIN y si ya se calificó -----
  useEffect(() => {
    if (!trabajoId) return;
    obtenerPinLocal(trabajoId).then(setPinDelTrabajo);
    yaCalificadoLocal(trabajoId).then(setCalificado);
  }, [trabajoId]);

  // Si el backend de fotos no responde, se muestra como "todavía no hay foto" sin romper la pantalla.
  async function cargarEvidencia() {
    try {
      setEvidencias(await listarEvidencia(trabajoId!));
    } catch (e: any) {
      console.log('No se pudo cargar la evidencia:', e?.message);
      setEvidencias(prev => prev ?? []);
    }
  }

  // ----- Estado del trabajo (y la foto, cuando corresponde) -----
  // Se refresca cada 5 segundos mientras el trabajo no esté completado.
  const completadoRef = useRef(false);
  // Hora de la última consulta: para saber si la solicitud venció sin leer el reloj en el render.
  const [ahora, setAhora] = useState(0);

  useEffect(() => {
    if (!trabajoId) { setError('No se recibió el trabajo.'); setCargando(false); return; }

    let activo = true;

    async function refrescar() {
      try {
        const { trabajo: t } = await obtenerTrabajo(trabajoId!);
        if (!activo) return;
        setTrabajo(t);
        setAhora(Date.now());
        completadoRef.current = t.estado === 'completado';
        setError('');
        if (t.estado === 'en_progreso' || t.estado === 'completado') cargarEvidencia();
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

  // ----- Trabajador en camino -----
  // Mientras el trabajo está asignado o en progreso se consulta cada 10s dónde está el
  // trabajador (el mismo ritmo al que su app manda el GPS) para moverlo en el mapa.
  // Si todavía no compartió ubicación el endpoint devuelve `null` y el pin no se dibuja.
  const estado = trabajo?.estado;
  const sigueEnCamino = estado === 'asignado' || estado === 'en_progreso';

  useEffect(() => {
    if (!trabajoId || !sigueEnCamino) return;

    let activo = true;

    async function consultar() {
      try {
        const coords = await obtenerUbicacionTrabajador(trabajoId!);
        if (activo && coords) setUbicTrabajador(coords);
      } catch (e: any) {
        console.log('No se pudo obtener la ubicación del trabajador:', e?.message);
      }
    }

    consultar();
    const reloj = setInterval(consultar, 10000);
    return () => { activo = false; clearInterval(reloj); };
  }, [trabajoId, sigueEnCamino]);

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/ofrecer' as any);
  }

  function abrirChat() {
    router.push({ pathname: '/chat', params: { trabajoId } } as any);
  }

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
      // El backend cierra el trabajo sólo cuando confirmaron las dos partes. Si el
      // trabajador todavía no confirmó, el trabajo sigue 'en_progreso': hay que decirlo
      // en vez de dar por cerrado algo que no cerró.
      const resultado = await completarTrabajo(trabajoId!);
      if (resultado.estado === 'completado') {
        setTrabajo(t => (t ? { ...t, estado: 'completado', duracionSegundos: resultado.duracionSegundos ?? null } : t));
        completadoRef.current = true;
        setEsperandoOtraParte(false);
      } else {
        setEsperandoOtraParte(true);
      }
      setConfirmandoFin(false);
      cargarEvidencia();
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos confirmar la finalización.');
    } finally {
      setConfirmando(false);
    }
  }

  // Cancelar sólo se puede antes de que el trabajo arranque ('pendiente' o 'asignado');
  // el backend lo rechaza una vez que está 'en_progreso'.
  async function handleCancelar() {
    setError('');
    setCancelando(true);
    try {
      await cancelarTrabajo(trabajoId!);
      setTrabajo(t => (t ? { ...t, estado: 'cancelado' } : t));
      completadoRef.current = true; // terminal: no hace falta seguir refrescando
      setConfirmandoCancelar(false);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cancelar el trabajo.');
    } finally {
      setCancelando(false);
    }
  }

  async function handleCalificar() {
    setErrorCalificacion('');
    if (puntaje < 1) { setErrorCalificacion('Elegí de 1 a 5 estrellas.'); return; }

    setCalificando(true);
    try {
      await calificarTrabajo(trabajoId!, puntaje, comentario.trim() || undefined);
      await marcarCalificadoLocal(trabajoId!);
      setCalificado(true);
    } catch (e: any) {
      // 409 = el backend ya tenía una calificación para este trabajo (se calificó desde
      // otro dispositivo, o se reinstaló la app). No es un error: hay que dejar la
      // pantalla en "ya calificado" en vez de pedirlo de nuevo para siempre.
      if (e?.status === 409) {
        await marcarCalificadoLocal(trabajoId!);
        setCalificado(true);
      } else {
        setErrorCalificacion(e?.message ?? 'No pudimos enviar la calificación.');
      }
    } finally {
      setCalificando(false);
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
          onPress={volver}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-acento text-base font-nunito-bold">Volver</Text>
        </Pressable>
      </View>
    );
  }

  // ----- Trabajo completado: foto de evidencia + calificación -----
  if (trabajo.estado === 'completado') {
    return (
      <ScrollView
        className="flex-1 bg-fondo"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 28,
          paddingBottom: insets.bottom + 32,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View className="items-center mb-6">
          <View className="w-20 h-20 rounded-full bg-exito items-center justify-center mb-4">
            <MaterialIcons name="check" size={48} color="#ffffff" />
          </View>
          <Text className="text-principal text-2xl font-nunito-bold text-center mb-1">
            ¡Trabajo finalizado!
          </Text>
          <Text className="text-neutro text-sm font-nunito text-center leading-5">
            {trabajo.titulo} · se liberó el pago de ${trabajo.precio} al trabajador.
          </Text>
          {trabajo.duracionSegundos ? (
            <Text className="text-neutro text-sm font-nunito text-center mt-1">
              Duración: {formatearDuracion(trabajo.duracionSegundos)}
            </Text>
          ) : null}
        </View>

        {/* Evidencia */}
        <Text className="text-principal text-base font-nunito-bold mb-2">Foto del trabajo terminado</Text>
        <View style={sombra(Paleta.acento)} className="rounded-xl mb-6">
          <View className="bg-white rounded-xl overflow-hidden">
            <FotoEvidencia key={evidencias?.[0]?.id ?? 'sin-foto'} evidencias={evidencias} />
          </View>
        </View>

        {/* Calificación del trabajador */}
        <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4 mb-6">
          {calificado ? (
            <View className="items-center py-2">
              <MaterialIcons name="star" size={32} color={Paleta.acento} />
              <Text className="text-principal text-base font-nunito-bold mt-1">¡Gracias por calificar!</Text>
              <Text className="text-neutro text-xs font-nunito text-center mt-1">
                Tu calificación suma a la reputación del trabajador.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-principal text-base font-nunito-bold text-center mb-1">¿Cómo trabajó?</Text>
              <Text className="text-neutro text-xs font-nunito text-center mb-3">
                Calificá al trabajador de 1 a 5 estrellas.
              </Text>

              <CalificacionEstrellas
                valor={puntaje}
                onCambiar={v => { setPuntaje(v); setErrorCalificacion(''); }}
              />

              <TextInput
                className="bg-fondo-suave rounded-[10px] px-4 py-3 mt-4 mb-3 text-[15px] font-nunito text-principal h-20"
                style={[{ textAlignVertical: 'top' }, sombra(Paleta.acento)]}
                placeholder="Comentario (opcional)"
                placeholderTextColor={Paleta.neutro}
                value={comentario}
                onChangeText={setComentario}
                multiline
                maxLength={300}
              />

              {errorCalificacion ? (
                <Text className="text-error text-[13px] font-nunito text-center mb-2">{errorCalificacion}</Text>
              ) : null}

              <Pressable
                onPress={handleCalificar}
                disabled={calificando}
                className="bg-principal rounded-xl py-3.5 items-center active:opacity-90">
                {calificando ? (
                  <ActivityIndicator color={Paleta.blanco} />
                ) : (
                  <Text className="text-acento text-base font-nunito-bold">Enviar calificación</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <Pressable
          onPress={abrirChat}
          style={sombra(Paleta.principal, 0.75)}
          className="bg-white rounded-xl py-3.5 items-center active:opacity-70 mb-3">
          <Text className="text-principal text-base font-nunito-bold">Ver el chat</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace('/(tabs)/ofrecer' as any)}
          className="bg-principal rounded-xl py-4 items-center active:opacity-90">
          <Text className="text-acento text-base font-nunito-bold">Volver al inicio</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const enProgreso = trabajo.estado === 'en_progreso';
  const cancelado = trabajo.estado === 'cancelado';
  // El backend sólo deja cancelar antes de que el trabajo arranque.
  const sePuedeCancelar = trabajo.estado === 'pendiente' || trabajo.estado === 'asignado';
  const solicitudVencida =
    trabajo.estado === 'pendiente' &&
    !!trabajo.solicitud_expira_en &&
    new Date(trabajo.solicitud_expira_en).getTime() < ahora;

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top }}>
      {/* Mapa con el lugar del trabajo */}
      <View style={{ height: 260 }}>
        {lugar ? <MapaSeguimiento empleador={lugar} trabajador={ubicTrabajador} /> : null}

        <Pressable
          onPress={volver}
          style={sombra(Paleta.neutro)}
          className="absolute top-3 left-4 w-10 h-10 rounded-full bg-white items-center justify-center active:opacity-70">
          <MaterialIcons name="arrow-back" size={22} color={Paleta.principal} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 18, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Estado */}
        <View className="flex-row items-center gap-2 mb-4">
          <View
            className={`w-2.5 h-2.5 rounded-full ${
              cancelado || solicitudVencida
                ? 'bg-error'
                : trabajo.estado === 'pendiente'
                ? 'bg-neutro'
                : 'bg-exito'
            }`}
          />
          <Text className="text-neutro text-xs font-nunito-semi uppercase tracking-wider">
            {cancelado
              ? 'Trabajo cancelado'
              : solicitudVencida
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
          <View style={sombra(Paleta.neutro)} className="flex-row items-center bg-fondo-suave rounded-xl px-4 py-3 mb-5">
            <MaterialIcons name="timer-off" size={18} color={Paleta.neutro} />
            <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
              La solicitud expiró sin que nadie la acepte. Podés publicar el trabajo de nuevo.
            </Text>
          </View>
        ) : null}

        {/* Chat con el trabajador (una vez que alguien lo aceptó) */}
        {trabajo.estado === 'asignado' || enProgreso ? (
          <Pressable
            onPress={abrirChat}
            style={sombra(Paleta.principal, 0.75)}
            className="flex-row items-center justify-center bg-white rounded-xl py-3 mb-5 active:opacity-70">
            <MaterialIcons name="chat-bubble-outline" size={18} color={Paleta.principal} />
            <Text className="text-principal text-sm font-nunito-bold ml-2">Chat con el trabajador</Text>
          </Pressable>
        ) : null}

        {/* PIN de verificación */}
        {!enProgreso && !solicitudVencida ? (
          <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4 mb-5">
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
                      className="bg-fondo-suave rounded-[10px] px-4 py-3 mb-2 text-lg font-nunito-bold text-principal text-center tracking-[6px]"
                      style={sombra(Paleta.acento)}
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
                      style={sombra(Paleta.principal, 0.75)}
                      className="bg-white rounded-xl py-3 items-center active:opacity-70">
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

            <View style={sombra(Paleta.acento)} className="rounded-xl mb-5">
              <View className="bg-white rounded-xl overflow-hidden">
                <FotoEvidencia key={evidencias?.[0]?.id ?? 'sin-foto'} evidencias={evidencias} />
              </View>
            </View>

            {error ? (
              <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text>
            ) : null}

            {esperandoOtraParte ? (
              <View style={sombra(Paleta.neutro)} className="bg-fondo-suave rounded-xl p-4 items-center">
                <MaterialIcons name="hourglass-top" size={30} color={Paleta.principal} />
                <Text className="text-principal text-base font-nunito-bold text-center mt-2 mb-1">
                  Esperando al trabajador
                </Text>
                <Text className="text-neutro text-sm font-nunito text-center leading-5">
                  Ya confirmaste la finalización. El trabajo se cierra y se libera el pago de $
                  {trabajo.precio} cuando el trabajador también lo marque como terminado.
                </Text>
              </View>
            ) : confirmandoFin ? (
              <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4">
                <Text className="text-principal text-base font-nunito-bold mb-1">
                  ¿Confirmás que el trabajo está terminado?
                </Text>
                <Text className="text-neutro text-sm font-nunito mb-4 leading-5">
                  Hace falta que las dos partes confirmen. Cuando el trabajador también lo marque,
                  se libera el pago de ${trabajo.precio}. No se puede deshacer.
                </Text>

                <Pressable
                  onPress={handleConfirmarFin}
                  disabled={confirmando}
                  className="bg-principal rounded-xl py-4 items-center active:opacity-90 mb-2.5">
                  <Text className="text-acento text-base font-nunito-bold">
                    {confirmando ? 'Confirmando…' : 'Sí, confirmar y pagar'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setConfirmandoFin(false)}
                  disabled={confirmando}
                  style={sombra(Paleta.principal, 0.75)}
                  className="bg-white rounded-xl py-4 items-center active:opacity-70">
                  <Text className="text-principal text-base font-nunito-bold">Volver</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setError(''); setConfirmandoFin(true); }}
                className="bg-principal rounded-xl py-4 items-center active:opacity-90">
                <Text className="text-acento text-base font-nunito-bold">Marcar como finalizado</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {/* Cancelar: sólo antes de que el trabajo arranque */}
        {sePuedeCancelar ? (
          confirmandoCancelar ? (
            <View style={sombra(Paleta.error, 0.75)} className="bg-white rounded-xl p-4 mt-6">
              <Text className="text-principal text-base font-nunito-bold mb-1">
                ¿Cancelar este trabajo?
              </Text>
              <Text className="text-neutro text-sm font-nunito mb-4 leading-5">
                Se da de baja la publicación y, si ya había un trabajador asignado, se le avisa.
                No se puede deshacer.
              </Text>

              <Pressable
                onPress={handleCancelar}
                disabled={cancelando}
                className="bg-error rounded-xl py-4 items-center active:opacity-90 mb-2.5">
                <Text className="text-white text-base font-nunito-bold">
                  {cancelando ? 'Cancelando…' : 'Sí, cancelar el trabajo'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmandoCancelar(false)}
                disabled={cancelando}
                style={sombra(Paleta.principal, 0.75)}
                className="bg-white rounded-xl py-4 items-center active:opacity-70">
                <Text className="text-principal text-base font-nunito-bold">Volver</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { setError(''); setConfirmandoCancelar(true); }}
              className="mt-6 py-3 items-center active:opacity-70">
              <Text className="text-error text-sm font-nunito-semi underline">Cancelar trabajo</Text>
            </Pressable>
          )
        ) : null}

        {cancelado ? (
          <View style={sombra(Paleta.neutro)} className="flex-row items-start bg-fondo-suave rounded-xl px-4 py-3 mt-2">
            <MaterialIcons name="cancel" size={18} color={Paleta.error} />
            <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
              Este trabajo está cancelado. Si todavía lo necesitás, publicalo de nuevo desde
              &ldquo;Ofrecer trabajo&rdquo;.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
