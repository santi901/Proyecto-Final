import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Paleta } from '@/constants/theme';

type Props = {
  /** De 0 (sin elegir) a 5. */
  valor: number;
  onCambiar: (valor: number) => void;
};

// Selector de 1 a 5 estrellas para calificar al trabajador.
export default function CalificacionEstrellas({ valor, onCambiar }: Props) {
  return (
    <View className="flex-row justify-center gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <Pressable key={n} onPress={() => onCambiar(n)} hitSlop={6} className="active:opacity-70">
          <MaterialIcons
            name={n <= valor ? 'star' : 'star-border'}
            size={38}
            color={n <= valor ? Paleta.acento : Paleta.neutro}
          />
        </Pressable>
      ))}
    </View>
  );
}
