import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  NotificacionesService,
  EnviarNotificacionParams,
} from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Post()
  enviar(@Body() body: EnviarNotificacionParams) {
    return this.notificacionesService.enviarNotificacion(body);
  }

  @Get()
  listar(@Query('destinatarioId') destinatarioId: string) {
    return this.notificacionesService.listarNotificaciones(destinatarioId);
  }
}
