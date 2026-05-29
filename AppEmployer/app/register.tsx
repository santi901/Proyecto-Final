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

  const [paso, setPaso] = useState<1 | 2>(1);
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
    piso_departamento: '',
    indicaciones: '',
  });

  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  function actualizar(campo: string, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
  }

  async function seleccionarFoto() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!resultado.canceled) {
      setFotoPerfil(resultado.assets[0].uri);
    }
  }

  async function subirFoto(uri: string, userId: string) {
    const ext = uri.split('.').pop();
    const fileName = `employer/${form.dni}.${ext}`;  // ← DNI en lugar de userId
    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('fotos-perfil')
      .upload(fileName, blob, { upsert: true, contentType: `image/${ext}` });

    if (error) throw error;

    const { data } = supabase.storage.from('fotos-perfil').getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Valida los datos del paso 1 antes de avanzar
  function irAlPaso2() {
    setError('');

    if (!form.email || !form.password || !form.password2 || !form.nombre || !form.apellido || !form.fecha_nacimiento || !form.dni) {
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
      return;
    }

    setPaso(2);
  }

  async function handleRegistro() {
    setError('');

    if (!form.nombre || !form.apellido || !form.email || !form.password || !form.password2 || !form.fecha_nacimiento || !form.dni || !form.codigo_postal || !form.direccion) {
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

    // 2 — Subir foto antes de guardar en la tabla
    let fotoPerfilUrl = null;

    try {
      if (fotoPerfil) fotoPerfilUrl = await subirFoto(fotoPerfil, userId);
    } catch (e: any) {
      await supabase.auth.signOut();
      setError('Error al subir la foto: ' + e.message);
      setCargando(false);
      return;
    }

    // 3 — Guardar perfil en la tabla solo si la foto subió bien
    const { error: perfilError } = await supabase.from('perfiles').insert({
      user_id: userId,
      nombre: form.nombre,
      apellido: form.apellido,
      fecha_nacimiento: fechaFormateada,
      dni: form.dni,
      codigo_postal: form.codigo_postal,
      direccion: form.direccion,
      piso_departamento: form.piso_departamento || null,
      indicaciones: form.indicaciones || null,
      foto_url: fotoPerfilUrl,
    });

    if (perfilError) {
      await supabase.storage.from('fotos-perfil').remove([`employer/${form.dni}`]);
      await supabase.auth.signOut();
      setError(perfilError.message);
      setCargando(false);
      return;
    }

    setCargando(false);
    router.replace('/ofrecer');
  }

  const inputClass = 'bg-[#262626] rounded-[10px] px-4 py-3.5 mb-4 text-base text-white border border-[#3a3a3a]';

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
        <Text className="text-[13px] font-bold tracking-[2px] text-[#FFD942]">EMPLOYER</Text>
      </View>

      {paso === 1 ? (
        <>
          <Text className="text-3xl font-bold text-white mb-1">
            Creá tu cuenta en{'\n'}
            <Text className="text-[#FFD942]">ChanguitApp</Text> Employer
          </Text>
          <Pressable onPress={() => router.replace('/')} className="mb-7">
            <Text className="text-sm text-[#94a3b8]">
              ¿Ya tenés una cuenta? <Text className="text-[#FFD942] font-semibold">Iniciá sesión</Text>
            </Text>
          </Pressable>

          <TextInput className={inputClass} placeholder="Ingresá tu mail" placeholderTextColor="#64748b"
            value={form.email} onChangeText={v => actualizar('email', v)}
            autoCapitalize="none" keyboardType="email-address"
            autoComplete="off" textContentType="none" importantForAutofill="no"
            autoCorrect={false} spellCheck={false} />

          <TextInput className={inputClass} placeholder="Ingresá tu contraseña" placeholderTextColor="#64748b"
            value={form.password} onChangeText={v => actualizar('password', v)} secureTextEntry />

          <TextInput className={inputClass} placeholder="Volvé a ingresar tu contraseña" placeholderTextColor="#64748b"
            value={form.password2} onChangeText={v => actualizar('password2', v)} secureTextEntry />

          <Text className="text-base font-bold text-white mt-2 mb-3">Datos personales</Text>

          <TextInput className={inputClass} placeholder="Nombre/s" placeholderTextColor="#64748b"
            value={form.nombre} onChangeText={v => actualizar('nombre', v)} />

          <TextInput className={inputClass} placeholder="Apellido/s" placeholderTextColor="#64748b"
            value={form.apellido} onChangeText={v => actualizar('apellido', v)} />

          <TextInput className={inputClass} placeholder="Fecha de nacimiento (DD/MM/AAAA)" placeholderTextColor="#64748b"
            value={form.fecha_nacimiento} onChangeText={v => actualizar('fecha_nacimiento', v)}
            keyboardType="numeric" />

          <TextInput className={inputClass} placeholder="DNI / CUIT" placeholderTextColor="#64748b"
            value={form.dni} onChangeText={v => actualizar('dni', v)}
            keyboardType="numeric" />

          {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
            onPress={irAlPaso2}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">Siguiente</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="text-3xl font-bold text-white mb-1">Ya falta poco</Text>
          <Text className="text-sm text-[#94a3b8] mb-7">
            Te pedimos solo un poco más de paciencia
          </Text>

          <TextInput className={inputClass} placeholder="Ingresá tu código postal" placeholderTextColor="#64748b"
            value={form.codigo_postal} onChangeText={v => actualizar('codigo_postal', v)}
            keyboardType="numeric" />

          <TextInput className={inputClass} placeholder="Dirección" placeholderTextColor="#64748b"
            value={form.direccion} onChangeText={v => actualizar('direccion', v)} />

          <TextInput className={inputClass} placeholder="Piso / Departamento (Opcional)" placeholderTextColor="#64748b"
            value={form.piso_departamento} onChangeText={v => actualizar('piso_departamento', v)} />

          <TextInput className={`${inputClass} h-20`} style={{ textAlignVertical: 'top' }}
            placeholder="Indicaciones (Opcional)" placeholderTextColor="#64748b"
            value={form.indicaciones} onChangeText={v => actualizar('indicaciones', v)}
            multiline numberOfLines={3} />

          <Pressable
            className="bg-[#262626] rounded-[10px] py-3.5 items-center mb-2 border-[1.5px] border-[#FFD942] active:opacity-70"
            onPress={seleccionarFoto}>
            <Text className="text-[#FFD942] text-[15px] font-semibold">
              {fotoPerfil ? '✓ Foto de perfil seleccionada' : 'Foto de perfil (Opcional)'}
            </Text>
          </Pressable>
          {fotoPerfil && <Image source={{ uri: fotoPerfil }} className="w-full h-44 rounded-[10px] mb-4" />}

          {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
            onPress={handleRegistro}
            disabled={cargando}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">
              {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
            </Text>
          </Pressable>

          <Text className="text-[11px] text-[#64748b] text-center mt-4 leading-4">
            Al crear una cuenta automáticamente aceptás nuestra{' '}
            <Text className="underline">política de privacidad</Text> y{' '}
            <Text className="underline">acuerdo de usuario</Text>
          </Text>

          <Pressable onPress={() => { setError(''); setPaso(1); }} className="mt-4 items-center">
            <Text className="text-[#94a3b8] text-sm underline">Volver</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
