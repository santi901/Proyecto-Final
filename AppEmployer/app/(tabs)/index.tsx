import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function HomeScreen() {
  const [logueado, setLogueado] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [pass, setPass] = useState('');

  if (!logueado) {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.loginTitle}>AppEmployer</Text>
        <Text style={styles.loginSub}>Ingreso de empleadores</Text>

        <TextInput
          style={styles.input}
          placeholder="Usuario"
          placeholderTextColor="#94a3b8"
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Contrasena"
          placeholderTextColor="#94a3b8"
          value={pass}
          onChangeText={setPass}
          secureTextEntry
        />

        <Pressable
          style={({ pressed }) => [
            styles.btnPrimario,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => setLogueado(true)}>
          <Text style={styles.btnPrimarioTxt}>Ingresar</Text>
        </Pressable>

        <Text style={styles.helper}>
          (Demo: cualquier dato te deja entrar)
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.hola}>Hola,</Text>
        <Text style={styles.nombreEmpresa}>{usuario || 'Empleador'}</Text>
      </View>

      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: '#0a7ea4' }]}>
          <Text style={styles.cardNumero}>12</Text>
          <Text style={styles.cardLabel}>Empleados</Text>
        </View>
        <View style={[styles.card, { backgroundColor: '#1d8348' }]}>
          <Text style={styles.cardNumero}>8</Text>
          <Text style={styles.cardLabel}>En turno</Text>
        </View>
        <View style={[styles.card, { backgroundColor: '#b9770e' }]}>
          <Text style={styles.cardNumero}>3</Text>
          <Text style={styles.cardLabel}>Novedades</Text>
        </View>
      </View>

      <Text style={styles.seccionTitulo}>Acciones rapidas</Text>

      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Cargar turno</Text>
      </Pressable>
      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Registrar novedad</Text>
      </Pressable>
      <Pressable style={styles.accion} onPress={() => {}}>
        <Text style={styles.accionTxt}>Ver liquidaciones</Text>
      </Pressable>

      <Pressable
        style={[styles.accion, { backgroundColor: '#e74c3c', marginTop: 24 }]}
        onPress={() => setLogueado(false)}>
        <Text style={[styles.accionTxt, { color: '#fff' }]}>Cerrar sesion</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1,
    backgroundColor: '#0a7ea4',
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
    color: '#e6f4fe',
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
    color: '#0a7ea4',
    fontSize: 16,
    fontWeight: 'bold',
  },
  helper: {
    color: '#e6f4fe',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 12,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 60,
  },
  header: {
    marginBottom: 20,
  },
  hola: {
    fontSize: 16,
    color: '#475569',
  },
  nombreEmpresa: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cardNumero: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardLabel: {
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
  },
  seccionTitulo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  accion: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accionTxt: {
    fontSize: 16,
    color: '#0f172a',
  },
});
