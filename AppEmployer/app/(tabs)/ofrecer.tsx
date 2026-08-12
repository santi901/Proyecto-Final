import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';
import { pedirUbicacion, enviarUbicacion, seguirUbicacion, type Coordenadas } from '../../lib/ubicacion';
import { crearTrabajo, guardarPinLocal } from '../../lib/trabajos';
import MapaUbicacion from '../../components/mapa-ubicacion';

type EstadoUbicacion = 'cargando' | 'ok' | 'denegado' | 'error';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_H * 0.82);
const PEEK = 250; // parte visible del panel cuando está abajo
const COLLAPSED = SHEET_HEIGHT - PEEK; // translateY cuando está bajado
const PANEL_WIDTH = Math.round(SCREEN_W * 0.78);

const CATEGORIAS = ['Limpieza', 'Mudanza', 'Jardín', 'Pintura', 'Plomería', 'Otros'];
const DIFICULTADES = ['Simple', 'Intermedio', 'Complejo'] as const;
const PRECIO_FIJO = 4500; // TODO: reemplazar por un cálculo/input real de precio

export default function OfrecerTrabajoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [titulo, setTitulo] = useState('Nuevo Trabajo');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<number | null>(null);
  const [dificultad, setDificultad] = useState<typeof DIFICULTADES[number] | null>(null);
  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState('');

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
      // Mandar al backend de Nacho (no bloquea la UI si falla la red)
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
      const estado = await iniciarUbicacion(u.id);
      if (activo && estado === 'ok') {
        detenerSeguimiento = seguirUbicacion(u.id, setCoords);
      }
    });

    return () => { activo = false; detenerSeguimiento?.(); };
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

  async function handleOfrecerTrabajo() {
    setErrorPublicar('');

    if (categoria === null) { setErrorPublicar('Elegí una categoría.'); return; }
    if (!dificultad) { setErrorPublicar('Elegí una dificultad.'); return; }
    if (!descripcion.trim()) { setErrorPublicar('Ingresá una descripción del trabajo.'); return; }
    if (!coords) { setErrorPublicar('No pudimos obtener tu ubicación. Reintentá desde el mapa.'); return; }

    setPublicando(true);
    try {
      const { trabajo, pin } = await crearTrabajo({
        titulo: titulo.trim() || 'Nuevo Trabajo',
        descripcion: descripcion.trim(),
        categoria: CATEGORIAS[categoria],
        nivelDificultad: dificultad,
        precio: PRECIO_FIJO,
        latitud: coords.lat,
        longitud: coords.lng,
      });

      await guardarPinLocal(trabajo.id, pin);

      Alert.alert(
        'Trabajo publicado',
        `Compartí este PIN con el trabajador cuando llegue, para que pueda iniciar el trabajo:\n\n${pin}\n\nTambién lo podés volver a ver en "Mis trabajos".`,
      );

      setTitulo('Nuevo Trabajo');
      setDescripcion('');
      setCategoria(null);
      setDificultad(null);
    } catch (e: any) {
      setErrorPublicar(e.message || 'No pudimos publicar el trabajo. Intentá de nuevo.');
    } finally {
      setPublicando(false);
    }
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

  // ----- Mientras se resuelve el permiso de ubicación -----
  if (ubicEstado === 'cargando') {
    return (
      <View className="flex-1 bg-[#1a1a1a] items-center justify-center px-8">
        <ActivityIndicator size="large" color="#FFD942" />
        <Text className="text-white text-base font-semibold mt-4">Obteniendo tu ubicación…</Text>
        <Text className="text-[#94a3b8] text-sm text-center mt-1">
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
            ? 'ChanguitApp usa tu ubicación para mostrar en el mapa dónde estás y asociarla a los trabajos que publicás. Sin este permiso no podés ofrecer trabajos.'
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
      {/* Fondo del mapa con la ubicación actual del empleador */}
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
          <MaterialIcons name="home" size={24} color="#1a1a1a" />
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
        <View {...pan.panHandlers} className="px-5 pt-3">
          <View className="w-10 h-1.5 rounded-full bg-[#cbd5e1] self-center mb-3" />

          <View className="flex-row items-center gap-6 border-b border-[#e2e8f0] pb-3">
            <View className="border-b-2 border-[#FFD942] pb-2">
              <Text className="text-base font-bold text-[#0f172a]">Ofrecer trabajo</Text>
            </View>
            <MaterialIcons name="favorite-border" size={22} color="#94a3b8" />
            <MaterialIcons name="history" size={22} color="#94a3b8" />
          </View>
        </View>

        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Título */}
          <Text className="text-[13px] font-semibold text-[#475569] mb-1.5">Título:</Text>
          <View className="flex-row items-center justify-between bg-[#f1f5f9] rounded-[10px] px-4 border border-[#e2e8f0] mb-5">
            <TextInput
              className="flex-1 py-3 text-base text-[#0f172a]"
              value={titulo}
              onChangeText={setTitulo}
              placeholder="Nuevo Trabajo"
              placeholderTextColor="#94a3b8"
            />
            <MaterialIcons name="edit" size={18} color="#FFD942" />
          </View>

          {/* Categoría */}
          <Text className="text-[13px] font-semibold text-[#475569] mb-2">Categoría:</Text>
          <View className="flex-row flex-wrap justify-between mb-5">
            {CATEGORIAS.map((cat, i) => {
              const sel = categoria === i;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategoria(i)}
                  className={`w-[31%] aspect-square rounded-xl mb-3 items-center justify-center border ${
                    sel ? 'border-[#FFD942] bg-[#fff8da]' : 'border-[#e2e8f0] bg-[#f1f5f9]'
                  }`}>
                  <Text className={`text-xs text-center px-1 ${sel ? 'text-[#1a1a1a] font-semibold' : 'text-[#64748b]'}`}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Descripción */}
          <Text className="text-[13px] font-semibold text-[#475569] mb-1.5">Descripción:</Text>
          <TextInput
            className="bg-[#f1f5f9] rounded-[10px] px-4 py-3 text-base text-[#0f172a] border border-[#e2e8f0] h-24 mb-3"
            style={{ textAlignVertical: 'top' }}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Ingresá una descripción detallada del trabajo, de forma que no tengan que responder a tantas dudas de parte de los trabajadores"
            placeholderTextColor="#94a3b8"
            multiline
          />

          <View className="flex-row gap-2 mb-5">
            {DIFICULTADES.map((d) => {
              const sel = dificultad === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDificultad(d)}
                  className={`flex-1 rounded-lg py-2.5 items-center border ${
                    sel ? 'bg-[#FFD942] border-[#FFD942]' : 'bg-white border-[#e2e8f0]'
                  }`}>
                  <Text className={`text-[13px] font-semibold ${sel ? 'text-[#1a1a1a]' : 'text-[#475569]'}`}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Información de pago */}
          <Text className="text-[13px] font-semibold text-[#475569] mb-1.5">Información de pago:</Text>
          <Text className="text-sm text-[#475569] mb-1">
            Dada la categoría que seleccionaste, el pago final sería de:
          </Text>
          <Text className="text-2xl font-bold text-[#0f172a] mb-3">${PRECIO_FIJO}</Text>

          <Pressable className="flex-row items-center justify-between bg-[#f1f5f9] rounded-[10px] px-4 py-3 border border-[#e2e8f0] mb-6">
            <Text className="text-base text-[#64748b]">Método de pago</Text>
            <View className="flex-row items-center gap-2">
              <View className="bg-[#e74c3c] rounded-md px-1.5 py-0.5 min-w-[22px] items-center">
                <Text className="text-white text-xs font-bold">16</Text>
              </View>
              <MaterialIcons name="keyboard-arrow-down" size={22} color="#475569" />
            </View>
          </Pressable>

          {!!errorPublicar && (
            <Text className="text-[#e74c3c] text-sm mb-3 text-center">{errorPublicar}</Text>
          )}

          {/* Botón principal */}
          <Pressable
            onPress={handleOfrecerTrabajo}
            disabled={publicando}
            className={`rounded-xl py-4 items-center ${publicando ? 'bg-[#f5e08a]' : 'bg-[#FFD942] active:opacity-90'}`}>
            {publicando ? (
              <ActivityIndicator color="#1a1a1a" />
            ) : (
              <Text className="text-[#1a1a1a] text-base font-extrabold">Ofrecer Trabajo</Text>
            )}
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
              <Text className="text-[#94a3b8] text-xs mt-1">Empleador</Text>
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
