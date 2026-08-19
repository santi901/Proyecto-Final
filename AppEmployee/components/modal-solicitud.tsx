import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Paleta } from '@/constants/theme';
import { SEGUNDOS_LIMITE_POR_DEFECTO, type Trabajo } from '../lib/trabajo';

type Props = {
  trabajo: Trabajo | null;
  onAceptar: (trabajo: Trabajo) => void;
  onRechazar: () => void;
  /** Se llama cuando se acaba el tiempo: cuenta como rechazo automático. */
  onVencer: () => void;
};

// Solicitud entrante de trabajo. Se muestra encima de la pantalla de búsqueda con el
// título, la descripción, el pago y una cuenta regresiva. El límite lo define el backend
// de Ignacio en `segundos_limite`; si no lo manda, son 30 segundos.
export default function ModalSolicitud({ trabajo, onAceptar, onRechazar, onVencer }: Props) {
  const limite = trabajo?.segundos_limite ?? SEGUNDOS_LIMITE_POR_DEFECTO;
  const [restante, setRestante] = useState(limite);
  const progreso = useRef(new Animated.Value(1)).current;

  // Un `ref` para el callback de vencimiento: así el temporizador no se reinicia
  // cada vez que la pantalla de arriba vuelve a renderizar.
  const alVencer = useRef(onVencer);
  alVencer.current = onVencer;

  useEffect(() => {
    if (!trabajo) return;

    setRestante(limite);
    progreso.setValue(1);
    Animated.timing(progreso, {
      toValue: 0,
      duration: limite * 1000,
      useNativeDriver: false,
    }).start();

    const reloj = setInterval(() => {
      setRestante(anterior => {
        if (anterior <= 1) {
          clearInterval(reloj);
          alVencer.current();
          return 0;
        }
        return anterior - 1;
      });
    }, 1000);

    return () => clearInterval(reloj);
  }, [trabajo, limite, progreso]);

  if (!trabajo) return null;

  const ancho = progreso.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onRechazar}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(12,21,49,0.55)' }}>
        <View className="w-full bg-white rounded-3xl overflow-hidden">
          {/* Cuenta regresiva */}
          <View className="bg-principal px-5 pt-5 pb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-white text-base font-nunito-bold">Nueva solicitud</Text>
              <View className="flex-row items-center gap-1.5">
                <MaterialIcons name="timer" size={18} color={Paleta.acento} />
                <Text className="text-acento text-base font-nunito-bold">{restante}s</Text>
              </View>
            </View>
            <View className="h-1.5 rounded-full bg-white/20 overflow-hidden">
              <Animated.View style={{ width: ancho, height: '100%', backgroundColor: Paleta.acento }} />
            </View>
          </View>

          <View className="px-5 pt-5 pb-5">
            <Text className="text-principal text-xl font-nunito-bold mb-1">{trabajo.titulo}</Text>
            <Text className="text-neutro text-xs font-nunito-semi uppercase mb-3">
              {trabajo.categoria}
              {trabajo.nivel_dificultad ? ` · ${trabajo.nivel_dificultad}` : ''}
            </Text>

            <Text className="text-neutro text-sm font-nunito leading-5 mb-4">{trabajo.descripcion}</Text>

            {trabajo.direccion ? (
              <View className="flex-row items-start mb-4">
                <MaterialIcons name="place" size={18} color={Paleta.principal} />
                <Text className="flex-1 text-principal text-sm font-nunito ml-2">{trabajo.direccion}</Text>
              </View>
            ) : null}

            <View className="bg-fondo-suave border border-neutro rounded-xl px-4 py-3 mb-5">
              <Text className="text-neutro text-xs font-nunito mb-0.5">Pago por el trabajo</Text>
              <Text className="text-principal text-2xl font-nunito-bold">${trabajo.precio}</Text>
            </View>

            <Pressable
              onPress={() => onAceptar(trabajo)}
              className="bg-principal rounded-xl py-4 items-center active:opacity-90 mb-2.5">
              <Text className="text-white text-base font-nunito-bold">Aceptar</Text>
            </Pressable>

            <Pressable
              onPress={onRechazar}
              className="bg-white rounded-xl py-4 items-center border-[1.5px] border-principal active:opacity-70">
              <Text className="text-principal text-base font-nunito-bold">Rechazar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
