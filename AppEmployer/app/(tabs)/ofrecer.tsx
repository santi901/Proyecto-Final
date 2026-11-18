import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';
import { pedirUbicacion, enviarUbicacion, seguirUbicacion, type Coordenadas } from '../../lib/ubicacion';
import {
  cotizarTrabajo,
  crearTrabajo,
  formatearFechaHora,
  guardarPinLocal,
  type Cotizacion,
} from '../../lib/trabajos';
import BotonChat from '../../components/boton-chat';
import VistaFormulario from '../../components/vista-formulario';
import CampoTexto from '../../components/campo-texto';
import { activarNotificacionesPush } from '../../lib/notificaciones';
import { Paleta, sombra } from '@/constants/theme';

type EstadoUbicacion = 'cargando' | 'ok' | 'denegado' | 'error';

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_WIDTH = Math.round(SCREEN_W * 0.78);

// Tienen que coincidir con el tarifario del backend (services/preciosService.js), que
// es el que valida y pone el precio: una categoría que no exista allá da 400.
const CATEGORIAS = ['Limpieza', 'Mudanza', 'Jardín', 'Pintura', 'Plomería', 'Otros'];
const DIFICULTADES = ['Simple', 'Intermedio', 'Complejo'] as const;

// Sprint 6: el precio ya no está fijo en la app. Lo calcula el backend (base por
// categoría × multiplicador por dificultad) y se pide cada vez que cambia la selección.

// ----- Programación (Sprint 6) -----
// Sin librería de date picker: días (hoy + 6) y horarios cada 30 min como chips.
// Funciona igual en Android, iOS y web, y no suma una dependencia nativa.
const DIAS_A_MOSTRAR = 7;
const HORA_DESDE = 7;
const HORA_HASTA = 22;
// El backend pide al menos 60 min; se dejan 15 de margen por el tiempo que tarda en publicarse.
const MIN_ANTICIPACION_MS = 75 * 60 * 1000;

type Cuando = 'ahora' | 'programar';

function diasDisponibles(): Date[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Array.from({ length: DIAS_A_MOSTRAR }, (_, i) => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i));
}

function horariosDelDia(dia: Date): Date[] {
  const minimo = Date.now() + MIN_ANTICIPACION_MS;
  const horarios: Date[] = [];
  for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
    for (const m of [0, 30]) {
      const d = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m);
      if (d.getTime() >= minimo) horarios.push(d);
    }
  }
  return horarios;
}

// Un horario elegido hace rato puede haber quedado demasiado cerca (la pantalla quedó abierta).
function horarioSigueValido(h: Date): boolean {
  return h.getTime() >= Date.now() + MIN_ANTICIPACION_MS;
}

function etiquetaDia(d: Date, i: number): string {
  if (i === 0) return 'Hoy';
  if (i === 1) return 'Mañana';
  return formatearFechaHora(d.toISOString()).slice(0, 9);
}

const dos = (n: number) => String(n).padStart(2, '0');

