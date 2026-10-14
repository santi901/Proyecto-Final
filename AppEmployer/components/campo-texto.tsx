import { useRef } from 'react';
import {
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Paleta, sombra } from '@/constants/theme';
import { useAvisarFoco } from './foco-campos';

/**
 * Campo de texto del design system (fondo blanco, borde neutro, Nunito Sans).
 *
 * Además de unificar el estilo, le avisa al `VistaFormulario` que lo contiene cuál es
 * el campo enfocado, para que el formulario lo suba por encima del teclado.
 */

type Props = TextInputProps & {
  /** Rótulo opcional arriba del campo. Queda visible aunque el campo ya esté completo. */
  etiqueta?: string;
  /** Separación de abajo. Se puede apagar cuando el campo va dentro de otra fila. */
  margenAbajo?: boolean;
  /** Clases para el contenedor (etiqueta + campo), p. ej. `flex-1` dentro de una fila. */
  contenedorClassName?: string;
};

export default function CampoTexto({
  etiqueta,
  margenAbajo = true,
  contenedorClassName = '',
  className = '',
  onFocus,
  multiline,
  style,
  ...props
}: Props) {
  const campo = useRef<TextInput>(null);
  const avisarFoco = useAvisarFoco();

  const alEnfocar: NonNullable<TextInputProps["onFocus"]> = evento => {
    avisarFoco?.(campo.current);
    onFocus?.(evento);
  };

  return (
    <View className={`${margenAbajo ? 'mb-4' : ''} ${contenedorClassName}`}>
      {etiqueta ? (
        <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">{etiqueta}</Text>
      ) : null}
      <TextInput
        ref={campo}
        onFocus={alEnfocar}
        multiline={multiline}
        placeholderTextColor={Paleta.neutro}
        className={`bg-white rounded-[10px] px-4 py-3.5 text-base text-principal font-nunito ${className}`}
        style={[multiline ? { textAlignVertical: 'top' } : null, sombra(Paleta.acento), style]}
        {...props}
      />
    </View>
  );
}
