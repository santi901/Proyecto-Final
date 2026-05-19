import { Controller, Post, UploadedFiles, UseInterceptors, Body, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { VerificacionService } from './verificacion.service';
import { StorageService } from './storage.service';

@Controller('verificacion')
export class VerificacionController {

  constructor(
    private readonly verificacionService: VerificacionService,
    private readonly storageService: StorageService,
  ) {}

  @Post('comparar-caras')
  @UseInterceptors(FilesInterceptor('imagenes', 2))
  async compararCaras(@UploadedFiles() imagenes: any[], @Body('userId') userId: string) {
   if (!imagenes || !Array.isArray(imagenes) || imagenes.length < 2) {
      throw new BadRequestException('Tenés que enviar exactamente dos imágenes: la foto del DNI y una selfie.');
    }

    const [dni, selfie] = imagenes;
    const userId_ = userId ?? 'sin-id';

    const [rutaDni, rutaSelfie] = await Promise.all([
      this.storageService.guardarImagen(dni.buffer, 'dni', userId_),
      this.storageService.guardarImagen(selfie.buffer, 'selfie', userId_),
    ]);

    const resultado = await this.verificacionService.compararCaras(
      dni.buffer,
      selfie.buffer,
    );

    return {
      coinciden: resultado.coinciden,
      similitud: resultado.similitud,
      estado: resultado.coinciden ? 'aprobado' : 'rechazado',
      mensaje: resultado.coinciden ? 'Identidad verificada' : 'Las caras no coinciden. La foto del DNI y la selfie deben ser de la misma persona.',
      archivos: {
        dni: rutaDni,
        selfie: rutaSelfie,
      },
    };
  }
}