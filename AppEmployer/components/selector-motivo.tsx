import { Pressable, Text, TextInput, View } from 'react-native';
import { Paleta } from '@/constants/theme';

// Sprint 6 — lista de motivos (chips) + detalle opcional, para cancelar un trabajo o
// reportar un problema. Los motivos vienen del backend; si es "otro", el backend exige
// el detalle, así que acá se marca como obligatorio. Mismo archivo en las dos apps.

type Props = {
  motivos: { codigo: string; texto: string }[] | null;
  valor: string | null;
  onCambiar: (codigo: string) => void;
  detalle: string;
  onDetalle: (texto: string) => void;
  placeholderDetalle?: string;
  maxLargoDetalle?: number;
};

export default function SelectorMotivo({
  motivos, valor, onCambiar, detalle, onDetalle,
  placeholderDetalle = 'Contanos un poco más (opcional)', maxLargoDetalle = 300,
}: Props) {
  if (!motivos) {
    return <Text className="text-neutro text-sm font-nunito mb-3">Cargando motivos…</Text>;
  }

  const esOtro = valor === 'otro';

  return (
    <View>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {motivos.map(m => {
          const sel = valor === m.codigo;
          return (
            <Pressable
              key={m.codigo}
              onPress={() => onCambiar(m.codigo)}
              className={`px-3 py-2 rounded-full border active:opacity-70 ${
                sel ? 'bg-principal border-principal' : 'bg-white border-neutro'
              }`}>
              <Text className={`text-[13px] font-nunito-semi ${sel ? 'text-white' : 'text-principal'}`}>{m.texto}</Text>
            </Pressable>
          );
        })}
      </View>

      {valor ? (
        <TextInput
          className="bg-white border border-neutro rounded-[10px] px-4 py-3 mb-3 text-[15px] font-nunito text-principal h-20"
          style={{ textAlignVertical: 'top' }}
          placeholder={esOtro ? 'Contanos qué pasó (obligatorio)' : placeholderDetalle}
          placeholderTextColor={Paleta.neutro}
          value={detalle}
          onChangeText={onDetalle}
          multiline
          maxLength={maxLargoDetalle}
        />
      ) : null}
    </View>
  );
}
