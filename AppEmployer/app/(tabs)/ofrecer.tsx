import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
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
  guardarPinLocal,
  cotizacionVencida,
  type Cotizacion,
} from '../../lib/trabajos';
import { abrirCheckout } from '../../lib/pagos';
import BotonChat from '../../components/boton-chat';
import VistaFormulario from '../../components/vista-formulario';
import CampoTexto from '../../components/campo-texto';
import BotonNotificaciones from '../../components/boton-notificaciones';
import { activarNotificacionesPush } from '../../lib/notificaciones';
import {
  agregarFavorito,
  esMismoFavorito,
  listarFavoritos,
  quitarFavorito,
  type TrabajoFavorito,
} from '../../lib/favoritos';
import {
  HORAS_PROGRAMABLES,
  formatearProgramacion,
  guardarProgramacion,
  lineaProgramacion,
  proximosDias,
} from '../../lib/programados';
import { formatearFecha, formatearMonto, obtenerHistorial, type TrabajoHistorial } from '../../lib/historial';
import { Paleta, sombra } from '@/constants/theme';

type EstadoUbicacion = 'cargando' | 'ok' | 'denegado' | 'error';
type Pestana = 'crear' | 'historial' | 'favoritos';

const ESTADO_CORTO: Record<string, string> = {
  pago_pendiente: 'Falta pagar',
  pendiente: 'Buscando',
  asignado: 'Asignado',
  en_progreso: 'En curso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_WIDTH = Math.round(SCREEN_W * 0.78);

const CATEGORIAS = ['Limpieza', 'Mudanza', 'Jardín', 'Pintura', 'Plomería', 'Otros'];
const DIFICULTADES = ['Simple', 'Intermedio', 'Complejo'] as const;

// El precio no se negocia con el trabajador ni lo elige el empleador: lo calcula el
// backend (POST /api/trabajos/cotizar) según categoría, dificultad, demanda y horario.

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

  // ----- Cotización -----
  // Se pide al backend cada vez que el empleador elige categoría o dificultad (no cuando
  // se mueve la ubicación: se actualiza cada 10s y no tiene sentido recotizar por eso).
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cotizacionToken, setCotizacionToken] = useState<string | null>(null);
  const [validaHasta, setValidaHasta] = useState<string | null>(null);
  const [cotizando, setCotizando] = useState(false);
  const [errorCotizacion, setErrorCotizacion] = useState('');
  // Si se tocan dos opciones seguidas, solo cuenta la respuesta de la última.
  const ultimaCotizacion = useRef(0);

  async function pedirCotizacion(cat = categoria, dif = dificultad) {
    setCotizacion(null);
    setCotizacionToken(null);
    setErrorCotizacion('');
    if (cat === null || !dif || !coords) return;

    const pedido = ++ultimaCotizacion.current;
    setCotizando(true);
    try {
      const r = await cotizarTrabajo({
        categoria: CATEGORIAS[cat],
        nivelDificultad: dif,
        latitud: coords.lat,
        longitud: coords.lng,
      });
      if (pedido !== ultimaCotizacion.current) return;
      setCotizacion(r.cotizacion);
      setCotizacionToken(r.cotizacionToken);
      setValidaHasta(r.validaHasta);
    } catch (e: any) {
      if (pedido === ultimaCotizacion.current) setErrorCotizacion(e?.message ?? 'No pudimos calcular el precio.');
    } finally {
      if (pedido === ultimaCotizacion.current) setCotizando(false);
    }
  }

  function elegirCategoria(i: number) {
    setCategoria(i);
    pedirCotizacion(i, dificultad);
  }

  function elegirDificultad(d: typeof DIFICULTADES[number]) {
    setDificultad(d);
    pedirCotizacion(categoria, d);
  }

  // ----- Pestañas del home: crear trabajo / historial / favoritos (Sprint 5) -----
  const [pestana, setPestana] = useState<Pestana>('crear');

  // Favoritos: plantillas de trabajos que el empleador repite (guardadas en el teléfono).
  const [favoritos, setFavoritos] = useState<TrabajoFavorito[]>([]);
  const [avisoFavorito, setAvisoFavorito] = useState('');

  useEffect(() => {
    if (usuarioId) listarFavoritos(usuarioId).then(setFavoritos);
  }, [usuarioId]);

  const favoritoActual =
    categoria !== null
      ? favoritos.find(f => esMismoFavorito(f, { titulo, categoria: CATEGORIAS[categoria] }))
      : undefined;

  async function alternarFavorito() {
    setAvisoFavorito('');
    if (!usuarioId) return;
    if (favoritoActual) {
      setFavoritos(await quitarFavorito(usuarioId, favoritoActual.id));
      setAvisoFavorito('Lo sacaste de favoritos.');
      return;
    }
    if (!titulo.trim() || categoria === null || !descripcion.trim() || !dificultad) {
      setAvisoFavorito('Completá título, categoría, descripción y dificultad para guardarlo como favorito.');
      return;
    }
    setFavoritos(await agregarFavorito(usuarioId, {
      titulo, categoria: CATEGORIAS[categoria], descripcion, dificultad,
    }));
    setAvisoFavorito('¡Guardado en favoritos! Lo encontrás en la pestaña del corazón.');
  }

  function usarFavorito(f: TrabajoFavorito) {
    const i = CATEGORIAS.indexOf(f.categoria);
    setTitulo(f.titulo);
    setDescripcion(f.descripcion);
    setCategoria(i >= 0 ? i : null);
    setDificultad(f.dificultad);
    setAvisoFavorito('');
    setErrorPublicar('');
    setPestana('crear');
    // El precio no se guarda en el favorito: se vuelve a cotizar ahora.
    pedirCotizacion(i >= 0 ? i : null, f.dificultad);
  }

  async function borrarFavorito(id: string) {
    if (usuarioId) setFavoritos(await quitarFavorito(usuarioId, id));
  }

  // Historial resumido: los últimos trabajos, para no tener que salir del home.
  const [recientes, setRecientes] = useState<TrabajoHistorial[] | null>(null);
  const [errorRecientes, setErrorRecientes] = useState('');

  const cargarRecientes = useCallback(async () => {
    setErrorRecientes('');
    try {
      const { trabajos } = await obtenerHistorial();
      setRecientes(trabajos.slice(0, 5));
    } catch (e: any) {
      setErrorRecientes(e?.message ?? 'No pudimos cargar tu historial.');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (pestana === 'historial') cargarRecientes();
  }, [pestana, cargarRecientes]));

  // ----- Trabajo programado (Sprint 6) -----
  const [programar, setProgramar] = useState(false);
  const [diaProgramado, setDiaProgramado] = useState(0);
  const [horaProgramada, setHoraProgramada] = useState<number | null>(null);
  // Se calcula una vez (no en cada render): leer el reloj en el render no es puro.
  const [dias] = useState(proximosDias);

  function fechaProgramada(): Date | null {
    if (!programar || horaProgramada === null) return null;
    const d = new Date(dias[diaProgramado]);
    d.setHours(horaProgramada, 0, 0, 0);
    return d;
  }

  // ----- Publicación del trabajo -----
  const [publicando, setPublicando] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState('');

  const precio = cotizacion?.precio ?? null;

  // Crea el trabajo, abre el checkout de MercadoPago y salta al seguimiento (que muestra
  // si el pago se acreditó y permite reintentarlo). El trabajo recién se publica para
  // los trabajadores cuando MP confirma el pago.
  // El backend devuelve el PIN una sola vez, acá: se guarda en el dispositivo para
  // poder mostrarlo en el seguimiento y en "Mis trabajos".
  async function handleOfrecer() {
    setErrorPublicar('');

    if (!titulo.trim()) { setErrorPublicar('Poné un título al trabajo.'); return; }
    if (categoria === null) { setErrorPublicar('Elegí una categoría.'); return; }
    if (!descripcion.trim()) { setErrorPublicar('Escribí una descripción.'); return; }
    if (!dificultad) { setErrorPublicar('Elegí la dificultad del trabajo.'); return; }
    if (!coords) { setErrorPublicar('No pudimos obtener tu ubicación. Reintentá desde el mapa.'); return; }
    const programado = fechaProgramada();
    if (programar && !programado) { setErrorPublicar('Elegí el día y la hora del trabajo programado.'); return; }
    if (programado && programado.getTime() < Date.now() + 30 * 60_000) {
      setErrorPublicar('El trabajo programado tiene que ser al menos dentro de 30 minutos.');
      return;
    }
    if (!cotizacionToken || precio === null) {
      setErrorPublicar(cotizando ? 'Esperá a que termine de calcularse el precio.' : 'No pudimos calcular el precio. Reintentá.');
      if (!cotizando) pedirCotizacion();
      return;
    }
    // Si la cotización venció, el precio puede haber cambiado: se recalcula y se le
    // pide al empleador que lo revise antes de pagar, en vez de cobrar otro monto sin avisar.
    if (!validaHasta || cotizacionVencida(validaHasta)) {
      await pedirCotizacion();
      setErrorPublicar('Actualizamos el precio. Revisalo y volvé a tocar "Ofrecer y pagar".');
      return;
    }

    setPublicando(true);
    try {
      // La fecha programada viaja en la descripción (el backend todavía no tiene el campo):
      // así el trabajador la ve antes de aceptar. Ver lib/programados.ts.
      const textoProgramado = programado ? lineaProgramacion(programado) : '';
      const { trabajo, pin, pago } = await crearTrabajo({
        titulo: titulo.trim(),
        descripcion: (descripcion.trim().slice(0, 1000 - textoProgramado.length) + textoProgramado),
        cotizacionToken,
      });

      await guardarPinLocal(trabajo.id, pin);
      if (programado) await guardarProgramacion(trabajo.id, programado);

      setTitulo('Nuevo Trabajo');
      setDescripcion('');
      setCategoria(null);
      setDificultad(null);
      setCotizacion(null);
      setCotizacionToken(null);
      setProgramar(false);
      setHoraProgramada(null);
      setAvisoFavorito('');

      // Modo demo: el pago se hace en la pantalla de checkout de la app.
      if (pago.simulado || !pago.checkoutUrl) {
        router.push({
          pathname: '/checkout',
          params: { trabajoId: trabajo.id, monto: String(pago.monto), titulo: trabajo.titulo },
        } as any);
        return;
      }

      // Se espera a que el usuario vuelva del checkout (pague o no): el seguimiento
      // consulta el estado del pago al abrirse.
      try {
        await abrirCheckout(pago.checkoutUrl);
      } catch (e: any) {
        console.log('No se pudo abrir el checkout:', e?.message);
      }

      router.push({ pathname: '/seguimiento', params: { trabajoId: trabajo.id } } as any);
    } catch (e: any) {
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
          <BotonNotificaciones />
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
            {(['crear', 'favoritos', 'historial'] as Pestana[]).map(p => {
              const activa = pestana === p;
              const etiqueta = p === 'crear' ? 'Ofrecer trabajo' : p === 'favoritos' ? 'Favoritos' : 'Historial';
              const icono = p === 'crear' ? 'add-circle-outline' : p === 'favoritos' ? 'favorite' : 'history';
              return activa ? (
                <View
                  key={p}
                  style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomRightRadius: 24, borderBottomLeftRadius: 24 }}
                  className="bg-principal px-6 items-center justify-center">
                  <Text className="text-acento text-[15px] font-nunito-bold">{etiqueta}</Text>
                </View>
              ) : (
                <Pressable
                  key={p}
                  onPress={() => setPestana(p)}
                  accessibilityLabel={etiqueta}
                  className="flex-1 items-center justify-center active:opacity-60">
                  <MaterialIcons name={icono} size={21} color={Paleta.principal} />
                  {p === 'favoritos' && favoritos.length > 0 ? (
                    <Text className="text-[10px] font-nunito-bold text-principal">{favoritos.length}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {pestana === 'favoritos' ? (
          <View style={sombra(Paleta.acento)} className="rounded-b-[24px] bg-fondo-suave px-5 pt-5 pb-6 mb-6">
            <Text className="text-base font-nunito-bold text-principal mb-1">Tus trabajos favoritos</Text>
            <Text className="text-[13px] font-nunito text-neutro mb-4 leading-[18px]">
              Guardá los pedidos que repetís con el corazón del formulario y publicalos de nuevo con un toque.
              El precio se vuelve a calcular al publicar.
            </Text>
            {favoritos.length === 0 ? (
              <View className="items-center py-6">
                <MaterialIcons name="favorite-border" size={32} color={Paleta.neutro} />
                <Text className="text-neutro text-sm font-nunito text-center mt-2">Todavía no guardaste favoritos.</Text>
              </View>
            ) : (
              favoritos.map(f => (
                <View key={f.id} style={sombra(Paleta.neutro, 0.5)} className="bg-white rounded-xl p-4 mb-3">
                  <View className="flex-row items-start">
                    <View className="flex-1 pr-2">
                      <Text className="text-base font-nunito-bold text-principal" numberOfLines={1}>{f.titulo}</Text>
                      <Text className="text-[12px] font-nunito text-neutro">{f.categoria} · {f.dificultad}</Text>
                    </View>
                    <Pressable onPress={() => borrarFavorito(f.id)} hitSlop={8} className="p-1 active:opacity-60">
                      <MaterialIcons name="delete-outline" size={20} color={Paleta.error} />
                    </Pressable>
                  </View>
                  <Text className="text-[13px] font-nunito text-principal mt-1" numberOfLines={2}>{f.descripcion}</Text>
                  <Pressable
                    onPress={() => usarFavorito(f)}
                    className="bg-principal rounded-lg py-2.5 items-center mt-3 active:opacity-90">
                    <Text className="text-acento text-sm font-nunito-bold">Usar este trabajo</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        ) : null}

        {pestana === 'historial' ? (
          <View style={sombra(Paleta.acento)} className="rounded-b-[24px] bg-fondo-suave px-5 pt-5 pb-6 mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-nunito-bold text-principal">Últimos trabajos</Text>
              <Pressable onPress={cargarRecientes} hitSlop={8} className="p-1 active:opacity-60">
                <MaterialIcons name="refresh" size={20} color={Paleta.principal} />
              </Pressable>
            </View>
            {recientes === null && !errorRecientes ? (
              <ActivityIndicator color={Paleta.principal} className="py-6" />
            ) : null}
            {errorRecientes ? (
              <Text className="text-error text-sm font-nunito text-center py-4">{errorRecientes}</Text>
            ) : null}
            {recientes && recientes.length === 0 ? (
              <Text className="text-neutro text-sm font-nunito text-center py-6">Todavía no publicaste trabajos.</Text>
            ) : null}
            {recientes?.map(t => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/seguimiento', params: { trabajoId: t.id } } as any)}
                style={sombra(Paleta.neutro, 0.5)}
                className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-2.5 active:opacity-70">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-nunito-bold text-principal" numberOfLines={1}>{t.titulo}</Text>
                  <Text className="text-[12px] font-nunito text-neutro">
                    {ESTADO_CORTO[t.estado] ?? t.estado} · {formatearFecha(t.fecha)}
                  </Text>
                </View>
                <Text className="text-sm font-nunito-bold text-principal">{formatearMonto(t.precio)}</Text>
              </Pressable>
            ))}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => router.navigate('/(tabs)/historial' as any)}
                className="flex-1 bg-principal rounded-xl py-3 items-center active:opacity-90">
                <Text className="text-acento text-sm font-nunito-bold">Historial completo</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/pagos' as any)}
                style={sombra(Paleta.principal, 0.75)}
                className="flex-1 bg-white rounded-xl py-3 items-center active:opacity-70">
                <Text className="text-principal text-sm font-nunito-bold">Mis pagos</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Capa 3: el contenedor con TODO lo que el empleador carga (título, categoría,
            descripción, dificultad, pago, medio de pago). Pegado a las pestañas, sin
            espacio entre ambos, para que se lean como una sola pieza. */}
        {pestana === 'crear' ? (<>
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
              onPress={alternarFavorito}
              accessibilityLabel={favoritoActual ? 'Quitar de favoritos' : 'Guardar en favoritos'}
              style={sombra(Paleta.neutro)}
              className="w-9 h-9 rounded-full bg-white items-center justify-center active:opacity-70">
              <MaterialIcons
                name={favoritoActual ? 'favorite' : 'favorite-border'}
                size={16}
                color={favoritoActual ? Paleta.error : Paleta.principal}
              />
            </Pressable>
          </View>
          {avisoFavorito ? (
            <Text className="text-[12px] font-nunito text-principal -mt-3 mb-4">{avisoFavorito}</Text>
          ) : null}

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

          {/* Cuándo: ahora o programado para otro día/hora (Sprint 6) */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-2">¿Cuándo?</Text>
          <View style={sombra(Paleta.neutro)} className="rounded-[13px] mb-3">
            <View className="flex-row overflow-hidden rounded-[13px] bg-white">
              {[false, true].map(p => (
                <Pressable
                  key={String(p)}
                  onPress={() => setProgramar(p)}
                  className={`flex-1 flex-row items-center justify-center py-3 active:opacity-70 ${programar === p ? 'bg-acento' : 'bg-white'}`}>
                  <MaterialIcons name={p ? 'event' : 'bolt'} size={16} color={Paleta.principal} />
                  <Text className="text-[13px] font-nunito-semi text-principal ml-1">{p ? 'Programar' : 'Lo antes posible'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {programar ? (
            <View className="mb-5">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {dias.map((d, i) => {
                  const sel = diaProgramado === i;
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => setDiaProgramado(i)}
                      style={sel ? undefined : sombra(Paleta.neutro, 0.5)}
                      className={`w-14 py-2 rounded-xl items-center ${sel ? 'bg-principal' : 'bg-white'}`}>
                      <Text className={`text-[11px] font-nunito ${sel ? 'text-acento' : 'text-neutro'}`}>
                        {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : NOMBRE_DIA[d.getDay()]}
                      </Text>
                      <Text className={`text-base font-nunito-bold ${sel ? 'text-acento' : 'text-principal'}`}>{d.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
                {HORAS_PROGRAMABLES.map(h => {
                  const sel = horaProgramada === h;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => setHoraProgramada(h)}
                      style={sel ? undefined : sombra(Paleta.neutro, 0.5)}
                      className={`px-3 py-2 rounded-full ${sel ? 'bg-acento' : 'bg-white'}`}>
                      <Text className="text-[13px] font-nunito-semi text-principal">{String(h).padStart(2, '0')}:00</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text className="text-[12px] font-nunito text-neutro mt-1">
                {fechaProgramada()
                  ? `Se publica ahora para el ${formatearProgramacion(fechaProgramada()!)}. El trabajador ve la fecha antes de aceptar.`
                  : 'Elegí el día y la hora.'}
              </Text>
            </View>
          ) : <View className="mb-2" />}

          {/* Pago final: lo calcula el backend, el empleador no lo puede editar */}
          <View style={sombra(Paleta.acento)} className="rounded-xl bg-white px-5 py-5 mb-5">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-base font-nunito-bold text-principal">Pago final:</Text>
              <View className="flex-row items-center">
                <MaterialIcons name="lock-outline" size={13} color={Paleta.neutro} />
                <Text className="text-[11px] font-nunito text-neutro ml-0.5">Automático · no editable</Text>
              </View>
            </View>
            {cotizando ? (
              <View className="flex-row items-center gap-2 py-1">
                <ActivityIndicator size="small" color={Paleta.principal} />
                <Text className="text-sm font-nunito text-neutro">Calculando precio…</Text>
              </View>
            ) : errorCotizacion ? (
              <Pressable onPress={() => pedirCotizacion()} className="active:opacity-70">
                <Text className="text-sm font-nunito text-error">{errorCotizacion}</Text>
                <Text className="text-sm font-nunito-semi text-principal underline mt-1">Reintentar</Text>
              </Pressable>
            ) : (
              <Text className="text-2xl font-nunito-bold text-principal">
                {precio !== null
                  ? `$${precio}`
                  : categoria === null
                  ? 'Elegí la categoría'
                  : 'Elegí la dificultad'}
              </Text>
            )}
            {cotizacion && !cotizando ? (
              <View className="mt-1">
                {cotizacion.desglose.multiplicadorDemanda > 1 ? (
                  <Text className="text-xs font-nunito text-neutro">
                    Incluye recargo por alta demanda en tu zona (×{cotizacion.desglose.multiplicadorDemanda}).
                  </Text>
                ) : null}
                {cotizacion.desglose.multiplicadorHorario > 1 ? (
                  <Text className="text-xs font-nunito text-neutro">
                    Incluye recargo nocturno / de domingo (×{cotizacion.desglose.multiplicadorHorario}).
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Medio de pago: lo elige el empleador en el checkout de MercadoPago */}
          <View style={sombra(Paleta.neutro)} className="flex-row items-start bg-white rounded-[10px] px-4 py-3.5">
            <MaterialIcons name="lock-outline" size={18} color={Paleta.principal} />
            <Text className="flex-1 text-xs font-nunito text-neutro ml-2 leading-4">
              Pagás con MercadoPago al publicar. Guardamos el pago hasta que el trabajo termine, y si
              nadie lo toma te lo devolvemos completo.
            </Text>
          </View>
        </View>

        {errorPublicar ? (
          <Text className="text-error text-[13px] font-nunito text-center mb-3">{errorPublicar}</Text>
        ) : null}

        {/* Capa 2 (cont.): el botón de Ofrecer Trabajo también es de esta capa, no del
            contenedor de datos — por eso va aparte, no pegado al rectángulo de arriba. */}
        <Pressable
          onPress={handleOfrecer}
          disabled={publicando}
          className="bg-principal rounded-xl py-4 items-center active:opacity-90">
          {publicando ? (
            <ActivityIndicator color={Paleta.acento} />
          ) : (
            <Text className="text-acento text-base font-nunito-bold">
              {precio !== null ? `Ofrecer y pagar $${precio}` : 'Ofrecer Trabajo'}
            </Text>
          )}
        </Pressable>
        </>) : null}
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
              {([
                ['person-outline', 'Mi cuenta', '/perfil'],
                ['receipt-long', 'Mis pagos', '/pagos'],
                ['notifications-none', 'Notificaciones', '/notificaciones'],
              ] as const).map(([icono, texto, ruta]) => (
                <Pressable
                  key={ruta}
                  onPress={() => { cerrarPerfil(); router.push(ruta as any); }}
                  className="flex-row items-center py-3.5 active:opacity-70">
                  <MaterialIcons name={icono} size={22} color={Paleta.blanco} />
                  <Text className="text-white text-[15px] font-nunito ml-3">{texto}</Text>
                </Pressable>
              ))}
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
