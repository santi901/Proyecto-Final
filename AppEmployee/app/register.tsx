import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabaseClient';
import { useRouter } from 'expo-router';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    password2: '',
    fecha_nacimiento: '',
    dni: '',
    codigo_postal: '',
    direccion: '',
    radio_busqueda: '',
  });

  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [fotoDni, setFotoDni] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  function actualizar(campo: string, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
  }

  async function seleccionarFoto(tipo: 'perfil' | 'dni') {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!resultado.canceled) {
      if (tipo === 'perfil') setFotoPerfil(resultado.assets[0].uri);
      else setFotoDni(resultado.assets[0].uri);
    }
  }

  async function subirFoto(uri: string, bucket: string, userId: string) {
    const ext = uri.split('.').pop();
    const fileName = `employee/${form.dni}.${ext}`;  // ← DNI en lugar de userId

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, { upsert: true, contentType: `image/${ext}` });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function handleRegistro() {
    setError('');

    if (!form.nombre || !form.apellido || !form.email || !form.password || !form.password2 || !form.fecha_nacimiento || !form.dni || !form.codigo_postal || !form.direccion || !form.radio_busqueda) {
      setError('Completá todos los campos obligatorios.');
      return;
    }

    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const partes = form.fecha_nacimiento.split('/');
    if (
      partes.length !== 3 ||
      partes[0].length !== 2 ||
      partes[1].length !== 2 ||
      partes[2].length !== 4 ||
      isNaN(Number(partes[0])) ||
      isNaN(Number(partes[1])) ||
      isNaN(Number(partes[2]))
    ) {
      setError('La fecha debe tener el formato DD/MM/AAAA.');
      setCargando(false);
      return;
    }
    const fechaFormateada = `${partes[2]}-${partes[1]}-${partes[0]}`;

    setCargando(true);

    // 1 — Crear usuario en Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      setError(authError.message);
      setCargando(false);
      return;
    }

    const userId = data.user?.id!;

    // 2 — Subir fotos antes de guardar en la tabla
    let fotoPerfilUrl = null;
    let fotoDniUrl = null;

    try {
      if (fotoPerfil) fotoPerfilUrl = await subirFoto(fotoPerfil, 'fotos-perfil', userId);
      if (fotoDni) fotoDniUrl = await subirFoto(fotoDni, 'fotos-dni', userId);
    } catch (e: any) {
      // Si falla la foto, borramos el usuario de Auth para no dejar datos huérfanos
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      await supabase.auth.signOut();
      setError('Error al subir las fotos: ' + e.message);
      setCargando(false);
      return;
    }

    // 3 — Guardar perfil en la tabla solo si las fotos subieron bien
    const { error: perfilError } = await supabase.from('empleados').insert({
      user_id: userId,
      nombre: form.nombre,
      apellido: form.apellido,
      fecha_nacimiento: fechaFormateada,
      dni: form.dni,
      codigo_postal: form.codigo_postal,
      direccion: form.direccion,
      radio_busqueda: parseFloat(form.radio_busqueda),
      foto_url: fotoPerfilUrl,
      foto_dni_url: fotoDniUrl,
    });

    if (perfilError) {
      // Si falla el insert, borramos el usuario y las fotos subidas
      await supabase.storage.from('fotos-perfil').remove([`employee/${form.dni}`]);
      await supabase.storage.from('fotos-dni').remove([`employee/${form.dni}`]);
      await supabase.auth.signOut();
      setError(perfilError.message);
      setCargando(false);
      return;
    }

    setCargando(false);
    router.replace('/dashboard');
  }

  const inputClass = 'bg-[#262626] rounded-[10px] px-4 py-3.5 mb-4 text-base text-white border border-[#3a3a3a]';
  const labelClass = 'text-[13px] font-semibold text-[#cbd5e1] mb-1.5';
  const fotoBtnClass = 'bg-[#262626] rounded-[10px] py-3.5 items-center mb-2 border-[1.5px] border-[#FFD942] active:opacity-70';

  return (
    <ScrollView
      className="flex-1 bg-[#1a1a1a]"
      contentContainerStyle={{
        paddingHorizontal: 28,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 32,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center gap-2.5 mb-7">
        <View className="w-11 h-11 rounded-xl bg-[#FFD942] items-center justify-center">
          <Text className="text-2xl font-black text-[#1a1a1a]">C</Text>
        </View>
        <Text className="text-[13px] font-bold tracking-[2px] text-[#FFD942]">EMPLOYEE</Text>
      </View>

      <Text className="text-3xl font-bold text-white mb-1">Creá tu cuenta</Text>
      <Text className="text-sm text-[#94a3b8] mb-7">Completá tus datos para registrarte</Text>

      <Text className={labelClass}>Nombre *</Text>
      <TextInput className={inputClass} placeholder="Juan" placeholderTextColor="#64748b"
        value={form.nombre} onChangeText={v => actualizar('nombre', v)} />

      <Text className={labelClass}>Apellido *</Text>
      <TextInput className={inputClass} placeholder="Pérez" placeholderTextColor="#64748b"
        value={form.apellido} onChangeText={v => actualizar('apellido', v)} />

      <Text className={labelClass}>Email *</Text>
      <TextInput className={inputClass} placeholder="juan@email.com" placeholderTextColor="#64748b"
        value={form.email} onChangeText={v => actualizar('email', v)}
        autoCapitalize="none" keyboardType="email-address" />

      <Text className={labelClass}>Contraseña *</Text>
      <TextInput className={inputClass} placeholder="Mínimo 6 caracteres" placeholderTextColor="#64748b"
        value={form.password} onChangeText={v => actualizar('password', v)}
        secureTextEntry />

      <Text className={labelClass}>Repetir contraseña *</Text>
      <TextInput className={inputClass} placeholder="Repetí tu contraseña" placeholderTextColor="#64748b"
        value={form.password2} onChangeText={v => actualizar('password2', v)}
        secureTextEntry />

      <Text className={labelClass}>Fecha de nacimiento * (DD/MM/AAAA)</Text>
      <TextInput className={inputClass} placeholder="20/05/1990" placeholderTextColor="#64748b"
        value={form.fecha_nacimiento} onChangeText={v => actualizar('fecha_nacimiento', v)}
        keyboardType="numeric" />

      <Text className={labelClass}>DNI *</Text>
      <TextInput className={inputClass} placeholder="12345678" placeholderTextColor="#64748b"
        value={form.dni} onChangeText={v => actualizar('dni', v)}
        keyboardType="numeric" />

      <Text className={labelClass}>Código postal *</Text>
      <TextInput className={inputClass} placeholder="1414" placeholderTextColor="#64748b"
        value={form.codigo_postal} onChangeText={v => actualizar('codigo_postal', v)}
        keyboardType="numeric" />

      <Text className={labelClass}>Dirección *</Text>
      <TextInput className={inputClass} placeholder="Av. Corrientes 1234" placeholderTextColor="#64748b"
        value={form.direccion} onChangeText={v => actualizar('direccion', v)} />

      <Text className={labelClass}>Radio de búsqueda (km) *</Text>
      <TextInput className={inputClass} placeholder="10" placeholderTextColor="#64748b"
        value={form.radio_busqueda} onChangeText={v => actualizar('radio_busqueda', v)}
        keyboardType="numeric" />

      <Text className={labelClass}>Foto de perfil</Text>
      <Pressable className={fotoBtnClass} onPress={() => seleccionarFoto('perfil')}>
        <Text className="text-[#FFD942] text-[15px] font-semibold">
          {fotoPerfil ? '✓ Foto seleccionada' : 'Seleccionar foto'}
        </Text>
      </Pressable>
      {fotoPerfil && <Image source={{ uri: fotoPerfil }} className="w-full h-44 rounded-[10px] mb-4" />}

      <Text className={labelClass}>Foto del DNI</Text>
      <Pressable className={fotoBtnClass} onPress={() => seleccionarFoto('dni')}>
        <Text className="text-[#FFD942] text-[15px] font-semibold">
          {fotoDni ? '✓ Foto seleccionada' : 'Seleccionar foto del DNI'}
        </Text>
      </Pressable>
      {fotoDni && <Image source={{ uri: fotoDni }} className="w-full h-44 rounded-[10px] mb-4" />}

      {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

      <Pressable
        className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
        onPress={handleRegistro}
        disabled={cargando}>
        <Text className="text-[#1a1a1a] text-base font-extrabold">
          {cargando ? 'Registrando...' : 'Crear cuenta'}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/')} className="mt-4 items-center">
        <Text className="text-[#FFD942] text-sm font-semibold">¿Ya tenés cuenta? Iniciá sesión</Text>
      </Pressable>
    </ScrollView>
  );
}
