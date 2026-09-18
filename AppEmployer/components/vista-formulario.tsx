import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { ContextoFoco, useTecladoEnScroll } from './foco-campos';

/**
 * Contenedor de las pantallas de formulario (registro, login).
 *
 * Resuelve el problema de que el teclado del celular tape el campo que se está
 * completando: cuando el teclado aparece, la pantalla se desplaza lo justo para que el
 * campo enfocado quede *arriba* del teclado, y se agrega al final del scroll tanto
 * espacio como alto tenga el teclado, así siempre se puede seguir bajando.
 *
 * Los campos tienen que ser `CampoTexto`: son los que avisan cuál tomó el foco.
 */

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

export default function VistaFormulario({
  children,
  contentContainerStyle,
  className = 'flex-1 bg-fondo',
  style,
}: Props) {
  const { refScroll, espacioTeclado, avisarFoco, alDesplazar } = useTecladoEnScroll();

  return (
    <ContextoFoco.Provider value={avisarFoco}>
      <ScrollView
        ref={refScroll}
        className={className}
        style={style}
        contentContainerStyle={contentContainerStyle}
        onScroll={alDesplazar}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}>
        {children}
        {/* Espacio extra al final para poder seguir bajando con el teclado abierto. */}
        <View style={{ height: espacioTeclado }} />
      </ScrollView>
    </ContextoFoco.Provider>
  );
}
