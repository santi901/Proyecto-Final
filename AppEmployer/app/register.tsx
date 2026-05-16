import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../supabaseClient';
import { useRouter } from 'expo-router';

export default function RegisterScreen() {
  const router = useRouter();

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    fecha_nacimiento: '',
    dni: '',
    codigo_postal: '',
    direccion: '',
    piso_departamento: '',
    indicaciones: '',
  });

  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  function actualizar(campo: string, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
  }

  async function handleRegistro() {
    setError('');

    // Validaciones básicas
    if (!form.nombre || !form.apellido || !form.email || !form.password || !form.fecha_nacimiento || !form.dni || !form.codigo_postal || !form.direccion) {
      setError('Completá todos los campos obligatorios.');
      return;
    }

    setCargando(true);

    // 1 — Crear el usuario en Supabase Auth
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError) {
      setError(authError.message);
      setCargando(false);
      return;
    }

    const userId = data.user?.id;

    // 2 — Guardar el resto de los datos en la tabla perfiles
    const { error: perfilError } = await supabase.from('perfiles').insert({
      user_id: userId,
      nombre: form.nombre,
      apellido: form.apellido,
      fecha_nacimiento: form.fecha_nacimiento,
      dni: form.dni,
      codigo_postal: form.codigo_postal,
      direccion: form.direccion,
      piso_departamento: form.piso_departamento || null,
      indicaciones: form.indicaciones || null,
    });

    setCargando(false);

    if (perfilError) {
      setError(perfilError.message);
      return;
    }

    // 3 — Volver al login
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

      <Text style={styles.label}>Fecha de nacimiento * (AAAA-MM-DD)</Text>
      <TextInput style={styles.input} placeholder="1990-05-20" placeholderTextColor="#94a3b8"
        value={form.fecha_nacimiento} onChangeText={v => actualizar('fecha_nacimiento', v)} />

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

      <Text style={styles.label}>Piso / Departamento</Text>
      <TextInput style={styles.input} placeholder="3° B (opcional)" placeholderTextColor="#94a3b8"
        value={form.piso_departamento} onChangeText={v => actualizar('piso_departamento', v)} />

      <Text style={styles.label}>Indicaciones</Text>
      <TextInput style={[styles.input, styles.inputMulti]} placeholder="Ej: timbre roto, usar escalera... (opcional)"
        placeholderTextColor="#94a3b8" value={form.indicaciones}
        onChangeText={v => actualizar('indicaciones', v)}
        multiline numberOfLines={3} />

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
  inputMulti: { height: 80, textAlignVertical: 'top' },
  btn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  errorTxt: { color: '#e74c3c', textAlign: 'center', marginBottom: 8, fontSize: 13 },
  linkContainer: { marginTop: 16, alignItems: 'center' },
  link: { color: '#0a7ea4', fontSize: 14 },
});