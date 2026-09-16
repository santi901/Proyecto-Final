import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';
import {
  pedirUbicacion,
  enviarUbicacion,
  seguirUbicacion,
  distanciaKm,
  formatearDistancia,
  type Coordenadas,
} from '../../lib/ubicacion';
import { listarTrabajos, aceptarTrabajo, type Trabajo } from '../../lib/trabajos';
import MapaUbicacion from '../../components/mapa-ubicacion';
import ModalSolicitud from '../../components/modal-solicitud';
import BotonChat from '../../components/boton-chat';
import { activarNotificacionesPush } from '../../lib/notificaciones';
import { Paleta } from '@/constants/theme';

type EstadoUbicacion = 'cargando' | 'ok' | 'denegado' | 'error';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_H * 0.82);
const PEEK = 250; // parte visible del panel cuando está abajo
const COLLAPSED = SHEET_HEIGHT - PEEK; // translateY cuando está bajado
const PANEL_WIDTH = Math.round(SCREEN_W * 0.78);

export default function BuscarTrabajoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [accesoBloqueado, setAccesoBloqueado] = useState(false);

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
      setUsuario(u.email || 'Empleado');
      setUsuarioId(u.id);
      // Bloquear acceso si la identidad todavía no está verificada
      if (u.verificado === false) { setAccesoBloqueado(true); return; }
      // Con sesión activa (recién logueado o al abrir la app) se registra el token de push.
      activarNotificacionesPush();
      const estado = await iniciarUbicacion(u.id);
      if (activo && estado === 'ok') {
        detenerSeguimiento = seguirUbicacion(u.id, setCoords);
      }
    });

    return () => { activo = false; detenerSeguimiento?.(); };
  }, [router]);

  // ----- Trabajos disponibles y solicitud entrante -----
  const [trabajos, setTrabajos] = useState<Trabajo[] | null>(null);
  const [errorTrabajos, setErrorTrabajos] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [solicitud, setSolicitud] = useState<Trabajo | null>(null);
  const [aceptando, setAceptando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  // Trabajos que el trabajador ya rechazó: la búsqueda automática no se los vuelve a ofrecer.
  const rechazados = useRef<Set<string>>(new Set());

  // Trae los trabajos 'pendiente' disponibles. Se llama al obtener la ubicación,
  // desde el botón de actualizar y en cada vuelta de la búsqueda automática.
  async function cargarTrabajos(): Promise<Trabajo[] | null> {
    try {
      const { trabajos } = await listarTrabajos();
      setTrabajos(trabajos);
      setErrorTrabajos('');
      return trabajos;
    } catch (e: any) {
      setErrorTrabajos(e?.message || 'No pudimos cargar los trabajos disponibles.');
      return null;
    }
  }

  useEffect(() => {
    if (ubicEstado === 'ok') cargarTrabajos();
  }, [ubicEstado]);

  // Mientras está buscando y no hay una solicitud en pantalla, consulta al backend
  // cada 4 segundos si apareció algún trabajo que todavía no rechazó.
  useEffect(() => {
    if (!buscando || solicitud) return;

    let activo = true;

    async function consultar() {
      const disponibles = await cargarTrabajos();
      if (!activo || !disponibles) return;
      const proximo = disponibles.find(t => !rechazados.current.has(t.id));
      if (proximo) setSolicitud(proximo);
    }

    consultar();
    const reloj = setInterval(consultar, 4000);
    return () => { activo = false; clearInterval(reloj); };
  }, [buscando, solicitud]);

  async function handleAceptar(trabajo: Trabajo) {
    setAceptando(true);
    try {
      await aceptarTrabajo(trabajo.id);
      setSolicitud(null);
      setBuscando(false);
      setTrabajos(prev => prev?.filter(t => t.id !== trabajo.id) ?? prev);
      router.push({ pathname: '/trabajo-en-curso', params: { trabajoId: trabajo.id } } as any);
    } catch (e: any) {
      // Si otro trabajador lo tomó primero (o la solicitud expiró), se descarta y se sigue buscando.
      rechazados.current.add(trabajo.id);
      setSolicitud(null);
      setErrorBusqueda(e?.message ?? 'No pudimos aceptar el trabajo.');
      cargarTrabajos();
    } finally {
      setAceptando(false);
    }
  }

  function handleRechazar() {
    if (solicitud) rechazados.current.add(solicitud.id);
    setSolicitud(null);
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

  // ----- Panel deslizable -----
  const translateY = useRef(new Animated.Value(COLLAPSED)).current;
  const lastY = useRef(COLLAPSED);

  const snapTo = (to: number) => {
    Animated.spring(translateY, { toValue: to, useNativeDriver: true, bounciness: 2 }).start();
    lastY.current = to;
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        let next = lastY.current + g.dy;
        if (next < 0) next = 0;
        if (next > COLLAPSED) next = COLLAPSED;
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const current = lastY.current + g.dy;
        if (g.vy < -0.4 || current < COLLAPSED / 2) snapTo(0);
        else snapTo(COLLAPSED);
      },
    })
  ).current;

  // ----- Acceso bloqueado: la identidad no está verificada -----
  if (accesoBloqueado) {
    return (
      <View
        className="flex-1 bg-fondo items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-5">
          <MaterialIcons name="gpp-maybe" size={42} color={Paleta.principal} />
        </View>
        <Text className="text-principal text-xl font-nunito-bold text-center mb-2">Tu cuenta no está verificada</Text>
        <Text className="text-neutro text-sm font-nunito text-center mb-7 leading-5">
          Para usar ChanguitApp necesitás verificar tu identidad con tu DNI y una selfie. Todavía no pudimos confirmarla.
        </Text>
        <Pressable
          onPress={handleLogout}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  // ----- Mientras se resuelve el permiso de ubicación -----
  if (ubicEstado === 'cargando') {
    return (
      <View className="flex-1 bg-fondo items-center justify-center px-8">
        <ActivityIndicator size="large" color={Paleta.principal} />
        <Text className="text-principal text-base font-nunito-semi mt-4">Obteniendo tu ubicación…</Text>
        <Text className="text-neutro text-sm font-nunito text-center mt-1">
          Necesitamos saber dónde estás para mostrarte trabajos cerca.
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
            ? 'ChanguitApp usa tu ubicación para mostrarte trabajos cercanos y compartir tu posición con el empleador. Sin este permiso no podés usar la búsqueda.'
            : errorUbic || 'Revisá que el GPS esté activado e intentá de nuevo.'}
        </Text>

        <Pressable
          onPress={() => iniciarUbicacion(usuarioId)}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90 mb-3">
          <Text className="text-white text-base font-nunito-bold">Reintentar</Text>
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

  // ----- Permiso OK: pantalla principal con el mapa de fondo -----
  return (
    <View className="flex-1 bg-fondo">
      {/* Fondo del mapa con la ubicación actual del trabajador */}
      {coords && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <MapaUbicacion lat={coords.lat} lng={coords.lng} />
        </View>
      )}

      {/* Barra superior de iconos (sobre el mapa) */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-5"
        style={{ top: insets.top + 8 }}>
        <View className="w-11 h-11 rounded-full bg-acento items-center justify-center">
          <MaterialIcons name="place" size={24} color={Paleta.principal} />
        </View>
        <View className="flex-row gap-3">
          <BotonChat />
          <Pressable
            onPress={abrirPerfil}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-neutro active:opacity-70">
            <MaterialIcons name="person-outline" size={24} color={Paleta.principal} />
          </Pressable>
        </View>
      </View>

      {/* Panel deslizable */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: tabBarHeight,
          height: SHEET_HEIGHT,
          backgroundColor: Paleta.blanco,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 12,
        }}>
        {/* Cabecera arrastrable */}
        <View {...pan.panHandlers} className="items-center pt-3 pb-2">
          <View className="w-10 h-1.5 rounded-full bg-neutro mb-1" />
          <MaterialIcons name="keyboard-arrow-down" size={26} color={Paleta.neutro} />
        </View>

        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Botón principal: búsqueda automática con solicitud entrante */}
          <Pressable
            onPress={() => { setErrorBusqueda(''); setBuscando(b => !b); }}
            className={`rounded-xl py-4 items-center active:opacity-90 mb-3 ${
              buscando ? 'bg-white border-[1.5px] border-principal' : 'bg-principal'
            }`}>
            {buscando ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={Paleta.principal} />
                <Text className="text-principal text-base font-nunito-bold">
                  Buscando trabajos… (tocá para cancelar)
                </Text>
              </View>
            ) : (
              <Text className="text-white text-base font-nunito-bold">Buscar Trabajo</Text>
            )}
          </Pressable>

          {errorBusqueda ? (
            <Text className="text-error text-[13px] font-nunito text-center mb-3">{errorBusqueda}</Text>
          ) : null}

          {/* Trabajos disponibles */}
          <View className="flex-row items-center justify-between mt-2 mb-3">
            <Text className="text-[13px] font-nunito-semi text-principal">Trabajos disponibles</Text>
            <Pressable onPress={() => cargarTrabajos()} className="p-1 active:opacity-60">
              <MaterialIcons name="refresh" size={20} color={Paleta.principal} />
            </Pressable>
          </View>

          {trabajos === null && !errorTrabajos && (
            <View className="items-center py-8">
              <ActivityIndicator color={Paleta.principal} />
              <Text className="text-neutro text-sm font-nunito mt-3">Buscando trabajos disponibles…</Text>
            </View>
          )}

          {!!errorTrabajos && (
            <View className="items-center py-6">
              <Text className="text-error text-sm font-nunito text-center mb-3">{errorTrabajos}</Text>
              <Pressable
                onPress={() => cargarTrabajos()}
                className="px-4 py-2 rounded-lg border border-principal active:opacity-70">
                <Text className="text-principal text-sm font-nunito-semi">Reintentar</Text>
              </Pressable>
            </View>
          )}

          {trabajos !== null && !errorTrabajos && trabajos.length === 0 && (
            <View className="items-center py-8">
              <MaterialIcons name="search-off" size={32} color={Paleta.neutro} />
              <Text className="text-neutro text-sm font-nunito mt-3 text-center">
                No hay trabajos disponibles por ahora.
              </Text>
            </View>
          )}

          {trabajos !== null && trabajos.length > 0 && (
            <View className="mb-3">
              {trabajos.map(t => (
                <Pressable
                  key={t.id}
                  onPress={() => { setErrorBusqueda(''); setSolicitud(t); }}
                  className="bg-fondo-suave rounded-xl border border-neutro p-4 mb-3 active:opacity-70">
                  <View className="flex-row justify-between items-start mb-1">
                    <Text className="text-base font-nunito-bold text-principal flex-1 pr-2">{t.titulo}</Text>
                    <Text className="text-base font-nunito-bold text-principal">${t.precio}</Text>
                  </View>
                  <Text className="text-[13px] font-nunito text-neutro mb-1">
                    {t.categoria}
                    {t.nivel_dificultad ? ` · ${t.nivel_dificultad}` : ''}
                    {coords
                      ? ` · a ${formatearDistancia(distanciaKm(coords, { lat: t.latitud, lng: t.longitud }))}`
                      : ''}
                  </Text>
                  <Text className="text-sm font-nunito text-neutro" numberOfLines={2}>
                    {t.descripcion}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Ayuda + Método de cobro */}
          <View className="flex-row gap-3 mb-6">
            <Pressable className="rounded-[10px] py-3 px-5 items-center justify-center border border-principal bg-white active:opacity-70">
              <Text className="text-[15px] font-nunito-semi text-principal">Ayuda</Text>
            </Pressable>

            <Pressable className="flex-1 flex-row items-center justify-between bg-fondo-suave rounded-[10px] px-4 py-3 border border-neutro">
              <Text className="text-base font-nunito text-neutro">Método de cobro</Text>
              <MaterialIcons name="keyboard-arrow-down" size={22} color={Paleta.principal} />
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Solicitud entrante con timer */}
      <ModalSolicitud
        trabajo={aceptando ? null : solicitud}
        miUbicacion={coords}
        onAceptar={handleAceptar}
        onRechazar={handleRechazar}
        onVencer={handleRechazar}
      />

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
              <Text className="text-white/70 text-xs font-nunito mt-1">Trabajador</Text>
            </View>

            <View className="border-t border-white/20 pt-2">
              <Pressable
                onPress={() => { cerrarPerfil(); router.push('/perfil' as any); }}
                className="flex-row items-center py-3.5 active:opacity-70">
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
