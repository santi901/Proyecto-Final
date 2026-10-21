import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { urlDeEvidencia, type Evidencia } from '../lib/evidencia';
import { Paleta } from '@/constants/theme';

// Foto de evidencia que subió el trabajador al terminar, para el seguimiento del empleador.
//   · se muestra entera, con su proporción (antes se recortaba a 220px de alto)
//   · spinner mientras baja de S3; tocándola se abre en pantalla completa
//   · si no carga (la URL firmada vence a la hora), botón para pedir una nueva
//
// Conviene montarla con `key={evidencias?.[0]?.id}` para que el estado se reinicie
// cuando llega una foto nueva.

const ALTO_MAXIMO = 360;
const PROPORCION_POR_DEFECTO = 4 / 3;

function fechaCorta(iso: string) {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export default function FotoEvidencia({
  evidencias,
  onReintentar,
}: {
  evidencias: Evidencia[] | null;
  /** Vuelve a pedir la lista (con URLs firmadas nuevas). */
  onReintentar?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [proporcion, setProporcion] = useState(PROPORCION_POR_DEFECTO);
  const [ampliada, setAmpliada] = useState(false);

  const ultima = evidencias?.[0] ?? null;
  const url = ultima ? urlDeEvidencia(ultima) : null;

  if (evidencias === null) {
    return (
      <View className="h-32 items-center justify-center">
        <ActivityIndicator color={Paleta.principal} />
      </View>
    );
  }

  if (!ultima) {
    return (
      <View className="h-32 items-center justify-center px-6">
        <MaterialIcons name="hourglass-empty" size={28} color={Paleta.neutro} />
        <Text className="text-neutro text-sm font-nunito mt-2 text-center">
          Todavía no hay foto del trabajador
        </Text>
      </View>
    );
  }

  const pie = (
    <View className="flex-row items-center px-4 py-3">
      <MaterialIcons name="photo-camera" size={16} color={Paleta.neutro} />
      <Text className="flex-1 text-neutro text-xs font-nunito ml-2">
        Subida por el trabajador · {fechaCorta(ultima.creado_en)}
        {evidencias.length > 1 ? ` · ${evidencias.length} fotos (se muestra la última)` : ''}
      </Text>
      {estado === 'ok' ? <MaterialIcons name="zoom-in" size={18} color={Paleta.principal} /> : null}
    </View>
  );

  if (!url || estado === 'error') {
    return (
      <View>
        <View className="h-36 items-center justify-center px-6">
          <MaterialIcons name="broken-image" size={30} color={Paleta.neutro} />
          <Text className="text-principal text-sm font-nunito-semi mt-2 text-center">
            No se pudo mostrar la foto
          </Text>
          {onReintentar ? (
            <Pressable onPress={onReintentar} className="mt-2 px-4 py-1.5 active:opacity-70">
              <Text className="text-principal text-sm font-nunito-semi underline">Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
        {pie}
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={() => estado === 'ok' && setAmpliada(true)} className="active:opacity-90">
        <View style={{ width: '100%', aspectRatio: proporcion, maxHeight: ALTO_MAXIMO }} className="bg-fondo-suave">
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            onLoad={e => {
              const fuente = (e.nativeEvent as any)?.source;
              if (fuente?.width && fuente?.height) setProporcion(fuente.width / fuente.height);
              setEstado('ok');
            }}
            onError={() => setEstado('error')}
          />
          {estado === 'cargando' ? (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color={Paleta.principal} />
            </View>
          ) : null}
        </View>
      </Pressable>
      {pie}

      {/* Pantalla completa */}
      <Modal visible={ampliada} transparent animationType="fade" onRequestClose={() => setAmpliada(false)}>
        <Pressable onPress={() => setAmpliada(false)} className="flex-1 bg-black items-center justify-center">
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          <View className="absolute right-4" style={{ top: insets.top + 12 }}>
            <View className="w-10 h-10 rounded-full bg-black/60 items-center justify-center">
              <MaterialIcons name="close" size={24} color={Paleta.blanco} />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
