import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Empleado = {
  id: number;
  nombre: string;
  puesto: string;
  estado: 'Activo' | 'Ausente' | 'Vacaciones';
};

const EMPLEADOS: Empleado[] = [
  { id: 1, nombre: 'Maria Gonzalez', puesto: 'Cajera', estado: 'Activo' },
  { id: 2, nombre: 'Juan Perez', puesto: 'Repositor', estado: 'Activo' },
  { id: 3, nombre: 'Lucia Fernandez', puesto: 'Vendedora', estado: 'Vacaciones' },
  { id: 4, nombre: 'Carlos Lopez', puesto: 'Encargado', estado: 'Activo' },
  { id: 5, nombre: 'Ana Martinez', puesto: 'Cajera', estado: 'Ausente' },
  { id: 6, nombre: 'Diego Suarez', puesto: 'Repositor', estado: 'Activo' },
];

const colorEstado = (estado: Empleado['estado']) => {
  if (estado === 'Activo') return '#1d8348';
  if (estado === 'Ausente') return '#e74c3c';
  return '#b9770e';
};

export default function EmpleadosScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Mis empleados</Text>
      <Text style={styles.sub}>{EMPLEADOS.length} registrados</Text>

      {EMPLEADOS.map((e) => (
        <View key={e.id} style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{e.nombre[0]}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.nombre}>{e.nombre}</Text>
            <Text style={styles.puesto}>{e.puesto}</Text>
          </View>
          <View
            style={[styles.badge, { backgroundColor: colorEstado(e.estado) }]}>
            <Text style={styles.badgeTxt}>{e.estado}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    paddingTop: 60,
  },
  titulo: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  sub: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  nombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  puesto: {
    fontSize: 13,
    color: '#64748b',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
