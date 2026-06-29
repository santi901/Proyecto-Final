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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';
import { pedirUbicacion, enviarUbicacion, type Coordenadas } from '../../lib/ubicacion';
import MapaUbicacion from '../../components/mapa-ubicacion';

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

  const [seleccion, setSeleccion] = useState<number | null>(null);
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
  async function iniciarUbicacion(userId: string) {
    setUbicEstado('cargando');
    setErrorUbic('');

    const r = await pedirUbicacion();

    if (r.estado === 'ok') {
      setCoords(r.coords);
      setUbicEstado('ok');
      // Mandar al backend de Nacho (no bloquea la UI si falla la red / el endpoint aún no existe)
      enviarUbicacion(r.coords, userId).catch(e =>
        console.log('No se pudo enviar la ubicación:', e?.message),
      );
    } else if (r.estado === 'denegado') {
      setUbicEstado('denegado');
    } else {
      setErrorUbic(r.mensaje);
      setUbicEstado('error');
    }
  }

  // Solo accesible con sesión activa. Con sesión OK, arranca el flujo de ubicación.
  useEffect(() => {
    let activo = true;
    getUsuario().then(u => {
      if (!activo) return;
      if (!u) { router.replace('/'); return; }
      setUsuario(u.email || 'Empleado');
      setUsuarioId(u.id);
      // Bloquear acceso si la identidad todavía no está verificada
      if (u.verificado === false) { setAccesoBloqueado(true); return; }
      iniciarUbicacion(u.id);
    });
    return () => { activo = false; };
  }, [router]);

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
        className="flex-1 bg-[#1a1a1a] items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-[#262626] items-center justify-center mb-5">
          <MaterialIcons name="gpp-maybe" size={42} color="#FFD942" />
        </View>
        <Text className="text-white text-xl font-bold text-center mb-2">Tu cuenta no está verificada</Text>
        <Text className="text-[#94a3b8] text-sm text-center mb-7 leading-5">
          Para usar ChanguitApp necesitás verificar tu identidad con tu DNI y una selfie. Todavía no pudimos confirmarla.
        </Text>
        <Pressable
          onPress={handleLogout}
          className="bg-[#FFD942] rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-[#1a1a1a] text-base font-extrabold">Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  // ----- Mientras se resuelve el permiso de ubicación -----
  if (ubicEstado === 'cargando') {
    return (
      <View className="flex-1 bg-[#1a1a1a] items-center justify-center px-8">
        <ActivityIndicator size="large" color="#FFD942" />
        <Text className="text-white text-base font-semibold mt-4">Obteniendo tu ubicación…</Text>
        <Text className="text-[#94a3b8] text-sm text-center mt-1">
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
        className="flex-1 bg-[#1a1a1a] items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="w-20 h-20 rounded-full bg-[#262626] items-center justify-center mb-5">
          <MaterialIcons name="location-off" size={40} color="#FFD942" />
        </View>
        <Text className="text-white text-xl font-bold text-center mb-2">
          {denegado ? 'Necesitamos tu ubicación' : 'No pudimos obtener tu ubicación'}
        </Text>
        <Text className="text-[#94a3b8] text-sm text-center mb-7 leading-5">
          {denegado
            ? 'ChanguitApp usa tu ubicación para mostrarte trabajos cercanos y compartir tu posición con el empleador. Sin este permiso no podés usar la búsqueda.'
            : errorUbic || 'Revisá que el GPS esté activado e intentá de nuevo.'}
        </Text>

        <Pressable
          onPress={() => iniciarUbicacion(usuarioId)}
          className="bg-[#FFD942] rounded-xl py-4 w-full items-center active:opacity-90 mb-3">
          <Text className="text-[#1a1a1a] text-base font-extrabold">Reintentar</Text>
        </Pressable>

        {denegado && (
          <Pressable onPress={() => Linking.openSettings()} className="py-2 items-center">
            <Text className="text-[#FFD942] text-sm font-semibold underline">
              Abrir configuración del teléfono
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ----- Permiso OK: pantalla principal con el mapa de fondo -----
  return (
    <View className="flex-1 bg-[#e5e7eb]">
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
        <View className="w-11 h-11 rounded-full bg-[#FFD942] items-center justify-center">
          <MaterialIcons name="place" size={24} color="#1a1a1a" />
        </View>
        <View className="flex-row gap-3">
          <View className="w-11 h-11 rounded-full bg-white items-center justify-center border border-[#e2e8f0]">
            <MaterialIcons name="chat-bubble-outline" size={22} color="#475569" />
          </View>
          <Pressable
            onPress={abrirPerfil}
            className="w-11 h-11 rounded-full bg-white items-center justify-center border border-[#e2e8f0] active:opacity-70">
            <MaterialIcons name="person-outline" size={24} color="#475569" />
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
          backgroundColor: '#ffffff',
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
          <View className="w-10 h-1.5 rounded-full bg-[#cbd5e1] mb-1" />
          <MaterialIcons name="keyboard-arrow-down" size={26} color="#94a3b8" />
        </View>

        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Grilla de opciones */}
          <View className="flex-row flex-wrap justify-between mb-5">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const sel = seleccion === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSeleccion(i)}
                  className={`w-[31%] aspect-[4/3] rounded-xl mb-3 border ${
                    sel ? 'border-[#FFD942] bg-[#fff8da]' : 'border-[#e2e8f0] bg-[#f1f5f9]'
                  }`}>
                  <View className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#94a3b8] items-center justify-center">
                    <Text className="text-white text-[9px] font-bold">i</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Ayuda + Método de cobro */}
          <View className="flex-row gap-3 mb-6">
            <Pressable className="rounded-[10px] py-3 px-5 items-center justify-center border border-[#e2e8f0] bg-white active:opacity-70">
              <Text className="text-[15px] text-[#475569] font-medium">Ayuda</Text>
            </Pressable>

            <Pressable className="flex-1 flex-row items-center justify-between bg-[#f1f5f9] rounded-[10px] px-4 py-3 border border-[#e2e8f0]">
              <Text className="text-base text-[#64748b]">Método de cobro</Text>
              <MaterialIcons name="keyboard-arrow-down" size={22} color="#475569" />
            </Pressable>
          </View>

          {/* Botón principal */}
          <Pressable className="bg-[#FFD942] rounded-xl py-4 items-center active:opacity-90">
            <Text className="text-[#1a1a1a] text-base font-extrabold">Buscar Trabajo</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>

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
              backgroundColor: '#1a1a1a',
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
              <Text className="text-white text-lg font-bold">Mi perfil</Text>
              <Pressable onPress={cerrarPerfil} className="p-1 active:opacity-70">
                <MaterialIcons name="close" size={24} color="#94a3b8" />
              </Pressable>
            </View>

            <View className="items-center mb-6">
              <View className="w-20 h-20 rounded-full bg-[#FFD942] items-center justify-center mb-3">
                <Text className="text-3xl font-black text-[#1a1a1a]">
                  {usuario ? usuario[0].toUpperCase() : 'U'}
                </Text>
              </View>
              <Text className="text-white text-base font-semibold" numberOfLines={1}>{usuario}</Text>
              <Text className="text-[#94a3b8] text-xs mt-1">Trabajador</Text>
            </View>

            <View className="border-t border-[#3a3a3a] pt-2">
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="person-outline" size={22} color="#cbd5e1" />
                <Text className="text-[#cbd5e1] text-[15px] ml-3">Mi cuenta</Text>
              </Pressable>
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="settings" size={22} color="#cbd5e1" />
                <Text className="text-[#cbd5e1] text-[15px] ml-3">Configuración</Text>
              </Pressable>
              <Pressable className="flex-row items-center py-3.5 active:opacity-70">
                <MaterialIcons name="help-outline" size={22} color="#cbd5e1" />
                <Text className="text-[#cbd5e1] text-[15px] ml-3">Ayuda</Text>
              </Pressable>
            </View>

            <View className="flex-1" />

            <Pressable
              onPress={handleLogout}
              className="flex-row items-center justify-center py-3.5 rounded-xl border border-[#e74c3c] active:opacity-70">
              <MaterialIcons name="logout" size={20} color="#e74c3c" />
              <Text className="text-[#e74c3c] text-[15px] font-semibold ml-2">Cerrar sesión</Text>
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}
