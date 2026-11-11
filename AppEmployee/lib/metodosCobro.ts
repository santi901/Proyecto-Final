import AsyncStorage from '@react-native-async-storage/async-storage';
import { actualizarPerfil, obtenerPerfil } from './perfil';

// Métodos de cobro del trabajador (Sprint 5): puede guardar varios CVU/CBU/alias y elegir
// cuál está activo. El backend guarda uno solo (`empleados.alias_cobro`, que es adonde
// se le transfiere cada liquidación), así que:
//   · la lista se guarda en el dispositivo, por usuario;
//   · el método ACTIVO es el que se manda al backend (PUT /api/empleados/perfil, aliasCobro).
// Al abrir, si el backend tiene un alias que no está en la lista (se cargó en otro
// teléfono o antes de esta pantalla), se agrega solo y queda como activo.

export type TipoCobro = 'CVU' | 'CBU' | 'Alias';

export type MetodoCobro = {
  id: string;
  tipo: TipoCobro;
  valor: string;
  /** Nombre para reconocerlo: "Mercado Pago", "Banco Nación"… */
  etiqueta: string;
};

const clave = (usuarioId: string) => `cg_metodos_cobro_${usuarioId}`;

/** Mismo formato que valida el backend: CBU/CVU de 22 dígitos o alias de 6 a 20 caracteres. */
export function validarMetodo(tipo: TipoCobro, valor: string): string | null {
  const v = valor.trim();
  if (tipo === 'Alias') {
    return /^[a-zA-Z0-9.-]{6,20}$/.test(v) ? null : 'El alias tiene entre 6 y 20 caracteres (letras, números, punto o guion).';
  }
  return /^\d{22}$/.test(v) ? null : `El ${tipo} tiene que tener 22 números.`;
}

export function detectarTipo(valor: string): TipoCobro {
  if (/^\d{22}$/.test(valor)) return valor.startsWith('000') ? 'CVU' : 'CBU';
  return 'Alias';
}

/** "0000 0031 … 4567" para CBU/CVU, el alias tal cual. */
export function formatearValor(m: Pick<MetodoCobro, 'tipo' | 'valor'>): string {
  if (m.tipo === 'Alias') return m.valor;
  return `${m.valor.slice(0, 4)} ${m.valor.slice(4, 8)} … ${m.valor.slice(-4)}`;
}

async function leer(usuarioId: string): Promise<MetodoCobro[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(clave(usuarioId))) ?? '[]');
  } catch {
    return [];
  }
}

async function escribir(usuarioId: string, lista: MetodoCobro[]) {
  await AsyncStorage.setItem(clave(usuarioId), JSON.stringify(lista));
}

const nuevoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** La lista + cuál es el activo (el `alias_cobro` del backend). */
export async function cargarMetodos(usuarioId: string): Promise<{ metodos: MetodoCobro[]; activo: string | null }> {
  const [lista, { perfil }] = await Promise.all([leer(usuarioId), obtenerPerfil()]);
  const enBackend = perfil.alias_cobro?.trim() || null;
  if (enBackend && !lista.some(m => m.valor === enBackend)) {
    lista.unshift({ id: nuevoId(), tipo: detectarTipo(enBackend), valor: enBackend, etiqueta: 'Cuenta principal' });
    await escribir(usuarioId, lista);
  }
  return { metodos: lista, activo: enBackend };
}

// El PUT del perfil reemplaza todo: se relee el perfil y se manda completo, cambiando
// sólo aliasCobro.
async function guardarActivoEnBackend(valor: string | null) {
  const { perfil: p } = await obtenerPerfil();
  await actualizarPerfil({
    nombre: p.nombre,
    apellido: p.apellido,
    fechaNacimiento: p.fecha_nacimiento,
    dni: p.dni,
    codigoPostal: p.codigo_postal,
    direccion: p.direccion,
    radioBusqueda: p.radio_busqueda ?? 10,
    categorias: p.categorias ?? [],
    fotoUrl: p.foto_url,
    fotoDniUrl: p.foto_dni_url,
    lat: p.lat,
    lng: p.lng,
    aliasCobro: valor,
  });
}

export async function activarMetodo(usuarioId: string, id: string): Promise<string> {
  const metodo = (await leer(usuarioId)).find(m => m.id === id);
  if (!metodo) throw new Error('Ese método de cobro ya no existe.');
  await guardarActivoEnBackend(metodo.valor);
  return metodo.valor;
}

/** Agrega un método. Si es el primero, queda activo. */
export async function agregarMetodo(
  usuarioId: string,
  datos: Omit<MetodoCobro, 'id'>,
  activoActual: string | null,
): Promise<{ metodos: MetodoCobro[]; activo: string | null }> {
  const valor = datos.valor.trim();
  const error = validarMetodo(datos.tipo, valor);
  if (error) throw new Error(error);

  const lista = await leer(usuarioId);
  if (lista.some(m => m.valor === valor)) throw new Error('Ya tenés guardado ese método de cobro.');
  lista.push({ ...datos, valor, etiqueta: datos.etiqueta.trim() || datos.tipo, id: nuevoId() });
  await escribir(usuarioId, lista);

  if (!activoActual) {
    await guardarActivoEnBackend(valor);
    return { metodos: lista, activo: valor };
  }
  return { metodos: lista, activo: activoActual };
}

/** Borra un método. Si era el activo, pasa a activo el primero que quede (o ninguno). */
export async function quitarMetodo(
  usuarioId: string,
  id: string,
  activoActual: string | null,
): Promise<{ metodos: MetodoCobro[]; activo: string | null }> {
  const lista = await leer(usuarioId);
  const borrado = lista.find(m => m.id === id);
  const resto = lista.filter(m => m.id !== id);
  let activo = activoActual;
  if (borrado && borrado.valor === activoActual) {
    activo = resto[0]?.valor ?? null;
    await guardarActivoEnBackend(activo);
  }
  await escribir(usuarioId, resto);
  return { metodos: resto, activo };
}
