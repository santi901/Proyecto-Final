import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Paleta } from '@/constants/theme';
import { ContextoFoco, useTecladoEnScroll } from './foco-campos';

/**
 * Panel que se desliza de abajo hacia arriba sobre el mapa.
 *
 * El mapa va de fondo ocupando toda la pantalla y este panel se apoya encima: arranca
 * bajado (se ve el mapa entero) y se sube arrastrando la cabecera o tocando la manija.
 * Aun subido del todo deja libre la franja de arriba, así el mapa nunca deja de verse.
 *
 * Importante: el panel se ancla en `bottom: 0` del área de la pantalla, que ya está por
 * encima de la barra de pestañas. Anclarlo más arriba deja una franja de mapa colgada
 * abajo (el problema que tenía la pantalla antes).
 *
 * Los `CampoTexto` que van adentro quedan por encima del teclado igual que en
 * `VistaFormulario`, y al abrirse el teclado el panel se sube solo.
 */

type Props = {
  /** Cabecera fija: junto con la manija, es la zona de la que se arrastra el panel. */
  cabecera?: ReactNode;
  /** Contenido scrolleable del panel. */
  children: ReactNode;
  /** Parte del alto disponible que ocupa el panel cuando está subido (0 a 1). */
  proporcion?: number;
  /** Alto visible del panel cuando está bajado. */
  asoma?: number;
  /** Color de fondo del panel. Por defecto, el crema del design system. */
  fondo?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export default function PanelDeslizable({
  cabecera,
  children,
  proporcion = 0.72,
  asoma = 250,
  fondo = Paleta.fondoSuave,
  contentContainerStyle,
}: Props) {
  /** Alto del área disponible (la pantalla, ya sin la barra de pestañas). */
  const [disponible, setDisponible] = useState(0);

  const altoPanel = Math.max(Math.round(disponible * proporcion), asoma);
  const bajado = Math.max(altoPanel - asoma, 0);

  const translateY = useRef(new Animated.Value(0)).current;
  const posicion = useRef(0);
  const [subido, setSubido] = useState(false);
  /** El panel arranca bajado, pero recién se sabe cuánto al tener el primer layout. */
  const posicionInicial = useRef(false);

  const irA = useCallback(
    (destino: number) => {
      Animated.spring(translateY, { toValue: destino, useNativeDriver: true, bounciness: 2 }).start();
      posicion.current = destino;
      setSubido(destino === 0);
    },
    [translateY],
  );

  // Con el teclado abierto el panel se sube solo: si no, el campo enfocado queda
  // atrapado entre el teclado y el borde de abajo de la pantalla.
  const { refScroll, espacioTeclado, avisarFoco, alDesplazar } = useTecladoEnScroll({
    alAbrirTeclado: () => irA(0),
  });

  function alMedir(evento: LayoutChangeEvent) {
    const alto = evento.nativeEvent.layout.height;
    setDisponible(alto);

    if (!posicionInicial.current && alto > 0) {
      posicionInicial.current = true;
      const inicio = Math.max(Math.round(alto * proporcion), asoma) - asoma;
      translateY.setValue(inicio);
      posicion.current = inicio;
    }
  }

  // El PanResponder se crea una sola vez: `irA` es estable, pero el tope cambia al
  // conocerse el alto real, así que se lee desde un ref que se actualiza aparte.
  const tope = useRef(0);
  useEffect(() => { tope.current = bajado; }, [bajado]);

  const arrastre = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesto) => Math.abs(gesto.dy) > 4,
      onPanResponderMove: (_, gesto) => {
        let siguiente = posicion.current + gesto.dy;
        if (siguiente < 0) siguiente = 0;
        if (siguiente > tope.current) siguiente = tope.current;
        translateY.setValue(siguiente);
      },
      onPanResponderRelease: (_, gesto) => {
        const limite = tope.current;
        const actual = posicion.current + gesto.dy;
        if (gesto.vy < -0.4) irA(0);
        else if (gesto.vy > 0.4) irA(limite);
        else irA(actual < limite / 2 ? 0 : limite);
      },
    }),
  ).current;

  return (
    <View
      onLayout={alMedir}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: altoPanel,
          backgroundColor: fondo,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 12,
        }}>
        {/* Zona de arrastre: la manija y la cabecera que le pase la pantalla */}
        <View {...arrastre.panHandlers}>
          <Pressable
            onPress={() => irA(subido ? bajado : 0)}
            className="items-center pt-3 pb-1 active:opacity-70">
            <View className="w-10 h-1.5 rounded-full bg-neutro" />
            <MaterialIcons
              name={subido ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
              size={24}
              color={Paleta.neutro}
            />
          </Pressable>
          {cabecera}
        </View>

        <ContextoFoco.Provider value={avisarFoco}>
          <ScrollView
            ref={refScroll}
            contentContainerStyle={contentContainerStyle}
            onScroll={alDesplazar}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none">
            {children}
            {/* Espacio extra al final para poder seguir bajando con el teclado abierto. */}
            <View style={{ height: espacioTeclado }} />
          </ScrollView>
        </ContextoFoco.Provider>
      </Animated.View>
    </View>
  );
}
