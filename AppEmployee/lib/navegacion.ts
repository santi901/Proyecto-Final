import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// Adónde lleva tocar una notificación (push o de la bandeja) en la app del trabajador.
// Una oferta nueva abre la búsqueda; todo lo demás con trabajo, el trabajo en curso.
export function abrirDesdeNotificacion(router: Router, datos: { tipo?: string; trabajoId?: string | null }) {
  if (datos.tipo === 'nueva_oferta' || !datos.trabajoId) {
    router.navigate('/(tabs)/buscar' as any);
    return;
  }
  if (datos.tipo === 'pago') {
    router.push('/pagos' as any);
    return;
  }
  router.push({ pathname: '/trabajo-en-curso', params: { trabajoId: datos.trabajoId } } as any);
}
