import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, fetchAutenticado, getUsuario } from '../auth';

// Notificaciones push (Expo). Los backends ya arman y mandan un push en cada cambio de
// estado de un trabajo, pero para entregarlo necesitan el Expo push token del usuario.

// Con la app abierta, las notificaciones también se muestran (por defecto se descartan).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Pide permiso, saca el Expo push token del dispositivo y lo registra para el usuario logueado:
// POST /api/notificaciones/registrar-token  body { expoPushToken } (el usuario sale del JWT)
export async function registrarNotificacionesPush(): Promise<void> {
  if (Platform.OS === 'web') return;

  const usuario = await getUsuario();
  if (!usuario) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return;

  // Expo emite el token para un proyecto de EAS: sin `projectId` (se crea con `eas init`) falla.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  const res = await fetchAutenticado('/api/notificaciones/registrar-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expoPushToken }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Error al registrar el token de notificaciones (${res.status}). ${txt}`);
  }
}

// Para llamar desde las pantallas al entrar con sesión: nunca frena la app, si algo falla
// (sin permiso, Expo Go en Android, backend caído) solo se loguea.
export function activarNotificacionesPush() {
  registrarNotificacionesPush().catch(e =>
    console.log('No se pudieron activar las notificaciones push:', e?.message),
  );
}

// ── Bandeja de notificaciones (Sprint 6) ─────────────────────────────────────────
// El backend registra cada notificación en la tabla `notificaciones` aunque el push no
// llegue (sin token, Expo Go en Android, sin projectId de EAS). La bandeja lee ese
// historial, así las solicitudes, aceptaciones y pagos se ven igual sin push.

export type TipoNotificacion = 'nueva_oferta' | 'cambio_estado' | 'pago' | 'evidencia' | 'calificacion' | 'cuenta' | string;

export type Notificacion = {
  id: string;
  tipo: TipoNotificacion;
  trabajo_id: string | null;
  titulo: string | null;
  mensaje: string;
  estado_envio: 'pendiente' | 'enviado' | 'fallido';
  enviado_en: string;
};

// GET /api/notificaciones — las del usuario logueado, la más nueva primero.
export async function listarNotificaciones(): Promise<Notificacion[]> {
  const data = await apiGet('/api/notificaciones');
  return data.notificaciones ?? [];
}

// "Leída" se guarda en el dispositivo (el backend no tiene ese campo): todo lo que llegó
// antes de la última vez que se abrió la bandeja cuenta como visto.
const CLAVE_ULTIMA_VISTA = 'cg_notificaciones_vistas_hasta';

export async function marcarNotificacionesVistas(hasta: string = new Date().toISOString()) {
  await AsyncStorage.setItem(CLAVE_ULTIMA_VISTA, hasta);
}

export async function contarNoLeidas(): Promise<number> {
  const [lista, vistasHasta] = await Promise.all([
    listarNotificaciones(),
    AsyncStorage.getItem(CLAVE_ULTIMA_VISTA),
  ]);
  const limite = vistasHasta ? new Date(vistasHasta).getTime() : 0;
  return lista.filter(n => new Date(n.enviado_en).getTime() > limite).length;
}

export const ICONO_NOTIFICACION: Record<string, 'work-outline' | 'swap-horiz' | 'payments' | 'photo-camera' | 'star-outline' | 'verified-user' | 'notifications-none'> = {
  nueva_oferta: 'work-outline',
  cambio_estado: 'swap-horiz',
  pago: 'payments',
  evidencia: 'photo-camera',
  calificacion: 'star-outline',
  cuenta: 'verified-user',
};

// Cuando el usuario toca un push (con la app abierta, en segundo plano o cerrada) se
// llama a `abrir` con los datos que manda el backend: `{ tipo, trabajoId }`. Devuelve la
// función para dejar de escuchar.
export function escucharToquesDeNotificaciones(
  abrir: (datos: { tipo?: string; trabajoId?: string }) => void,
): () => void {
  if (Platform.OS === 'web') return () => {};

  let activo = true;
  const manejar = (respuesta: Notifications.NotificationResponse | null) => {
    if (!activo || !respuesta) return;
    const datos = (respuesta.notification.request.content.data ?? {}) as { tipo?: string; trabajoId?: string };
    abrir(datos);
  };

  // La app se abrió tocando un push (estaba cerrada).
  Notifications.getLastNotificationResponseAsync().then(manejar).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(manejar);
  return () => { activo = false; sub.remove(); };
}
