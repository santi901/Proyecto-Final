import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

// Adónde lleva tocar una notificación (push o de la bandeja) en la app del empleador:
// si es de un trabajo, su seguimiento; si no (cuenta), el perfil.
export function abrirDesdeNotificacion(router: Router, datos: { tipo?: string; trabajoId?: string | null }) {
  if (!datos.trabajoId) {
    router.push('/perfil' as any);
    return;
  }
  router.push({ pathname: '/seguimiento', params: { trabajoId: datos.trabajoId } } as any);
}
