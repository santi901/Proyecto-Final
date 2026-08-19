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
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUsuario, logout as authLogout } from '../../auth';
import { pedirUbicacion, enviarUbicacion, type Coordenadas } from '../../lib/ubicacion';
import MapaUbicacion from '../../components/mapa-ubicacion';
import { crearTrabajo } from '../../lib/trabajo';
import { CATEGORIAS } from '../../lib/categorias';
import { DIFICULTADES, precioPara, type Dificultad } from '../../lib/precios';
import { Paleta } from '@/constants/theme';

type EstadoUbicacion = 'cargando' | 'ok' | 'denegado' | 'error';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_H * 0.82);
const PEEK = 250; // parte visible del panel cuando está abajo
const COLLAPSED = SHEET_HEIGHT - PEEK; // translateY cuando está bajado
const PANEL_WIDTH = Math.round(SCREEN_W * 0.78);

export default function OfrecerTrabajoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [titulo, setTitulo] = useState('Nuevo Trabajo');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<number | null>(null);
  const [dificultad, setDificultad] = useState<Dificultad | null>(null);
  const [usuario, setUsuario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [perfilAbierto, setPerfilAbierto] = useState(false);

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
      setUsuario(u.email || 'Empleador');
      setUsuarioId(u.id);
      iniciarUbicacion(u.id);
    });
    return () => { activo = false; };
  }, [router]);

  // ----- Publicación del trabajo -----
  const [publicando, setPublicando] = useState(false);
  const [errorPublicar, setErrorPublicar] = useState('');

  const precio = precioPara(dificultad);

  // Publica el trabajo y salta al seguimiento. El PIN viaja por parámetro porque el
  // backend lo devuelve una sola vez, acá: no hay forma de volver a pedirlo después.
  async function handleOfrecer() {
    setErrorPublicar('');

    if (!titulo.trim()) { setErrorPublicar('Poné un título al trabajo.'); return; }
    if (categoria === null) { setErrorPublicar('Elegí una categoría.'); return; }
    if (!descripcion.trim()) { setErrorPublicar('Escribí una descripción.'); return; }
    if (!dificultad || precio === null) { setErrorPublicar('Elegí la dificultad del trabajo.'); return; }

    setPublicando(true);
    try {
      const { trabajo, pin } = await crearTrabajo({
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        categoria: CATEGORIAS[categoria],
        nivelDificultad: dificultad,
        precio,
      });

      router.push({ pathname: '/seguimiento', params: { trabajoId: trabajo.id, pin } } as any);
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
        <View className="w-11 h-11 rounded-full bg-acento items-center justify-center">
          <MaterialIcons name="home" size={24} color={Paleta.principal} />
        </View>
        <View className="flex-row gap-3">
          <View className="w-11 h-11 rounded-full bg-white items-center justify-center border border-neutro">
            <MaterialIcons name="chat-bubble-outline" size={22} color={Paleta.principal} />
          </View>
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
        <View {...pan.panHandlers} className="px-5 pt-3">
          <View className="w-10 h-1.5 rounded-full bg-neutro self-center mb-3" />

          <View className="flex-row items-center gap-6 border-b border-neutro pb-3">
            <View className="border-b-2 border-acento pb-2">
              <Text className="text-base font-nunito-bold text-principal">Ofrecer trabajo</Text>
            </View>
            <MaterialIcons name="favorite-border" size={22} color={Paleta.neutro} />
            <MaterialIcons name="history" size={22} color={Paleta.neutro} />
          </View>
        </View>

        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Título */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Título:</Text>
          <View className="flex-row items-center justify-between bg-white rounded-[10px] px-4 border border-neutro mb-5">
            <TextInput
              className="flex-1 py-3 text-base font-nunito text-principal"
              value={titulo}
              onChangeText={setTitulo}
              placeholder="Nuevo Trabajo"
              placeholderTextColor={Paleta.neutro}
            />
            <MaterialIcons name="edit" size={18} color={Paleta.principal} />
          </View>

          {/* Categoría */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-2">Categoría:</Text>
          <View className="flex-row flex-wrap justify-between mb-5">
            {CATEGORIAS.map((cat, i) => {
              const sel = categoria === i;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategoria(i)}
                  className={`w-[31%] aspect-square rounded-xl mb-3 items-center justify-center border ${
                    sel ? 'border-principal bg-acento' : 'border-neutro bg-fondo-suave'
                  }`}>
                  <Text
                    className={`text-xs text-center px-1 ${
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
          <TextInput
            className="bg-white rounded-[10px] px-4 py-3 text-base font-nunito text-principal border border-neutro h-24 mb-3"
            style={{ textAlignVertical: 'top' }}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Ingresá una descripción detallada del trabajo, de forma que no tengan que responder a tantas dudas de parte de los trabajadores"
            placeholderTextColor={Paleta.neutro}
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
                    sel ? 'bg-acento border-principal' : 'bg-white border-neutro'
                  }`}>
                  <Text
                    className={`text-[13px] font-nunito-semi ${sel ? 'text-principal' : 'text-neutro'}`}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Información de pago */}
          <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Información de pago:</Text>
          <Text className="text-sm font-nunito text-neutro mb-1">
            Dada la dificultad que seleccionaste, el pago final sería de:
          </Text>
          <Text className="text-2xl font-nunito-bold text-principal mb-3">
            {precio !== null ? `$${precio}` : 'Elegí la dificultad'}
          </Text>

          <Pressable className="flex-row items-center justify-between bg-fondo-suave rounded-[10px] px-4 py-3 border border-neutro mb-6">
            <Text className="text-base font-nunito text-neutro">Método de pago</Text>
            <View className="flex-row items-center gap-2">
              <View className="bg-error rounded-md px-1.5 py-0.5 min-w-[22px] items-center">
                <Text className="text-white text-xs font-nunito-bold">16</Text>
              </View>
              <MaterialIcons name="keyboard-arrow-down" size={22} color={Paleta.principal} />
            </View>
          </Pressable>

          {errorPublicar ? (
            <Text className="text-error text-[13px] font-nunito text-center mb-3">{errorPublicar}</Text>
          ) : null}

          {/* Botón principal */}
          <Pressable
            onPress={handleOfrecer}
            disabled={publicando}
            className="bg-principal rounded-xl py-4 items-center active:opacity-90">
            <Text className="text-white text-base font-nunito-bold">
              {publicando ? 'Publicando…' : 'Ofrecer Trabajo'}
            </Text>
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
