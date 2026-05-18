import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Recibo = {
  id: number;
  mes: string;
  bruto: number;
  neto: number;
  estado: 'Pagado' | 'Pendiente';
};

const RECIBOS: Recibo[] = [
  { id: 1, mes: 'Abril 2026', bruto: 850000, neto: 705000, estado: 'Pendiente' },
  { id: 2, mes: 'Marzo 2026', bruto: 820000, neto: 680600, estado: 'Pagado' },
  { id: 3, mes: 'Febrero 2026', bruto: 800000, neto: 664000, estado: 'Pagado' },
  { id: 4, mes: 'Enero 2026', bruto: 780000, neto: 647400, estado: 'Pagado' },
  { id: 5, mes: 'Diciembre 2025', bruto: 1170000, neto: 970000, estado: 'Pagado' },
];

const formatPesos = (n: number) =>
  '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

export default function RecibosScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Mis recibos</Text>
      <Text style={styles.sub}>Ultimos {RECIBOS.length} periodos</Text>

      {RECIBOS.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.mes}>{r.mes}</Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    r.estado === 'Pagado' ? '#1d8348' : '#b9770e',
                },
              ]}>
              <Text style={styles.badgeTxt}>{r.estado}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Bruto</Text>
            <Text style={styles.val}>{formatPesos(r.bruto)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Neto a cobrar</Text>
            <Text style={[styles.val, styles.neto]}>{formatPesos(r.neto)}</Text>
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mes: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
    color: '#64748b',
  },
  val: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  neto: {
    color: '#1d8348',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
