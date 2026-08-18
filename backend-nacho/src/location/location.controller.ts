import { Controller, Get, Query } from '@nestjs/common';
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
}