import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { misTrabajosAsignados } from '../lib/trabajos';
import { alertaSimple } from '../lib/alerta';
import { Paleta } from '@/constants/theme';

// Ícono de chat de la barra superior. El chat es por trabajo: abre el del trabajo aceptado
// más reciente que siga activo (en curso o, si no hay, asignado).
export default function BotonChat() {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);

  async function abrirChat() {
    setBuscando(true);
    try {
      const { trabajos } = await misTrabajosAsignados();
      const activo =
        trabajos.find(t => t.estado === 'en_progreso') ?? trabajos.find(t => t.estado === 'asignado');

      if (activo) {
        router.push({ pathname: '/chat', params: { trabajoId: activo.id } } as any);
      } else {
        alertaSimple('Sin chats activos', 'El chat con el empleador se habilita cuando aceptás un trabajo.');
      }
    } catch (e: any) {
      alertaSimple('No pudimos abrir el chat', e?.message || 'Intentá de nuevo.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Pressable
      onPress={abrirChat}
      disabled={buscando}
      className="w-11 h-11 rounded-full bg-white items-center justify-center border border-neutro active:opacity-70">
      {buscando ? (
        <ActivityIndicator size="small" color={Paleta.principal} />
      ) : (
        <MaterialIcons name="chat-bubble-outline" size={22} color={Paleta.principal} />
      )}
    </Pressable>
  );
}