function ScrollViewHorizontal({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export default function OfrecerTrabajoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [titulo, setTitulo] = useState('Nuevo Trabajo');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<number | null>(null);
  const [dificultad, setDificultad] = useState<typeof DIFICULTADES[number] | null>(null);
  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [perfilAbierto, setPerfilAbierto] = useState(false);

  // ----- Ubicación -----
  const [ubicEstado, setUbicEstado] = useState<EstadoUbicacion>('cargando');
  const [coords, setCoords] = useState<Coordenadas | null>(null);
  const [errorUbic, setErrorUbic] = useState('');

  // Pide el permiso de ubicación. Si lo otorgan, obtiene las coordenadas, las muestra
  // en el mapa y se las manda al backend. Si no, deja el estado en 'denegado' (bloquea el uso).
  async function iniciarUbicacion(userId: string): Promise<EstadoUbicacion> {
    setUbicEstado('cargando');
    setErrorUbic('');

    const r = await pedirUbicacion();

    if (r.estado === 'ok') {
      setCoords(r.coords);
      setUbicEstado('ok');
      // Mandar al backend (no bloquea la UI si falla la red)
      enviarUbicacion(r.coords, userId).catch(e =>
        console.log('No se pudo enviar la ubicación:', e?.message),
      );
    } else if (r.estado === 'denegado') {
      setUbicEstado('denegado');
    } else {
      setErrorUbic(r.mensaje);
      setUbicEstado('error');
    }
    return r.estado;
  }

  // Solo accesible con sesión activa. Con sesión OK, arranca el flujo de ubicación y,
  // si se obtuvo bien, el seguimiento periódico (cada 10s) mientras la pantalla esté abierta.
  useEffect(() => {
    let activo = true;
    let detenerSeguimiento: (() => void) | undefined;

    getUsuario().then(async u => {
      if (!activo) return;
      if (!u) { router.replace('/'); return; }
      setUsuario(u.email || 'Empleador');
      setUsuarioId(u.id);
      // Con sesión activa (recién logueado o al abrir la app) se registra el token de push.
      activarNotificacionesPush();
      const estado = await iniciarUbicacion(u.id);
      if (activo && estado === 'ok') {
        detenerSeguimiento = seguirUbicacion(u.id, setCoords);
      }
    });

    return () => { activo = false; detenerSeguimiento?.(); };
  }, [router]);

  // ----- Precio (Sprint 6): lo calcula el backend -----
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cotizando, setCotizando] = useState(false);
  const [errorCotizacion, setErrorCotizacion] = useState('');
  // Solo vale la respuesta de la última cotización pedida (si el usuario cambia rápido
  // de categoría, una respuesta vieja no pisa a la nueva).
  const ultimaCotizacion = useRef(0);

  async function pedirCotizacion(cat: number | null, dif: typeof DIFICULTADES[number] | null) {
    setCotizacion(null);
    setErrorCotizacion('');
    if (cat === null || !dif) return;

    const id = ++ultimaCotizacion.current;
    setCotizando(true);
    try {
      const c = await cotizarTrabajo(CATEGORIAS[cat], dif);
      if (id === ultimaCotizacion.current) setCotizacion(c);
    } catch (e: any) {
      if (id === ultimaCotizacion.current) setErrorCotizacion(e?.message ?? 'No pudimos calcular el precio.');
    } finally {
      if (id === ultimaCotizacion.current) setCotizando(false);
    }
  }

  // Se cotiza en el handler (no en un useEffect) para no hacer setState dentro de un efecto.
  function elegirCategoria(i: number) {
    setCategoria(i);
    setConfirmando(false);
    pedirCotizacion(i, dificultad);
  }
  function elegirDificultad(d: typeof DIFICULTADES[number]) {
    setDificultad(d);
    setConfirmando(false);
    pedirCotizacion(categoria, d);
  }

  // ----- Cuándo (Sprint 6): ahora o programado -----
  const [cuando, setCuando] = useState<Cuando>('ahora');
  const [diaIdx, setDiaIdx] = useState(0);
  const [horario, setHorario] = useState<Date | null>(null);
  const dias = diasDisponibles();
  const horarios = horariosDelDia(dias[diaIdx]);

  // ----- Publicación del trabajo -----
  const [publicando, setPublicando] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState('');
  /** Paso de confirmación: muestra precio y fecha antes de publicar de verdad. */
  const [confirmando, setConfirmando] = useState(false);

  // Primer toque en "Ofrecer Trabajo": valida y muestra el resumen con el precio.
  function handleOfrecer() {
    setErrorPublicar('');

    if (!titulo.trim()) { setErrorPublicar('Poné un título al trabajo.'); return; }
    if (categoria === null) { setErrorPublicar('Elegí una categoría.'); return; }
    if (!descripcion.trim()) { setErrorPublicar('Escribí una descripción.'); return; }
    if (!dificultad) { setErrorPublicar('Elegí la dificultad del trabajo.'); return; }
    if (!cotizacion) { setErrorPublicar(cotizando ? 'Esperá a que se calcule el precio.' : 'No pudimos calcular el precio. Volvé a elegir la dificultad.'); return; }
    if (cuando === 'programar' && !horario) { setErrorPublicar('Elegí el día y la hora del trabajo.'); return; }
    if (cuando === 'programar' && horario && !horarioSigueValido(horario)) {
      setHorario(null);
      setErrorPublicar('Ese horario ya quedó muy cerca. Elegí otro.');
      return;
    }
    if (!coords) { setErrorPublicar('No pudimos obtener tu ubicación. Reintentá desde el mapa.'); return; }

    setConfirmando(true);
  }

  // Publica el trabajo (en la ubicación actual del empleador) y salta al seguimiento.
  // El backend devuelve el PIN una sola vez, acá: se guarda en el dispositivo para
  // poder mostrarlo en el seguimiento y en "Mis trabajos".
  async function handleConfirmarPublicacion() {
    if (categoria === null || !dificultad || !cotizacion || !coords) return;
    setErrorPublicar('');
    setPublicando(true);
    try {
      const { trabajo, pin } = await crearTrabajo({
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        categoria: CATEGORIAS[categoria],
        nivelDificultad: dificultad,
        precio: cotizacion.precio,
        latitud: coords.lat,
        longitud: coords.lng,
        fechaProgramada: cuando === 'programar' && horario ? horario.toISOString() : null,
      });

      await guardarPinLocal(trabajo.id, pin);

      setTitulo('Nuevo Trabajo');
      setDescripcion('');
      setCategoria(null);
      setDificultad(null);
      setCotizacion(null);
      setCuando('ahora');
      setHorario(null);
      setConfirmando(false);

      router.push({ pathname: '/seguimiento', params: { trabajoId: trabajo.id } } as any);
    } catch (e: any) {
      // 409 = el precio cambió en el backend desde que se cotizó: se vuelve a cotizar
      // y el empleador tiene que confirmar de nuevo con el precio nuevo a la vista.
      if (e?.status === 409) {
        setConfirmando(false);
        await pedirCotizacion(categoria, dificultad);
      }
      setErrorPublicar(e?.message ?? 'No pudimos publicar el trabajo.');
    } finally {
      setPublicando(false);
    }
  }

  // ----- Panel de perfil (se desliza desde el costado) -----
  const panelX = useRef(new Animated.Value(PANEL_WIDTH)).current;

  const abrirPerfil = () => {
    setPerfilAbierto(true);
    Animated.timing(panelX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };
  const cerrarPerfil = () => {
    Animated.timing(panelX, { toValue: PANEL_WIDTH, duration: 200, useNativeDriver: true }).start(
      () => setPerfilAbierto(false)
    );
  };

  async function handleLogout() {
    await authLogout();
    router.replace('/');
  }

  // ----- Mientras se resuelve el permiso de ubicación -----
  if (ubicEstado === 'cargando') {
    return (
      <View className="flex-1 bg-fondo items-center justify-center px-8">
        <ActivityIndicator size="large" color={Paleta.principal} />
        <Text className="text-principal text-base font-nunito-semi mt-4">Obteniendo tu ubicación…</Text>
        <Text className="text-neutro text-sm font-nunito text-center mt-1">
          La necesitamos para asociarla a los trabajos que publicás.
        </Text>
      </View>
    );
  }

  // ----- Si no dan permiso (o falla el GPS), se bloquea el uso de la pantalla -----
  if (ubicEstado === 'denegado' || ubicEstado === 'error') {
    const denegado = ubicEstado === 'denegado';
    return (
      <View
        className="flex-1 bg-fondo items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-5">
          <MaterialIcons name="location-off" size={40} color={Paleta.principal} />
        </View>
        <Text className="text-principal text-xl font-nunito-bold text-center mb-2">
          {denegado ? 'Necesitamos tu ubicación' : 'No pudimos obtener tu ubicación'}
        </Text>
        <Text className="text-neutro text-sm font-nunito text-center mb-7 leading-5">
          {denegado
            ? 'ChanguitApp usa tu ubicación para mostrar en el mapa dónde estás y asociarla a los trabajos que publicás. Sin este permiso no podés ofrecer trabajos.'
            : errorUbic || 'Revisá que el GPS esté activado e intentá de nuevo.'}
        </Text>

        <Pressable
          onPress={() => iniciarUbicacion(usuarioId)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90 mb-3">
          <Text className="text-acento text-base font-nunito-bold">Reintentar</Text>
        </Pressable>

        {denegado && (
          <Pressable onPress={() => Linking.openSettings()} className="py-2 items-center">
            <Text className="text-principal text-sm font-nunito-semi underline">
              Abrir configuración del teléfono
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ----- Permiso OK: pantalla principal -----
  // El mapa ya no va de fondo acá: solo se muestra en /seguimiento, una vez que se
  // publica el trabajo y arranca la búsqueda de trabajador (la ubicación se sigue
  // pidiendo y mandando igual, solo que ya no se dibuja).
  return (
    // Capa 1 (fondo absoluto): el mismo #FFFDF3 que el fondo del inicio de sesión. Acá
    // viven los tres botones de ubicación, perfil y mensajes. Todo lo demás (pestañas,
    // botón de ofrecer y el contenedor de datos) se dibuja encima, en las capas 2 y 3.
    <View className="flex-1 bg-fondo">
      <View
        className="flex-row items-center justify-between px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}>
        <View className="w-11 h-11 rounded-full bg-principal items-center justify-center">
          <MaterialIcons name="home" size={22} color={Paleta.blanco} />
        </View>
        <View className="flex-row gap-3">
          <BotonChat />
          <Pressable
            onPress={abrirPerfil}
            style={sombra(Paleta.neutro)}
            className="w-11 h-11 rounded-full bg-white items-center justify-center active:opacity-70">
            <MaterialIcons name="person-outline" size={22} color={Paleta.principal} />
          </Pressable>
        </View>
      </View>

      <VistaFormulario className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {/* Capa 2 (pestañas): Ofrecer trabajo / favoritos / historial. NO lleva los campos
            del trabajo adentro — son la capa 3, aparte, justo abajo. */}
        <View style={sombra(Paleta.acento)} className="rounded-t-[24px]">
          <View className="flex-row items-stretch overflow-hidden rounded-t-[24px] bg-fondo h-14">
            <View
              style={{ borderTopLeftRadius: 24, borderBottomRightRadius: 24 }}
              className="bg-principal px-6 items-center justify-center">
              <Text className="text-acento text-[15px] font-nunito-bold">Ofrecer trabajo</Text>
            </View>
            <View className="flex-1 flex-row items-center justify-center gap-8">
              <MaterialIcons name="favorite" size={20} color={Paleta.principal} />
              <MaterialIcons name="history" size={20} color={Paleta.principal} />
            </View>
          </View>
        </View>

        {/* Capa 3: el contenedor con TODO lo que el empleador carga (título, categoría,
            descripción, dificultad, pago, medio de pago). Pegado a las pestañas, sin
            espacio entre ambos, para que se lean como una sola pieza. */}
        <View
          style={sombra(Paleta.acento)}
          className="rounded-b-[24px] bg-fondo-suave px-5 pt-5 pb-6 mb-6">
          {/* Título: es texto editable, no va dentro de una caja */}
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-1 mr-3">
              <Text className="text-[13px] font-nunito text-principal mb-1">Título:</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={titulo}
                  onChangeText={setTitulo}
                  placeholder="Nuevo Trabajo"
                  placeholderTextColor={Paleta.neutro}
                  style={{ textDecorationLine: 'underline' }}
                  className="flex-1 text-lg font-nunito-bold text-principal p-0"
                />
                <MaterialIcons name="edit" size={16} color={Paleta.principal} />
              </View>
            </View>
            <Pressable
              style={sombra(Paleta.neutro)}
              className="w-9 h-9 rounded-full bg-white items-center justify-center active:opacity-70">
              <MaterialIcons name="favorite-border" size={16} color={Paleta.principal} />
            </Pressable>
          </View>

          {/* Categoría */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-2">Categoría:</Text>
          <View className="flex-row flex-wrap justify-between mb-5">
            {CATEGORIAS.map((cat, i) => {
              const sel = categoria === i;
              return (
                <Pressable
                  key={cat}
                  onPress={() => elegirCategoria(i)}
                  style={[
                    { width: 93, height: 86 },
                    // Única excepción a la sombra fina: seleccionada tiene spread 2 (más radio).
                    sel ? sombra(Paleta.verde, 1, 3.5) : sombra(Paleta.rojo, 0.65),
                  ]}
                  className="rounded-2xl mb-3 items-center justify-center bg-white active:opacity-70">
                  <Text
                    className={`text-[13px] text-center px-1 ${
                      sel ? 'text-principal font-nunito-semi' : 'text-neutro font-nunito'
                    }`}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Descripción */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Descripción:</Text>
          <CampoTexto
            className="h-24"
            style={sombra(Paleta.neutro)}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Ingresá una descripción detallada del trabajo, de forma que no tengas que responder a tantas dudas de parte de los trabajadores"
            multiline
          />

          {/* Dificultad: un solo botón dividido en 3, no tres botones sueltos.
              La sombra va en el View de afuera (sin overflow-hidden: si no, se recorta
              y no se ve) y el redondeo + el clip de los segmentos, en el de adentro. */}
          <View style={sombra(Paleta.neutro)} className="rounded-[13px] mt-5 mb-5">
            <View className="flex-row overflow-hidden rounded-[13px] bg-white">
              {DIFICULTADES.map((d, idx) => {
                const sel = dificultad === d;
                return (
                  <View key={d} className="flex-1 flex-row">
                    {idx > 0 && <View style={{ width: 1, backgroundColor: Paleta.neutro, opacity: 0.3 }} />}
                    <Pressable
                      onPress={() => elegirDificultad(d)}
                      className={`flex-1 items-center justify-center py-3 active:opacity-70 ${
                        sel ? 'bg-acento' : 'bg-white'
                      }`}>
                      <Text className="text-[13px] font-nunito-semi text-principal">{d}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ¿Cuándo? Ahora o programado (Sprint 6) */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-2">¿Cuándo?</Text>
          <View style={sombra(Paleta.neutro)} className="rounded-[13px] mb-3">
            <View className="flex-row overflow-hidden rounded-[13px] bg-white">
              {(['ahora', 'programar'] as Cuando[]).map((c, idx) => (
                <View key={c} className="flex-1 flex-row">
                  {idx > 0 && <View style={{ width: 1, backgroundColor: Paleta.neutro, opacity: 0.3 }} />}
                  <Pressable
                    onPress={() => { setCuando(c); setConfirmando(false); }}
                    className={`flex-1 items-center justify-center py-3 active:opacity-70 ${cuando === c ? 'bg-acento' : 'bg-white'}`}>
                    <Text className="text-[13px] font-nunito-semi text-principal">
                      {c === 'ahora' ? 'Lo antes posible' : 'Programar'}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {cuando === 'programar' ? (
            <View className="mb-5">
              <ScrollViewHorizontal>
                {dias.map((d, i) => {
                  const sel = diaIdx === i;
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => { setDiaIdx(i); setHorario(null); setConfirmando(false); }}
                      className={`px-3.5 py-2 rounded-full mr-2 border ${sel ? 'bg-principal border-principal' : 'bg-white border-neutro'}`}>
                      <Text className={`text-[13px] font-nunito-semi ${sel ? 'text-white' : 'text-principal'}`}>{etiquetaDia(d, i)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollViewHorizontal>
              {horarios.length === 0 ? (
                <Text className="text-neutro text-xs font-nunito mt-2">No quedan horarios para este día. Elegí otro.</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2 mt-2">
                  {horarios.map(h => {
                    const sel = horario?.getTime() === h.getTime();
                    return (
                      <Pressable
                        key={h.toISOString()}
                        onPress={() => { setHorario(h); setConfirmando(false); }}
                        className={`px-3 py-1.5 rounded-lg border ${sel ? 'bg-acento border-acento' : 'bg-white border-neutro'}`}>
                        <Text className="text-[13px] font-nunito-semi text-principal">{dos(h.getHours())}:{dos(h.getMinutes())}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text className="text-neutro text-xs font-nunito mt-2 leading-4">
                Lo publicamos a los trabajadores una hora antes, para que alguien lo tome y llegue a tiempo.
              </Text>
            </View>
          ) : (
            <View className="mb-5" />
          )}

          {/* Pago final: lo calcula el backend (Sprint 6) */}
          <View style={sombra(Paleta.acento)} className="rounded-xl bg-white px-5 py-5 mb-5">
            <Text className="text-base font-nunito-bold text-principal mb-1">Pago final:</Text>
            {cotizando ? (
              <ActivityIndicator color={Paleta.principal} style={{ alignSelf: 'flex-start' }} />
            ) : cotizacion ? (
              <>
                <Text className="text-2xl font-nunito-bold text-principal">${cotizacion.precio}</Text>
                <Text className="text-neutro text-xs font-nunito mt-1">
                  Base {cotizacion.desglose.categoria} ${cotizacion.desglose.base} × {cotizacion.desglose.nivelDificultad}{' '}
                  {String(cotizacion.desglose.multiplicador).replace('.', ',')}
                </Text>
              </>
            ) : (
              <Text className={`text-base font-nunito ${errorCotizacion ? 'text-error' : 'text-neutro'}`}>
                {errorCotizacion || 'Elegí la categoría y la dificultad'}
              </Text>
            )}
          </View>

          <Pressable
            style={sombra(Paleta.neutro)}
            className="items-center justify-center bg-white rounded-[10px] py-3.5 active:opacity-70">
            <Text className="text-base font-nunito-bold text-principal">Configurar medio de pago</Text>
          </Pressable>
        </View>

        {errorPublicar ? (
          <Text className="text-error text-[13px] font-nunito text-center mb-3">{errorPublicar}</Text>
        ) : null}

        {/* Capa 2 (cont.): el botón de Ofrecer Trabajo también es de esta capa, no del
            contenedor de datos — por eso va aparte, no pegado al rectángulo de arriba.
            Sprint 6: primero muestra el resumen con el precio; recién ahí se publica. */}
        {confirmando && cotizacion ? (
          <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4">
            <Text className="text-principal text-base font-nunito-bold mb-2">Confirmá antes de publicar</Text>
            <Text className="text-neutro text-sm font-nunito leading-5">
              {titulo.trim()} · {categoria !== null ? CATEGORIAS[categoria] : ''} · {dificultad}
            </Text>
            <Text className="text-neutro text-sm font-nunito leading-5 mb-3">
              {cuando === 'programar' && horario
                ? `Programado para el ${formatearFechaHora(horario.toISOString())}`
                : 'Se publica ahora a los trabajadores cercanos'}
            </Text>
            <Text className="text-principal text-3xl font-nunito-bold mb-4">${cotizacion.precio}</Text>

            <Pressable
              onPress={handleConfirmarPublicacion}
              disabled={publicando}
              className="bg-principal rounded-xl py-4 items-center active:opacity-90 mb-2.5">
              {publicando ? (
                <ActivityIndicator color={Paleta.acento} />
              ) : (
                <Text className="text-acento text-base font-nunito-bold">Confirmar y publicar</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirmando(false)}
              disabled={publicando}
              style={sombra(Paleta.principal, 0.75)}
              className="bg-white rounded-xl py-4 items-center active:opacity-70">
              <Text className="text-principal text-base font-nunito-bold">Volver a editar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleOfrecer}
            className="bg-principal rounded-xl py-4 items-center active:opacity-90">
            <Text className="text-acento text-base font-nunito-bold">Ofrecer Trabajo</Text>
          </Pressable>
        )}
      </VistaFormulario>

      {/* Panel de perfil (se despliega desde el costado) */}
      {perfilAbierto && (
        <>
          <Pressable
            onPress={cerrarPerfil}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: PANEL_WIDTH,
              backgroundColor: Paleta.principal,
              transform: [{ translateX: panelX }],
              paddingTop: insets.top + 16,
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 16,
              shadowColor: '#000',
              shadowOffset: { width: -4, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 20,
            }}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-lg font-nunito-bold">Mi perfil</Text>
              <Pressable onPress={cerrarPerfil} className="p-1 active:opacity-70">
                <MaterialIcons name="close" size={24} color={Paleta.blanco} />
              </Pressable>
            </View>

            <View className="items-center mb-6">
              <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-3">
                <Text className="text-3xl font-nunito-bold text-principal">
                  {usuario ? usuario[0].toUpperCase() : 'U'}
                </Text>
              </View>
              <Text className="text-white text-base font-nunito-semi" numberOfLines={1}>{usuario}</Text>
              <Text className="text-white/70 text-xs font-nunito mt-1">Empleador</Text>
            </View>

            <View className="border-t border-white/20 pt-2">
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="person-outline" size={22} color={Paleta.blanco} />
                <Text className="text-white text-[15px] font-nunito ml-3">Mi cuenta</Text>
              </Pressable>
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="settings" size={22} color={Paleta.blanco} />
                <Text className="text-white text-[15px] font-nunito ml-3">Configuración</Text>
              </Pressable>
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="help-outline" size={22} color={Paleta.blanco} />
                <Text className="text-white text-[15px] font-nunito ml-3">Ayuda</Text>
              </Pressable>
            </View>

            <View className="flex-1" />

            <Pressable
              onPress={handleLogout}
              className="flex-row items-center justify-center py-3.5 rounded-xl bg-acento active:opacity-70">
              <MaterialIcons name="logout" size={20} color={Paleta.principal} />
              <Text className="text-principal text-[15px] font-nunito-bold ml-2">Cerrar sesión</Text>
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}
