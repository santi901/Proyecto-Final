import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { LocationService } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('calcular-viaje')
  calcularViaje(
    @Query('direccionTrabajador') direccionTrabajador: string,
    @Query('direccionEmpleador') direccionEmpleador: string,
  ) {
    return this.locationService.calcularViaje({
      direccionTrabajador,
      direccionEmpleador,
    });
  }

  @Post('actualizar-ubicacion')
  actualizarUbicacion(
    @Body() body: { workerId: string; lat: number; lng: number; jobId?: string },
  ) {
    return this.locationService.actualizarUbicacion(
      body.workerId,
      body.lat,
      body.lng,
      body.jobId,
    );
  }
}