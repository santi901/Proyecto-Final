import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { API_URL, getAccessToken } from '../auth';
import { fetchConTimeout } from './fetchConTimeout';

// Mostrar la notificación también si llega con la app abierta.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Pide permiso, obtiene el Expo push token y lo registra en el backend
// (POST /api/notificaciones/registrar-token), que es de donde lo saca
// notificacionesService.notificar() para mandar el push. Nunca tira: si algo
// falla (web, emulador, permiso denegado, sin projectId de EAS) solo loguea y
// las notificaciones igual quedan guardadas en el historial del backend.
export async function registrarNotificacionesPush(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) {
      console.log('Push: solo funciona en un dispositivo físico, se omite.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ChanguitApp',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') {
      console.log('Push: el usuario no dio permiso de notificaciones.');
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.log('Push: falta el projectId de EAS (correr `eas init`), no se puede obtener el token.');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

    const token = await getAccessToken();
    const res = await fetchConTimeout(`${API_URL}/api/notificaciones/registrar-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ expoPushToken }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.log('Push: el backend rechazó el token:', data.error);
    }
  } catch (e: any) {
    console.log('Push: no se pudo registrar el token:', e?.message);
  }
}
