import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Encabezado from '../components/encabezado';
import VistaFormulario from '../components/vista-formulario';
import { getUsuario } from '../auth';
import {
  activarMetodo,
  agregarMetodo,
  cargarMetodos,
  formatearValor,
  quitarMetodo,
  validarMetodo,
  type MetodoCobro,
  type TipoCobro,
} from '../lib/metodosCobro';
import { Paleta, sombra } from '@/constants/theme';

// Gestión de métodos de cobro (Sprint 5): agregar CVU/CBU/alias, borrar y elegir el
// activo, que es adonde se transfiere lo que cobra el trabajador (ya sin la comisión).
export default function MetodosCobroScreen() {
  const insets = useSafeAreaInsets();
  const [usuarioId, setUsuarioId] = useState('');
  const [metodos, setMetodos] = useState<MetodoCobro[] | null>(null);
  const [activo, setActivo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [agregando, setAgregando] = useState(false);
  const [tipo, setTipo] = useState<TipoCobro>('CVU');
  const [valor, setValor] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [errorForm, setErrorForm] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const u = await getUsuario();
      if (!u) return;
      setUsuarioId(u.id);
      const r = await cargarMetodos(u.id);
      setMetodos(r.metodos);
      setActivo(r.activo);
      if (r.metodos.length === 0) setAgregando(true);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cargar tus métodos de cobro.');
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  async function elegir(m: MetodoCobro) {
    if (m.valor === activo || ocupado) return;
    setError('');
    setOcupado(m.id);
    try {
      setActivo(await activarMetodo(usuarioId, m.id));
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos cambiar el método activo.');
    } finally {
      setOcupado(null);
    }
  }

  async function borrar(m: MetodoCobro) {
    setError('');
    setOcupado(m.id);
    try {
      const r = await quitarMetodo(usuarioId, m.id, activo);
      setMetodos(r.metodos);
      setActivo(r.activo);
    } catch (e: any) {
      setError(e?.message ?? 'No pudimos borrar el método.');
    } finally {
      setOcupado(null);
    }
  }

  async function guardarNuevo() {
    setErrorForm('');
    const v = valor.replace(/\s/g, '');
    const problema = validarMetodo(tipo, v);
    if (problema) { setErrorForm(problema); return; }
    setOcupado('nuevo');
    try {
      const r = await agregarMetodo(usuarioId, { tipo, valor: v, etiqueta }, activo);
      setMetodos(r.metodos);
      setActivo(r.activo);
      setValor('');
      setEtiqueta('');
      setAgregando(false);
    } catch (e: any) {
      setErrorForm(e?.message ?? 'No pudimos guardar el método.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <View className="flex-1 bg-fondo">
      <Encabezado titulo="Métodos de cobro" subtitulo="Adónde te transferimos lo que cobrás" alternativa="/(tabs)/buscar" />
      <VistaFormulario
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 32 }}>
        {metodos === null && !error ? (
          <View className="items-center py-10"><ActivityIndicator color={Paleta.principal} /></View>
        ) : null}

        {error ? <Text className="text-error text-[13px] font-nunito text-center mb-3">{error}</Text> : null}

        {metodos?.map(m => {
          const esActivo = m.valor === activo;
          return (
            <Pressable
              key={m.id}
              onPress={() => elegir(m)}
              style={sombra(esActivo ? Paleta.verde : Paleta.neutro, esActivo ? 0.9 : 0.5, esActivo ? 3 : 1.5)}
              className="flex-row items-center bg-white rounded-xl p-4 mb-3 active:opacity-80">
              <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${esActivo ? 'bg-acento' : 'bg-fondo'}`}>
                <MaterialIcons name={m.tipo === 'Alias' ? 'alternate-email' : 'account-balance'} size={20} color={Paleta.principal} />
              </View>
              <View className="flex-1">
                <Text className="text-principal text-[15px] font-nunito-bold" numberOfLines={1}>{m.etiqueta}</Text>
                <Text className="text-neutro text-[13px] font-nunito">{m.tipo} · {formatearValor(m)}</Text>
                {esActivo ? <Text className="text-exito text-[11px] font-nunito-bold mt-0.5">ACTIVO · cobrás acá</Text> : null}
              </View>
              {ocupado === m.id ? (
                <ActivityIndicator color={Paleta.principal} />
              ) : (
                <>
                  <MaterialIcons
                    name={esActivo ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={esActivo ? Paleta.exito : Paleta.neutro}
                  />
                  <Pressable onPress={() => borrar(m)} hitSlop={8} className="ml-3 p-1 active:opacity-60">
                    <MaterialIcons name="delete-outline" size={20} color={Paleta.error} />
                  </Pressable>
                </>
              )}
            </Pressable>
          );
        })}

        {metodos !== null && !agregando ? (
          <Pressable
            onPress={() => setAgregando(true)}
            style={sombra(Paleta.principal, 0.75)}
            className="flex-row items-center justify-center bg-white rounded-xl py-3.5 mt-1 active:opacity-70">
            <MaterialIcons name="add" size={20} color={Paleta.principal} />
            <Text className="text-principal text-[15px] font-nunito-bold ml-1">Agregar CVU, CBU o alias</Text>
          </Pressable>
        ) : null}

        {agregando ? (
          <View style={sombra(Paleta.acento)} className="bg-fondo-suave rounded-xl p-4 mt-2">
            <Text className="text-principal text-base font-nunito-bold mb-3">Nuevo método de cobro</Text>
            <View className="flex-row overflow-hidden rounded-[13px] bg-white mb-3" style={sombra(Paleta.neutro)}>
              {(['CVU', 'CBU', 'Alias'] as TipoCobro[]).map(t => (
                <Pressable
                  key={t}
                  onPress={() => { setTipo(t); setErrorForm(''); }}
                  className={`flex-1 items-center py-2.5 active:opacity-70 ${tipo === t ? 'bg-acento' : 'bg-white'}`}>
                  <Text className="text-[13px] font-nunito-semi text-principal">{t}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              className="bg-white rounded-[10px] px-4 py-3 mb-3 text-base font-nunito text-principal"
              style={sombra(Paleta.neutro)}
              placeholder={tipo === 'Alias' ? 'mi.alias.mp' : '22 números'}
              placeholderTextColor={Paleta.neutro}
              value={valor}
              onChangeText={t => { setValor(tipo === 'Alias' ? t.trim() : t.replace(/\D/g, '').slice(0, 22)); setErrorForm(''); }}
              keyboardType={tipo === 'Alias' ? 'default' : 'number-pad'}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              className="bg-white rounded-[10px] px-4 py-3 mb-3 text-base font-nunito text-principal"
              style={sombra(Paleta.neutro)}
              placeholder="Nombre (ej. Mercado Pago, Banco Nación)"
              placeholderTextColor={Paleta.neutro}
              value={etiqueta}
              onChangeText={setEtiqueta}
              maxLength={30}
            />
            {tipo !== 'Alias' ? (
              <Text className="text-neutro text-[11px] font-nunito mb-2">{valor.length}/22 dígitos</Text>
            ) : null}
            {errorForm ? <Text className="text-error text-[13px] font-nunito mb-2">{errorForm}</Text> : null}
            <View className="flex-row gap-3">
              {metodos && metodos.length > 0 ? (
                <Pressable
                  onPress={() => { setAgregando(false); setErrorForm(''); }}
                  style={sombra(Paleta.principal, 0.75)}
                  className="flex-1 bg-white rounded-xl py-3 items-center active:opacity-70">
                  <Text className="text-principal text-sm font-nunito-bold">Cancelar</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={guardarNuevo}
                disabled={ocupado === 'nuevo'}
                className="flex-1 bg-principal rounded-xl py-3 items-center active:opacity-90">
                {ocupado === 'nuevo' ? (
                  <ActivityIndicator color={Paleta.acento} />
                ) : (
                  <Text className="text-acento text-sm font-nunito-bold">Guardar</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View className="flex-row items-start mt-6">
          <MaterialIcons name="info-outline" size={16} color={Paleta.neutro} />
          <Text className="flex-1 text-neutro text-xs font-nunito ml-2 leading-4">
            Cuando el empleador y vos confirman que el trabajo terminó, te transferimos lo que
            cobraste, ya descontada la comisión, al método activo.
          </Text>
        </View>
      </VistaFormulario>
    </View>
  );
}
