import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  NotificacionesService,
  EnviarNotificacionParams,
  RegistrarTokenParams,
} from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Post()
  enviar(@Body() body: EnviarNotificacionParams) {
    return this.notificacionesService.enviarNotificacion(body);
  }

  @Post('registrar-token')
  async registrarToken(@Body() body: RegistrarTokenParams) {
    await this.notificacionesService.registrarToken(body);
    return { mensaje: 'Token registrado' };
  }

  @Get()
  listar(@Query('destinatarioId') destinatarioId: string) {
    if (!destinatarioId) {
      throw new BadRequestException('destinatarioId es requerido.');
    }
    return this.notificacionesService.listarNotificaciones(destinatarioId);
  }
}
