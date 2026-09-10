import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { EvidenciaService } from './evidencia.service';

@Controller('trabajos/:trabajoId/evidencia')
export class EvidenciaController {
  constructor(private readonly evidenciaService: EvidenciaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('foto'))
  async subir(
    @Param('trabajoId') trabajoId: string,
    @Body('subidoPor') subidoPor: string,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (!foto) {
      throw new BadRequestException('Tenés que enviar una foto de evidencia.');
    }

    return this.evidenciaService.subirEvidencia(
      trabajoId,
      subidoPor,
      foto.buffer,
    );
  }

  @Get()
  listar(@Param('trabajoId') trabajoId: string) {
    return this.evidenciaService.listarEvidencia(trabajoId);
  }
}
