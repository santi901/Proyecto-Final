import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  CalificacionesService,
  CrearCalificacionParams,
} from './calificaciones.service';

@Controller('calificaciones')
export class CalificacionesController {
  constructor(private readonly calificacionesService: CalificacionesService) {}

  @Post()
  crear(@Body() body: CrearCalificacionParams) {
    return this.calificacionesService.crearCalificacion(body);
  }

  @Get()
  listar(@Query('empleadoId') empleadoId: string) {
    if (!empleadoId) {
      throw new BadRequestException('empleadoId es requerido.');
    }
    return this.calificacionesService.listarPorEmpleado(empleadoId);
  }
}
