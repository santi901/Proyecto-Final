import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabaseClient';
import { useRouter } from 'expo-router';

export default function RegisterScreen() {
  const router = useRouter();

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
  router.replace('/');
}

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Crear cuenta</Text>
      <Text style={styles.sub}>Completá tus datos para registrarte</Text>

      <Text style={styles.label}>Nombre *</Text>
      <TextInput style={styles.input} placeholder="Juan" placeholderTextColor="#94a3b8"
        value={form.nombre} onChangeText={v => actualizar('nombre', v)} />

      <Text style={styles.label}>Apellido *</Text>
      <TextInput style={styles.input} placeholder="Pérez" placeholderTextColor="#94a3b8"
        value={form.apellido} onChangeText={v => actualizar('apellido', v)} />

      <Text style={styles.label}>Email *</Text>
      <TextInput style={styles.input} placeholder="juan@email.com" placeholderTextColor="#94a3b8"
        value={form.email} onChangeText={v => actualizar('email', v)}
        autoCapitalize="none" keyboardType="email-address" />

      <Text style={styles.label}>Contraseña *</Text>
      <TextInput style={styles.input} placeholder="Mínimo 6 caracteres" placeholderTextColor="#94a3b8"
        value={form.password} onChangeText={v => actualizar('password', v)}
        secureTextEntry />

      <Text style={styles.label}>Repetir contraseña *</Text>
      <TextInput style={styles.input} placeholder="Repetí tu contraseña" placeholderTextColor="#94a3b8"
        value={form.password2} onChangeText={v => actualizar('password2', v)}
        secureTextEntry />

      <Text style={styles.label}>Fecha de nacimiento * (DD/MM/AAAA)</Text>
      <TextInput style={styles.input} placeholder="20/05/1990" placeholderTextColor="#94a3b8"
        value={form.fecha_nacimiento} onChangeText={v => actualizar('fecha_nacimiento', v)}
        keyboardType="numeric" />

      <Text style={styles.label}>DNI *</Text>
      <TextInput style={styles.input} placeholder="12345678" placeholderTextColor="#94a3b8"
        value={form.dni} onChangeText={v => actualizar('dni', v)}
        keyboardType="numeric" />

      <Text style={styles.label}>Código postal *</Text>
      <TextInput style={styles.input} placeholder="1414" placeholderTextColor="#94a3b8"
        value={form.codigo_postal} onChangeText={v => actualizar('codigo_postal', v)}
        keyboardType="numeric" />

      <Text style={styles.label}>Dirección *</Text>
      <TextInput style={styles.input} placeholder="Av. Corrientes 1234" placeholderTextColor="#94a3b8"
        value={form.direccion} onChangeText={v => actualizar('direccion', v)} />

      <Text style={styles.label}>Radio de búsqueda (km) *</Text>
      <TextInput style={styles.input} placeholder="10" placeholderTextColor="#94a3b8"
        value={form.radio_busqueda} onChangeText={v => actualizar('radio_busqueda', v)}
        keyboardType="numeric" />

      <Text style={styles.label}>Foto de perfil</Text>
      <Pressable style={styles.btnFoto} onPress={() => seleccionarFoto('perfil')}>
        <Text style={styles.btnFotoTxt}>{fotoPerfil ? '✓ Foto seleccionada' : 'Seleccionar foto'}</Text>
      </Pressable>
      {fotoPerfil && <Image source={{ uri: fotoPerfil }} style={styles.preview} />}

      <Text style={styles.label}>Foto del DNI</Text>
      <Pressable style={styles.btnFoto} onPress={() => seleccionarFoto('dni')}>
        <Text style={styles.btnFotoTxt}>{fotoDni ? '✓ Foto seleccionada' : 'Seleccionar foto del DNI'}</Text>
      </Pressable>
      {fotoDni && <Image source={{ uri: fotoDni }} style={styles.preview} />}

      {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        onPress={handleRegistro}
        disabled={cargando}>
        <Text style={styles.btnTxt}>{cargando ? 'Registrando...' : 'Crear cuenta'}</Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/')} style={styles.linkContainer}>
        <Text style={styles.link}>¿Ya tenés cuenta? Iniciá sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  titulo: { fontSize: 28, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 14, color: '#475569', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnFoto: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnFotoTxt: { color: '#0f172a', fontSize: 15 },
  preview: { width: '100%', height: 180, borderRadius: 8, marginBottom: 16 },
  btn: {
    backgroundColor: '#1d8348',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  errorTxt: { color: '#e74c3c', textAlign: 'center', marginBottom: 8, fontSize: 13 },
  linkContainer: { marginTop: 16, alignItems: 'center' },
  link: { color: '#1d8348', fontSize: 14 },
});