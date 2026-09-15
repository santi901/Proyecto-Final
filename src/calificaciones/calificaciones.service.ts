import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

const ESTADO_TRABAJO_COMPLETADO = 'completado';

interface SupabaseSingleResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

interface SupabaseListResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

export interface CrearCalificacionParams {
  trabajoId: string;
  calificadorId: string;
  calificadoId: string;
  puntaje: number;
  comentario?: string;
}

export interface CalificacionRow {
  id: string;
  trabajo_id: string;
  calificador_id: string;
  calificado_id: string;
  puntaje: number;
  comentario: string | null;
  creado_en: string;
}

@Injectable()
export class CalificacionesService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async crearCalificacion(
    params: CrearCalificacionParams,
  ): Promise<CalificacionRow> {
    const { trabajoId, calificadorId, calificadoId, puntaje, comentario } =
      params;

    if (!trabajoId || !calificadorId || !calificadoId) {
      throw new BadRequestException(
        'trabajoId, calificadorId y calificadoId son requeridos.',
      );
    }
    if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 5) {
      throw new BadRequestException(
        'El puntaje debe ser un entero entre 1 y 5.',
      );
    }

    const {
      data: trabajo,
      error: trabajoError,
    }: SupabaseSingleResult<{ id: string; estado: string }> =
      await this.supabase
        .from('trabajos')
        .select('id, estado')
        .eq('id', trabajoId)
        .maybeSingle();

    if (trabajoError || !trabajo) {
      throw new BadRequestException('No se encontró el trabajo.');
    }
    if (trabajo.estado !== ESTADO_TRABAJO_COMPLETADO) {
      throw new BadRequestException(
        'Solo se puede calificar un trabajo completado.',
      );
    }

    const {
      data: calificacionExistente,
    }: SupabaseSingleResult<{ id: string }> = await this.supabase
      .from('calificaciones')
      .select('id')
      .eq('trabajo_id', trabajoId)
      .maybeSingle();

    if (calificacionExistente) {
      throw new BadRequestException('Este trabajo ya fue calificado.');
    }

    const {
      data: calificacion,
      error: insertError,
    }: SupabaseSingleResult<CalificacionRow> = await this.supabase
      .from('calificaciones')
      .insert({
        trabajo_id: trabajoId,
        calificador_id: calificadorId,
        calificado_id: calificadoId,
        puntaje,
        comentario: comentario ?? null,
      })
      .select()
      .single();

    if (insertError || !calificacion) {
      throw new BadRequestException('Error al registrar la calificación.');
    }

    await this.recalcularReputacion(calificadoId);

    return calificacion;
  }

  async listarPorEmpleado(empleadoId: string): Promise<CalificacionRow[]> {
    if (!empleadoId) {
      throw new BadRequestException('empleadoId es requerido.');
    }

    const { data, error }: SupabaseListResult<CalificacionRow> =
      await this.supabase
        .from('calificaciones')
        .select('*')
        .eq('calificado_id', empleadoId)
        .order('creado_en', { ascending: false });

    if (error) {
      throw new BadRequestException('Error al obtener las calificaciones.');
    }

    return data ?? [];
  }

  // La reputación se guarda desnormalizada en empleados.reputacion para que
  // el matching (que ordena por reputación) no tenga que promediar en cada consulta.
  private async recalcularReputacion(empleadoId: string): Promise<void> {
    const { data, error }: SupabaseListResult<{ puntaje: number }> =
      await this.supabase
        .from('calificaciones')
        .select('puntaje')
        .eq('calificado_id', empleadoId);

    if (error || !data || data.length === 0) {
      return;
    }

    const promedio =
      data.reduce((suma, fila) => suma + fila.puntaje, 0) / data.length;

    await this.supabase
      .from('empleados')
      .update({ reputacion: parseFloat(promedio.toFixed(2)) })
      .eq('id', empleadoId);
  }
}
