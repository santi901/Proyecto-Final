import { Injectable } from '@nestjs/common';
import { calcularDistanciaKm } from './haversine.util';

export interface Job {
  id: string;
  titulo: string;
  categoria: string;
  lat: number;
  lng: number;
}

@Injectable()
export class LocationService {
  private ubicaciones: Map<string, { lat: number; lng: number }> = new Map();

  actualizarUbicacion(workerId: string, lat: number, lng: number) {
    this.ubicaciones.set(workerId, { lat, lng });
    return { mensaje: 'Ubicación actualizada' };
  }

  filtrarJobsCercanos(workerId: string, radioKm: number, jobs: Job[]) {
    const ubicacion = this.ubicaciones.get(workerId);

    if (!ubicacion) {
      return { error: 'Trabajador no encontrado' };
    }

    const cercanos = jobs.filter((job) => {
      const distancia = calcularDistanciaKm(
        ubicacion.lat, ubicacion.lng,
        job.lat, job.lng
      );
      return distancia <= radioKm;
    });

    return { jobs: cercanos };
  }
}