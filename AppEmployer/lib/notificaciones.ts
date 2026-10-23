import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchAutenticado, getUsuario } from '../auth';

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
