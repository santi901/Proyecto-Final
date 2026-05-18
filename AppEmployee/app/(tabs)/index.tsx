import { useState } from 'react';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../supabaseClient';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();
  const [logueado, setLogueado] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [fichado, setFichado] = useState(false);
  const [horaIngreso, setHoraIngreso] = useState<string | null>(null);

  const ahora = () => {
    const d = new Date();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const fichar = () => {
    if (!fichado) {
      setHoraIngreso(ahora());
    } else {
      setHoraIngreso(null);
    }
    setFichado(!fichado);
  };

  async function handleLogin() {
    setError('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pass,
    });
    if (error) {
      setError(error.message);
    } else {
      setUsuario(data.user?.email || 'Empleado');
      setLogueado(true);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setLogueado(false);
    setEmail('');
    setPass('');
  }

  if (!logueado) {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.loginTitle}>AppEmployee</Text>
        <Text style={styles.loginSub}>Ingreso de empleados</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#94a3b8"
          value={pass}
          onChangeText={setPass}
          secureTextEntry
        />

        {error ? <Text style={styles.errorTxt}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.btnPrimario, pressed && { opacity: 0.85 }]}
          onPress={handleLogin}>
          <Text style={styles.btnPrimarioTxt}>Ingresar</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecundario, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/register')}>
          <Text style={styles.btnSecundarioTxt}>Crear cuenta</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.hola}>Hola,</Text>
        <Text style={styles.nombre}>{usuario}</Text>
      </View>

      <View style={[styles.estadoBox, { backgroundColor: fichado ? '#1d8348' : '#64748b' }]}>
        <Text style={styles.estadoLabel}>Estado actual</Text>
        <Text style={styles.estadoTxt}>
          {fichado ? `Trabajando desde ${horaIngreso}` : 'Fuera de turno'}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.btnFichar,
          { backgroundColor: fichado ? '#e74c3c' : '#1d8348' },
          pressed && { opacity: 0.85 },
        ]}
        onPress={fichar}>
        <Text style={styles.btnFicharTxt}>
          {fichado ? 'Fichar SALIDA' : 'Fichar ENTRADA'}
        </Text>
      </Pressable>

      <Text style={styles.seccion}>Mi semana</Text>

      <View style={styles.semanaRow}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <View key={i} style={[styles.diaBox, i < 4 && styles.diaTrabajado, i === 4 && styles.diaActual]}>
            <Text style={[styles.diaTxt, (i < 4 || i === 4) && { color: '#fff' }]}>{d}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.seccion}>Accesos</Text>

      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Mi horario</Text>
      </Pressable>
      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Solicitar dia</Text>
      </Pressable>
      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Mis novedades</Text>
      </Pressable>

      <Pressable
        style={[styles.accion, { backgroundColor: '#e74c3c', marginTop: 24 }]}
        onPress={handleLogout}>
        <Text style={[styles.accionTxt, { color: '#fff' }]}>Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: '#1d8348',
    padding: 24,
    justifyContent: 'center',
  },
  loginTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  loginSub: {
    fontSize: 16,
    color: '#d4efdf',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  btnPrimario: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 8,
    alignItems: 'center',
  },
  btnPrimarioTxt: {
    color: '#1d8348',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnSecundario: {
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  btnSecundarioTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorTxt: {
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 13,
  },
  scroll: { flex: 1, backgroundColor: '#f1f5f9' },
  scrollContent: { padding: 16, paddingTop: 60 },
  header: { marginBottom: 20 },
  hola: { fontSize: 16, color: '#475569' },
  nombre: { fontSize: 26, fontWeight: 'bold', color: '#0f172a' },
  estadoBox: { borderRadius: 12, padding: 16, marginBottom: 12 },
  estadoLabel: { color: '#fff', fontSize: 12, opacity: 0.85 },
  estadoTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  btnFichar: { borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 28 },
  btnFicharTxt: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  seccion: { fontSize: 14, fontWeight: 'bold', color: '#475569', marginBottom: 12, textTransform: 'uppercase' },
  semanaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  diaBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  diaTrabajado: { backgroundColor: '#1d8348', borderColor: '#1d8348' },
  diaActual: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  diaTxt: { fontSize: 14, color: '#475569', fontWeight: '600' },
  accion: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  accionTxt: { fontSize: 16, color: '#0f172a' },
});