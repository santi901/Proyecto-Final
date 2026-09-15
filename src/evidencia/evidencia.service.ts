import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { StorageService } from '../verificacion/storage.service';

interface SupabaseSingleResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

interface SupabaseListResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

export interface EvidenciaRow {
  id: string;
  trabajo_id: string;
  s3_key: string;
  subido_por: string;
  creado_en: string;
}

export interface EvidenciaConUrl extends EvidenciaRow {
  url: string;
}

@Injectable()
export class EvidenciaService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly storageService: StorageService,
  ) {}

  async subirEvidencia(
    trabajoId: string,
    subidoPor: string,
    foto: Buffer,
  ): Promise<EvidenciaConUrl> {
    if (!trabajoId) {
      throw new BadRequestException('trabajoId es requerido.');
    }
    if (!subidoPor) {
      throw new BadRequestException('subidoPor es requerido.');
    }

    const s3Key = await this.storageService.guardarImagen(
      foto,
      'evidencia',
      trabajoId,
    );

    const { data, error }: SupabaseSingleResult<EvidenciaRow> =
      await this.supabase
        .from('evidencias_trabajo')
        .insert({
          trabajo_id: trabajoId,
          s3_key: s3Key,
          subido_por: subidoPor,
        })
        .select()
        .single();

    if (error || !data) {
      throw new BadRequestException('Error al registrar la evidencia.');
    }

    const url = await this.storageService.obtenerUrlFirmada(data.s3_key);
    return { ...data, url };
  }

  async listarEvidencia(trabajoId: string): Promise<EvidenciaConUrl[]> {
    if (!trabajoId) {
      throw new BadRequestException('trabajoId es requerido.');
    }

    const { data, error }: SupabaseListResult<EvidenciaRow> =
      await this.supabase
        .from('evidencias_trabajo')
        .select('*')
        .eq('trabajo_id', trabajoId)
        .order('creado_en', { ascending: false });

    if (error) {
      throw new BadRequestException('Error al obtener la evidencia.');
    }

    return Promise.all(
      (data ?? []).map(async (fila) => ({
        ...fila,
        url: await this.storageService.obtenerUrlFirmada(fila.s3_key),
      })),
    );
  }
}
