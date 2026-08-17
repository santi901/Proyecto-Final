import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { calcularDistanciaKm } from '../location/haversine.util';

const RADIO_BUSQUEDA_DEFAULT_KM = 10;
const ESTADOS_TRABAJO_ACTIVO = ['asignado', 'en_progreso'];

export interface TrabajadorDisponible {
  id: string;
  userId: string;
  nombre: string;
  apellido: string;
  distanciaKm: number;
}

@Injectable()
export class MatchingService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async trabajadoresDisponibles(
    trabajoId: string,
    radioKm?: number,
  ): Promise<TrabajadorDisponible[]> {
    if (!trabajoId) {
      throw new BadRequestException('trabajoId es requerido.');
    }

    const { data: trabajo, error: trabajoError } = await this.supabase
      .from('trabajos')
      .select('id, categoria, empleador_id')
      .eq('id', trabajoId)
      .maybeSingle();

    if (trabajoError || !trabajo) {
      throw new BadRequestException('No se encontró el trabajo.');
    }

    // El trabajo no guarda su propia lat/lng, así que se usa la ubicación
    // del perfil del empleador que lo publicó.
    const { data: empleador, error: empleadorError } = await this.supabase
      .from('perfiles')
      .select('lat, lng')
      .eq('id', trabajo.empleador_id)
      .maybeSingle();

    if (empleadorError || !empleador || empleador.lat == null || empleador.lng == null) {
      throw new BadRequestException(
        'El empleador de este trabajo no tiene una ubicación cargada.',
      );
    }

    const { data: candidatos, error: candidatosError } = await this.supabase
      .from('empleados')
      .select('id, user_id, nombre, apellido, lat, lng, radio_busqueda, categorias')
      .contains('categorias', [trabajo.categoria])
      .not('lat', 'is', null)
      .not('lng', 'is', null);

    if (candidatosError) {
      throw new BadRequestException('Error al buscar trabajadores.');
    }

    // "Disponible" también significa que no está en medio de otro trabajo.
    const { data: ocupados, error: ocupadosError } = await this.supabase
      .from('trabajos')
      .select('trabajador_id')
      .in('estado', ESTADOS_TRABAJO_ACTIVO)
      .not('trabajador_id', 'is', null);

    if (ocupadosError) {
      throw new BadRequestException('Error al verificar disponibilidad.');
    }

    const idsOcupados = new Set((ocupados ?? []).map((t) => t.trabajador_id as string));

    return (candidatos ?? [])
      .filter((candidato) => !idsOcupados.has(candidato.id as string))
      .map((candidato) => ({
        id: candidato.id as string,
        userId: candidato.user_id as string,
        nombre: candidato.nombre as string,
        apellido: candidato.apellido as string,
        radioMaximoKm:
          radioKm ?? (candidato.radio_busqueda as number) ?? RADIO_BUSQUEDA_DEFAULT_KM,
        distanciaKm: calcularDistanciaKm(
          empleador.lat as number,
          empleador.lng as number,
          candidato.lat as number,
          candidato.lng as number,
        ),
      }))
      .filter((candidato) => candidato.distanciaKm <= candidato.radioMaximoKm)
      .sort((a, b) => a.distanciaKm - b.distanciaKm)
      .map(({ id, userId, nombre, apellido, distanciaKm }) => ({
        id,
        userId,
        nombre,
        apellido,
        distanciaKm: parseFloat(distanciaKm.toFixed(2)),
      }));
  }
}
