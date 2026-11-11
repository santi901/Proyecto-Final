import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import VistaFormulario from '../components/vista-formulario';
import { EstrellasLectura } from '../components/tarjeta-reputacion';
import { getUsuario } from '../auth';
import { actualizarPerfil, obtenerPerfil, type PerfilEmpleador } from '../lib/perfil';
import { formatearMonto, obtenerHistorial, type ResumenHistorial, type TrabajoHistorial } from '../lib/historial';
import { formatearPuntaje } from '../lib/reputacion';
import { Paleta, sombra } from '@/constants/theme';

// Perfil del empleador (Sprint 5): datos personales y de la dirección donde se hacen los
// trabajos, más un resumen de su actividad (publicados, gastado, promedio que puso).
// El backend no califica al empleador (solo el empleador al trabajador), por eso en vez
// de una reputación se muestra el promedio de las calificaciones que dio.
export default function PerfilEmpleadorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<PerfilEmpleador | null>(null);
  const [resumen, setResumen] = useState<ResumenHistorial | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    codigo_postal: '',
    direccion: '',
    piso_departamento: '',
    indicaciones: '',
  });

  useEffect(() => {
    let activo = true;
    getUsuario().then(u => activo && setEmail(u?.email ?? ''));
    obtenerPerfil()
      .then(p => {
        if (!activo) return;
        setPerfil(p);
        setForm({
          nombre: p.nombre ?? '',
          apellido: p.apellido ?? '',
          codigo_postal: p.codigo_postal ?? '',
          direccion: p.direccion ?? '',
          piso_departamento: p.piso_departamento ?? '',
          indicaciones: p.indicaciones ?? '',
        });
      })
      .catch(e => activo && setError(e?.message ?? 'No pudimos cargar tu perfil.'))
      .finally(() => activo && setCargando(false));
    // El resumen es un extra: si falla, el perfil se puede editar igual.
    obtenerHistorial()
      .then(h => { if (activo) { setResumen(h.resumen); setTrabajos(h.trabajos); } })
      .catch(() => {});
    return () => { activo = false; };
  }, []);

  function actualizar(campo: keyof typeof form, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }));
    setGuardado(false);
  }

  async function handleGuardar() {
    setError('');
    if (!perfil) return;
    if (!form.nombre.trim() || !form.apellido.trim() || !form.codigo_postal.trim() || !form.direccion.trim()) {
      setError('Completá nombre, apellido, código postal y dirección.');
      return;
    }
    setGuardando(true);
    try {
      const p = await actualizarPerfil({
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        fechaNacimiento: perfil.fecha_nacimiento,
        dni: perfil.dni,
        codigoPostal: form.codigo_postal.trim(),
        direccion: form.direccion.trim(),
        pisoDepartamento: form.piso_departamento.trim() || null,
        indicaciones: form.indicaciones.trim() || null,
        fotoUrl: perfil.foto_url,
        lat: perfil.lat,
        lng: perfil.lng,
      });
      setPerfil(p);
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
      <View className="flex-1 bg-fondo">
        <Encabezado titulo="Mi cuenta" alternativa="/(tabs)/ofrecer" />
        <View className="flex-1 items-center justify-center px-8">
          <MaterialIcons name="error-outline" size={44} color={Paleta.error} />
          <Text className="text-principal text-lg font-nunito-bold text-center mt-4 mb-2">No pudimos abrir tu perfil</Text>
          <Text className="text-neutro text-sm font-nunito text-center">{error}</Text>
        </View>
      </View>
    );
  }

  const calificados = trabajos.filter(t => t.calificacion);
  const promedioDado = calificados.length
    ? calificados.reduce((s, t) => s + (t.calificacion?.puntaje ?? 0), 0) / calificados.length
    : null;
  const inputClass = 'bg-white rounded-[10px] px-4 py-3.5 mb-3 text-base font-nunito text-principal';

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Mi cuenta" alternativa="/(tabs)/ofrecer" />
      <VistaFormulario
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: insets.bottom + 32 }}>
        {/* Cabecera del perfil */}
        <View className="items-center mb-5">
          <View className="w-20 h-20 rounded-full bg-acento items-center justify-center mb-2">
            <Text className="text-3xl font-nunito-bold text-principal">
              {(perfil.nombre?.[0] ?? email[0] ?? 'U').toUpperCase()}
            </Text>
          </View>
          <Text className="text-principal text-lg font-nunito-bold">{perfil.nombre} {perfil.apellido}</Text>
          <Text className="text-neutro text-sm font-nunito">{email}</Text>
          <View className="bg-principal rounded-full px-3 py-1 mt-2">
            <Text className="text-acento text-xs font-nunito-bold">Empleador</Text>
          </View>
        </View>

        {/* Resumen de actividad */}
        {resumen ? (
          <View style={sombra(Paleta.acento)} className="bg-white rounded-xl p-4 mb-5">
            <View className="flex-row">
              <Dato valor={String(resumen.total)} etiqueta="Publicados" />
              <Dato valor={String(resumen.completados)} etiqueta="Completados" />
              <Dato valor={formatearMonto(resumen.gananciaTotal)} etiqueta="Gastado" />
            </View>
            <View className="flex-row items-center justify-center mt-3 pt-3 border-t border-neutro/30">
              <EstrellasLectura valor={promedioDado ?? 0} tamano={16} />
              <Text className="text-principal text-[13px] font-nunito-semi ml-2">
                {promedioDado != null
                  ? `${formatearPuntaje(promedioDado)} de promedio en ${calificados.length} calificaci${calificados.length === 1 ? 'ón' : 'ones'} que diste`
                  : 'Todavía no calificaste a ningún trabajador'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Accesos */}
        <View style={sombra(Paleta.neutro)} className="bg-white rounded-xl mb-6 overflow-hidden">
          <Fila icono="receipt-long" texto="Historial de pagos" onPress={() => router.push('/pagos' as any)} />
          <Fila icono="event" texto="Próximos trabajos" onPress={() => router.navigate('/(tabs)/explore' as any)} borde />
          <Fila icono="notifications-none" texto="Notificaciones" onPress={() => router.push('/notificaciones' as any)} borde />
        </View>

        <Text className="text-base font-nunito-bold text-principal mb-3">Datos personales</Text>
        <TextInput className={inputClass} style={sombra(Paleta.neutro)} placeholder="Nombre/s" placeholderTextColor={Paleta.neutro}
          value={form.nombre} onChangeText={v => actualizar('nombre', v)} />
        <TextInput className={inputClass} style={sombra(Paleta.neutro)} placeholder="Apellido/s" placeholderTextColor={Paleta.neutro}
          value={form.apellido} onChangeText={v => actualizar('apellido', v)} />
        <View className="flex-row gap-3 mb-1">
          <View className="flex-1">
            <Text className="text-neutro text-xs font-nunito mb-1">DNI</Text>
            <Text className="text-principal text-base font-nunito-semi">{perfil.dni}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-neutro text-xs font-nunito mb-1">Nacimiento</Text>
            <Text className="text-principal text-base font-nunito-semi">{perfil.fecha_nacimiento?.slice(0, 10)}</Text>
          </View>
        </View>
        <Text className="text-neutro text-[11px] font-nunito mb-4">El DNI y la fecha de nacimiento no se pueden cambiar.</Text>

        <Text className="text-base font-nunito-bold text-principal mb-3">Dónde se hacen los trabajos</Text>
        <TextInput className={inputClass} style={sombra(Paleta.neutro)} placeholder="Dirección" placeholderTextColor={Paleta.neutro}
          value={form.direccion} onChangeText={v => actualizar('direccion', v)} />
        <View className="flex-row gap-3">
          <TextInput className={`${inputClass} flex-1`} style={sombra(Paleta.neutro)} placeholder="Piso / depto" placeholderTextColor={Paleta.neutro}
            value={form.piso_departamento} onChangeText={v => actualizar('piso_departamento', v)} />
          <TextInput className={`${inputClass} flex-1`} style={sombra(Paleta.neutro)} placeholder="Código postal" placeholderTextColor={Paleta.neutro}
            value={form.codigo_postal} onChangeText={v => actualizar('codigo_postal', v)} keyboardType="numeric" />
        </View>
        <TextInput
          className={`${inputClass} h-20`}
          style={[{ textAlignVertical: 'top' }, sombra(Paleta.neutro)]}
          placeholder="Indicaciones para llegar (timbre, portería…)"
          placeholderTextColor={Paleta.neutro}
          value={form.indicaciones}
          onChangeText={v => actualizar('indicaciones', v)}
          multiline
          maxLength={500}
        />

        {error ? <Text className="text-error text-center mb-2 text-[13px] font-nunito">{error}</Text> : null}
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
          <Text className="text-acento text-base font-nunito-bold">{guardando ? 'Guardando…' : 'Guardar cambios'}</Text>
        </Pressable>
      </VistaFormulario>
    </View>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-principal text-base font-nunito-bold" numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      <Text className="text-neutro text-[11px] font-nunito">{etiqueta}</Text>
    </View>
  );
}

function Fila({ icono, texto, onPress, borde }: {
  icono: keyof typeof MaterialIcons.glyphMap;
  texto: string;
  onPress: () => void;
  borde?: boolean;
}) {
  return (
    <Pressable onPress={onPress} className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${borde ? 'border-t border-neutro/30' : ''}`}>
      <MaterialIcons name={icono} size={22} color={Paleta.principal} />
      <Text className="flex-1 text-principal text-[15px] font-nunito-semi ml-3">{texto}</Text>
      <MaterialIcons name="chevron-right" size={22} color={Paleta.neutro} />
    </Pressable>
  );
}
