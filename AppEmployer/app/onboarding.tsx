import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, Dimensions, Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { marcarOnboardingVisto } from '../auth';
import { Paleta } from '@/constants/theme';

const { width: WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'post-add' as const,
    titulo: 'Publicá un trabajo en minutos',
    texto: 'Cargá título, categoría y dificultad. El precio ya está definido: sin regateos ni vueltas.',
  },
  {
    icon: 'place' as const,
    titulo: 'Trabajadores cerca tuyo',
    texto: 'Te conectamos con changarines cerca de tu dirección para que el trabajo se resuelva rápido.',
  },
  {
    icon: 'payments' as const,
    titulo: 'Pagá seguro por la app',
    texto: 'La app retiene el pago y lo libera al terminar el trabajo. Vos pagás tranquilo y ellos cobran seguro.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);
  const [indice, setIndice] = useState(0);

  const esUltima = indice === SLIDES.length - 1;

  async function terminar() {
    await marcarOnboardingVisto();
    router.replace('/');
  }

  function siguiente() {
    if (esUltima) { terminar(); return; }
    const proximo = indice + 1;
    scrollRef.current?.scrollTo({ x: WIDTH * proximo, animated: true });
    setIndice(proximo);
  }

  return (
    <View className="flex-1 bg-fondo" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
      {/* Saltar */}
      <View className="flex-row justify-end px-5 pt-2">
        <Pressable onPress={terminar} className="py-2 px-2 active:opacity-60">
          <Text className="text-neutro text-sm font-nunito-semi">Saltar</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={e =>
          setIndice(Math.round(e.nativeEvent.contentOffset.x / WIDTH))
        }>
        {SLIDES.map((s, i) => {
          const inputRange = [(i - 1) * WIDTH, i * WIDTH, (i + 1) * WIDTH];
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          const scale = scrollX.interpolate({ inputRange, outputRange: [0.85, 1, 0.85], extrapolate: 'clamp' });
          return (
            <View key={s.titulo} style={{ width: WIDTH }} className="items-center justify-center px-9">
              <Animated.View style={{ opacity, transform: [{ scale }] }} className="items-center">
                <View className="w-36 h-36 rounded-full bg-acento items-center justify-center mb-10">
                  <MaterialIcons name={s.icon} size={72} color={Paleta.principal} />
                </View>
                <Text className="text-principal text-3xl font-nunito-bold text-center mb-4">{s.titulo}</Text>
                <Text className="text-neutro text-base font-nunito text-center leading-6">{s.texto}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      {/* Indicadores (dots) */}
      <View className="flex-row justify-center items-center gap-2 mb-6">
        {SLIDES.map((s, i) => {
          const inputRange = [(i - 1) * WIDTH, i * WIDTH, (i + 1) * WIDTH];
          const ancho = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={s.titulo}
              style={{ width: ancho, opacity, height: 8, borderRadius: 4, backgroundColor: Paleta.principal }}
            />
          );
        })}
      </View>

      {/* Botón */}
      <View className="px-9">
        <Pressable
          onPress={siguiente}
          className="bg-principal rounded-xl py-4 items-center active:opacity-90">
          <Text className="text-white text-base font-nunito-bold">
            {esUltima ? 'Empezar' : 'Siguiente'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
