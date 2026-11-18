import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SelectorCategorias from '../components/selector-categorias';
import TarjetaReputacion, { EstrellasLectura } from '../components/tarjeta-reputacion';
import { formatearPuntaje, type Reputacion } from '../lib/reputacion';
import { obtenerPerfil, actualizarPerfil, type PerfilEmpleado } from '../lib/perfil';
import { Paleta } from '@/constants/theme';

// Edición del perfil del trabajador, incluidas las categorías en las que trabaja
// (lo que necesita el matching de Ignacio).
//
// El PUT del backend reemplaza el perfil entero, así que esta pantalla carga todos los
// campos con `GET /api/empleados/perfil` y los vuelve a mandar todos al guardar. Si
// mandara sólo las categorías, se pisarían el radio de búsqueda y las fotos.
export default function PerfilScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [perfil, setPerfil] = useState<PerfilEmpleado | null>(null);
  const [reputacion, setReputacion] = useState<Reputacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    codigo_postal: '',
    direccion: '',
    radio_busqueda: '',
    alias_cobro: '',
  });
  const [categorias, setCategorias] = useState<string[]>([]);

  useEffect(() => {
    let activo = true;

    obtenerPerfil()
      .then(({ perfil: p, reputacion: r }) => {
        if (!activo) return;
        setPerfil(p);
        setReputacion(r);
        setForm({
          nombre: p.nombre ?? '',
          apellido: p.apellido ?? '',
          codigo_postal: p.codigo_postal ?? '',
          direccion: p.direccion ?? '',
          radio_busqueda: p.radio_busqueda != null ? String(p.radio_busqueda) : '',
          alias_cobro: p.alias_cobro ?? '',
        });
        setCategorias(p.categorias ?? []);
      })
      .catch(e => activo && setError(e?.message ?? 'No pudimos cargar tu perfil.'))
      .finally(() => activo && setCargando(false));

    return () => { activo = false; };
  }, []);

  // Al volver de /metodos-cobro el método activo pudo cambiar: se relee sólo ese dato
  // (sin pisar lo que el usuario esté editando en el formulario).
  useFocusEffect(useCallback(() => {
    let activo = true;
    obtenerPerfil()
      .then(({ perfil: p }) => activo && setPerfil(prev => (prev ? { ...prev, alias_cobro: p.alias_cobro } : prev)))
      .catch(() => {});
    return () => { activo = false; };
  }, []));

  function actualizar(campo: keyof typeof form, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setGuardado(false);
  }

  async function handleGuardar() {
    setError('');
    setGuardado(false);

    if (!form.nombre || !form.apellido || !form.codigo_postal || !form.direccion) {
      setError('Completá todos los campos obligatorios.');
      return;
    }
    if (categorias.length === 0) {
      setError('Elegí al menos una categoría de trabajo.');
      return;
    }
    if (!perfil) return;
    // El método de cobro se maneja en /metodos-cobro: acá se reenvía el que ya está.
    const alias = perfil.alias_cobro?.trim() ?? '';

    setGuardando(true);
    try {
      // Se manda el formulario completo, no sólo lo que cambió: el endpoint reemplaza todo.
      const actualizado = await actualizarPerfil({
        nombre: form.nombre,
        apellido: form.apellido,
        fechaNacimiento: perfil.fecha_nacimiento,
        dni: perfil.dni,
        codigoPostal: form.codigo_postal,
        direccion: form.direccion,
        radioBusqueda: parseFloat(form.radio_busqueda) || 10,
        categorias,
        fotoUrl: perfil.foto_url,
        fotoDniUrl: perfil.foto_dni_url,
        lat: perfil.lat,
        lng: perfil.lng,
        aliasCobro: alias || null,
      });

      setPerfil(actualizado);
      setGuardado(true);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <View className="flex-1 bg-fondo items-center justify-center">
        <ActivityIndicator size="large" color={Paleta.principal} />
        <Text className="text-neutro text-sm font-nunito mt-3">Cargando tu perfil…</Text>
      </View>
    );
  }

  if (!perfil) {
    return (
      <View
        className="flex-1 bg-fondo items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <MaterialIcons name="error-outline" size={44} color={Paleta.error} />
        <Text className="text-principal text-lg font-nunito-bold text-center mt-4 mb-2">
          No pudimos abrir tu perfil
        </Text>
        <Text className="text-neutro text-sm font-nunito text-center mb-7">{error}</Text>
        <Pressable
          onPress={() => router.back()}
          className="bg-principal rounded-xl py-4 w-full items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">Volver</Text>
        </Pressable>
      </View>
    );
  }

  const inputClass =
    'bg-white rounded-[10px] px-4 py-3.5 mb-4 text-base font-nunito text-principal border border-neutro';

  return (
    <ScrollView
      className="flex-1 bg-fondo"
      contentContainerStyle={{
        paddingHorizontal: 28,
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 32,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center mb-6">
        <Pressable onPress={() => router.back()} className="p-1 -ml-1 mr-2 active:opacity-70">
          <MaterialIcons name="arrow-back" size={24} color={Paleta.principal} />
        </Pressable>
        <Text className="text-2xl font-nunito-bold text-principal">Mi cuenta</Text>
      </View>

      {/* Cabecera del perfil con el promedio de estrellas (Sprint 5) */}
      <View className="items-center mb-5">
        <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-2">
          <Text className="text-3xl font-nunito-bold text-principal">{(perfil.nombre?.[0] ?? 'U').toUpperCase()}</Text>
        </View>
        <Text className="text-principal text-lg font-nunito-bold">{perfil.nombre} {perfil.apellido}</Text>
        <View className="flex-row items-center mt-1">
          <EstrellasLectura valor={reputacion?.promedio ?? 0} tamano={16} />
          <Text className="text-principal text-sm font-nunito-semi ml-1.5">
            {reputacion?.promedio != null ? formatearPuntaje(reputacion.promedio) : 'Sin calificaciones'}
          </Text>
        </View>
        <View className="bg-principal rounded-full px-3 py-1 mt-2">
          <Text className="text-acento text-xs font-nunito-bold">Trabajador</Text>
        </View>
      </View>

      <View className="bg-white rounded-xl border border-neutro mb-6 overflow-hidden">
        {([
          ['receipt-long', 'Historial de pagos', '/pagos'],
          ['account-balance', 'Métodos de cobro', '/metodos-cobro'],
          ['notifications-none', 'Notificaciones', '/notificaciones'],
        ] as const).map(([icono, texto, ruta], i) => (
          <Pressable
            key={ruta}
            onPress={() => router.push(ruta as any)}
            className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${i > 0 ? 'border-t border-neutro/30' : ''}`}>
            <MaterialIcons name={icono} size={22} color={Paleta.principal} />
            <Text className="flex-1 text-principal text-[15px] font-nunito-semi ml-3">{texto}</Text>
            <MaterialIcons name="chevron-right" size={22} color={Paleta.neutro} />
          </Pressable>
        ))}
      </View>

      {reputacion ? (
        <>
          <Text className="text-base font-nunito-bold text-principal mb-3">Mi reputación</Text>
          <View className="mb-6">
            <TarjetaReputacion reputacion={reputacion} conComentarios />
          </View>
        </>
      ) : null}

      <Text className="text-base font-nunito-bold text-principal mb-3">Datos personales</Text>

      <TextInput
        className={inputClass}
        placeholder="Nombre/s"
        placeholderTextColor={Paleta.neutro}
        value={form.nombre}
        onChangeText={v => actualizar('nombre', v)}
      />
      <TextInput
        className={inputClass}
        placeholder="Apellido/s"
        placeholderTextColor={Paleta.neutro}
        value={form.apellido}
        onChangeText={v => actualizar('apellido', v)}
      />

      <Text className="text-base font-nunito-bold text-principal mt-2 mb-3">Dónde trabajás</Text>

      <TextInput
        className={inputClass}
        placeholder="Código postal"
        placeholderTextColor={Paleta.neutro}
        value={form.codigo_postal}
        onChangeText={v => actualizar('codigo_postal', v)}
        keyboardType="numeric"
      />
      <TextInput
        className={inputClass}
        placeholder="Dirección personal"
        placeholderTextColor={Paleta.neutro}
        value={form.direccion}
        onChangeText={v => actualizar('direccion', v)}
      />
      <TextInput
        className={inputClass}
        placeholder="Radio de búsqueda en km (por defecto 10)"
        placeholderTextColor={Paleta.neutro}
        value={form.radio_busqueda}
        onChangeText={v => actualizar('radio_busqueda', v.replace(/[^\d.]/g, ''))}
        keyboardType="numeric"
      />

      <Text className="text-base font-nunito-bold text-principal mt-2 mb-1">¿En qué trabajás?</Text>
      <Text className="text-sm text-neutro mb-3 font-nunito leading-5">
        Sólo te vamos a ofrecer trabajos de las categorías que marques.
      </Text>

      <SelectorCategorias
        seleccionadas={categorias}
        onCambiar={c => { setCategorias(c); setGuardado(false); }}
      />

      <Text className="text-base font-nunito-bold text-principal mt-2 mb-1">Cómo cobrás</Text>
      <Text className="text-sm text-neutro mb-3 font-nunito leading-5">
        Cuando terminás un trabajo te transferimos lo que cobraste (ya descontada la comisión)
        a tu método de cobro activo.
      </Text>
      <Pressable
        onPress={() => router.push('/metodos-cobro' as any)}
        className="flex-row items-center bg-white rounded-[10px] px-4 py-3.5 mb-4 border border-neutro active:opacity-70">
        <MaterialIcons name="account-balance" size={20} color={Paleta.principal} />
        <Text className={`flex-1 ml-3 text-base ${perfil.alias_cobro ? 'font-nunito-semi text-principal' : 'font-nunito text-neutro'}`} numberOfLines={1}>
          {perfil.alias_cobro || 'Agregá un CVU, CBU o alias'}
        </Text>
        <MaterialIcons name="chevron-right" size={22} color={Paleta.neutro} />
      </Pressable>

      {error ? (
        <Text className="text-error text-center mb-2 text-[13px] font-nunito">{error}</Text>
      ) : null}

      {guardado ? (
        <View className="flex-row items-center justify-center mb-2">
          <MaterialIcons name="check-circle" size={18} color={Paleta.exito} />
          <Text className="text-principal text-[13px] font-nunito-semi ml-2">Cambios guardados</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleGuardar}
        disabled={guardando}
        className="bg-principal rounded-xl py-4 items-center mt-2 active:opacity-90">
        <Text className="text-white text-base font-nunito-bold">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
