import { Injectable, BadRequestException } from '@nestjs/common';
import { calcularDistanciaKm } from './haversine.util';

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
}