import AsyncStorage from '@react-native-async-storage/async-storage';

// Trabajos favoritos del empleador (Sprint 5): plantillas de los pedidos que repite
// (ej. "Limpieza semanal del depto") para volver a publicarlos con un toque. Se guardan
// en el dispositivo, por usuario: el backend no tiene una tabla para esto. El precio NO
// se guarda: se vuelve a cotizar al publicar (depende de la demanda y el horario).

export type TrabajoFavorito = {
  id: string;
  titulo: string;
  categoria: string;
  descripcion: string;
  dificultad: 'Simple' | 'Intermedio' | 'Complejo';
  creadoEn: string;
};

const clave = (usuarioId: string) => `cg_favoritos_${usuarioId}`;

export async function listarFavoritos(usuarioId: string): Promise<TrabajoFavorito[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(clave(usuarioId))) ?? '[]');
  } catch {
    return [];
  }
}

async function guardar(usuarioId: string, lista: TrabajoFavorito[]) {
  await AsyncStorage.setItem(clave(usuarioId), JSON.stringify(lista));
}

/** Mismo título + categoría = mismo favorito (se actualiza en vez de duplicarse). */
export function esMismoFavorito(f: Pick<TrabajoFavorito, 'titulo' | 'categoria'>, g: Pick<TrabajoFavorito, 'titulo' | 'categoria'>) {
  return f.titulo.trim().toLowerCase() === g.titulo.trim().toLowerCase() && f.categoria === g.categoria;
}

export async function agregarFavorito(
  usuarioId: string,
  datos: Omit<TrabajoFavorito, 'id' | 'creadoEn'>,
): Promise<TrabajoFavorito[]> {
  const lista = (await listarFavoritos(usuarioId)).filter(f => !esMismoFavorito(f, datos));
  const nuevo: TrabajoFavorito = {
    ...datos,
    titulo: datos.titulo.trim(),
    descripcion: datos.descripcion.trim(),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    creadoEn: new Date().toISOString(),
  };
  const nueva = [nuevo, ...lista];
  await guardar(usuarioId, nueva);
  return nueva;
}

export async function quitarFavorito(usuarioId: string, id: string): Promise<TrabajoFavorito[]> {
  const lista = (await listarFavoritos(usuarioId)).filter(f => f.id !== id);
  await guardar(usuarioId, lista);
  return lista;
}
