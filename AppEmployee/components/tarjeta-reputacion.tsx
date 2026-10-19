import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Paleta } from '@/constants/theme';
import { formatearPuntaje, type Reputacion } from '../lib/reputacion';

// Estrellas de solo lectura (con media estrella) para un valor de 0 a 5.
export function EstrellasLectura({ valor, tamano = 18 }: { valor: number; tamano?: number }) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map(n => {
        const icono = valor >= n ? 'star' : valor >= n - 0.5 ? 'star-half' : 'star-border';
        return (
          <MaterialIcons
            key={n}
            name={icono}
            size={tamano}
            color={icono === 'star-border' ? Paleta.neutro : Paleta.acento}
          />
        );
      })}
    </View>
  );
}

type Props = {
  reputacion: Reputacion;
  /** Muestra también las últimas calificaciones con su comentario. */
  conComentarios?: boolean;
};

// Resumen de la reputación del trabajador: score (lo que usa el matching), promedio
// de estrellas y los datos que lo forman. Se usa en el perfil del trabajador y en el
// seguimiento del empleador.
export default function TarjetaReputacion({ reputacion, conComentarios = false }: Props) {
  const r = reputacion;
  const sinCalificaciones = r.cantidadCalificaciones === 0;

  return (
    <View className="bg-white border border-neutro rounded-xl p-4">
      <View className="flex-row items-center">
        <View className="w-16 h-16 rounded-full bg-principal items-center justify-center mr-4">
          <Text className="text-acento text-xl font-nunito-bold">{formatearPuntaje(r.score)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-neutro text-xs font-nunito">Score de reputación</Text>
          <EstrellasLectura valor={r.promedio ?? 0} />
          <Text className="text-principal text-sm font-nunito-semi mt-0.5">
            {sinCalificaciones
              ? 'Todavía sin calificaciones'
              : `${formatearPuntaje(r.promedio)} de promedio · ${r.cantidadCalificaciones} calificaci${
                  r.cantidadCalificaciones === 1 ? 'ón' : 'ones'
                }`}
          </Text>
        </View>
      </View>

      <View className="flex-row mt-4 pt-3 border-t border-neutro">
        <Dato valor={String(r.trabajosCompletados)} etiqueta="Completados" />
        <Dato valor={String(r.cancelaciones)} etiqueta="Cancelados" />
        <Dato valor={`${Math.round(r.tasaCancelacion * 100)}%`} etiqueta="Tasa de cancelación" />
      </View>

      {sinCalificaciones ? (
        <Text className="text-neutro text-xs font-nunito mt-3 leading-4">
          Los trabajadores nuevos arrancan con 3,0. El score sube con buenas calificaciones,
          pesan más las recientes y baja si cancelás trabajos que aceptaste.
        </Text>
      ) : null}

      {conComentarios && r.ultimasCalificaciones?.length ? (
        <View className="mt-4 pt-3 border-t border-neutro">
          <Text className="text-principal text-sm font-nunito-bold mb-2">Últimas calificaciones</Text>
          {r.ultimasCalificaciones.map((c, i) => (
            <View key={`${c.creado_en}-${i}`} className="mb-2.5">
              <EstrellasLectura valor={c.puntaje} tamano={14} />
              {c.comentario ? (
                <Text className="text-principal text-[13px] font-nunito mt-0.5">“{c.comentario}”</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-principal text-base font-nunito-bold">{valor}</Text>
      <Text className="text-neutro text-[11px] font-nunito text-center">{etiqueta}</Text>
    </View>
  );
}
