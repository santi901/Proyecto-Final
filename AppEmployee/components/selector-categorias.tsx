import { Pressable, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CATEGORIAS } from '../lib/categorias';
import { Paleta } from '@/constants/theme';

type Props = {
  seleccionadas: string[];
  onCambiar: (categorias: string[]) => void;
};

// Multi-select de las categorías en las que trabaja el trabajador. Es lo que usa el
// matching de Ignacio para filtrar quién puede tomar cada trabajo, así que se manda
// tal cual al backend en `categorias: string[]`.
export default function SelectorCategorias({ seleccionadas, onCambiar }: Props) {
  function alternar(categoria: string) {
    onCambiar(
      seleccionadas.includes(categoria)
        ? seleccionadas.filter(c => c !== categoria)
        : [...seleccionadas, categoria],
    );
  }

  return (
    <View className="mb-4">
      {CATEGORIAS.map(categoria => {
        const elegida = seleccionadas.includes(categoria);
        return (
          <Pressable
            key={categoria}
            onPress={() => alternar(categoria)}
            className={`flex-row items-center rounded-[10px] px-4 py-3 mb-2 border ${
              elegida ? 'bg-acento border-principal' : 'bg-white border-neutro'
            } active:opacity-70`}>
            <View
              className={`w-5 h-5 rounded items-center justify-center border-2 ${
                elegida ? 'bg-principal border-principal' : 'bg-white border-neutro'
              }`}>
              {elegida && <MaterialIcons name="check" size={14} color={Paleta.blanco} />}
            </View>
            <Text
              className={`text-base ml-3 ${
                elegida ? 'text-principal font-nunito-semi' : 'text-neutro font-nunito'
              }`}>
              {categoria}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
