import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { calcularDistanciaKm } from './haversine.util';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

const PRECIO_NAFTA_ARS = 2070;
const RENDIMIENTO_KM_POR_LITRO = 13;

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface CalcularViajeParams {
  direccionTrabajador: string;
  direccionEmpleador: string;
}

@Injectable()
export class LocationService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async geocodificar(direccion: string): Promise<Coordenadas> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion)}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ChanguitApp/1.0 (proyecto universitario)',
      },
    });

    if (!response.ok) {
      throw new BadRequestException(
        'Error al consultar el servicio de geocodificación.',
      );
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new BadRequestException(
        `No se encontró la dirección: "${direccion}". Intentá con una dirección más completa.`,
      );
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  }

  async calcularViaje(params: CalcularViajeParams) {
    const { direccionTrabajador, direccionEmpleador } = params;

    const [coordsTrabajador, coordsEmpleador] = await Promise.all([
      this.geocodificar(direccionTrabajador),
      this.geocodificar(direccionEmpleador),
    ]);

    const distanciaKm = calcularDistanciaKm(
      coordsTrabajador.lat,
      coordsTrabajador.lng,
      coordsEmpleador.lat,
      coordsEmpleador.lng,
    );

    const litros = distanciaKm / RENDIMIENTO_KM_POR_LITRO;
    const costoARS = litros * PRECIO_NAFTA_ARS;

    return {
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
      nafta: {
        litros: parseFloat(litros.toFixed(3)),
        costoARS: Math.round(costoARS),
      },
    };
  }

  async actualizarUbicacion(
    workerId: string,
    lat: number,
    lng: number,
    jobId?: string,
  ) {
    const { error } = await this.supabase
      .from('worker_locations')
      .upsert({ worker_id: workerId, lat, lng, updated_at: new Date() });

    if (error) throw new BadRequestException('Error al guardar ubicación.');

    if (!jobId) return { mensaje: 'Ubicación actualizada' };

    const { data: job, error: jobError } = await this.supabase
      .from('jobs')
      .select('lat, lng')
      .eq('id', jobId)
      .single();

    if (jobError || !job)
      throw new BadRequestException('No se encontró el trabajo.');

    const distanciaKm = calcularDistanciaKm(lat, lng, job.lat, job.lng);
    const litros = distanciaKm / RENDIMIENTO_KM_POR_LITRO;
    const costoARS = litros * PRECIO_NAFTA_ARS;

    return {
      distanciaRestanteKm: parseFloat(distanciaKm.toFixed(2)),
      nafta: {
        litros: parseFloat(litros.toFixed(3)),
        costoARS: Math.round(costoARS),
      },
    };
  }
}
