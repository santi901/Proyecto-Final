import { Controller, Post, UploadedFiles, UseInterceptors, Body, BadRequestException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { VerificacionService } from './verificacion.service';
import { StorageService } from './storage.service';
import { TextractService } from './textract.service';

@Controller('verificacion')
export class VerificacionController {

  constructor(
    private readonly verificacionService: VerificacionService,
    private readonly storageService: StorageService,
    private readonly textractService: TextractService,
  ) {}

  @Post('comparar-caras')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'dni', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]))
  async compararCaras(
    @UploadedFiles() archivos: { dni?: any[]; selfie?: any[] },
    @Body('userId') userId: string,
  ) {
    const dni = archivos?.dni?.[0];
    const selfie = archivos?.selfie?.[0];

    if (!dni || !selfie) {
      throw new BadRequestException('Tenés que enviar exactamente dos imágenes: la foto del DNI y una selfie.');
    }

    if (dni.buffer.equals(selfie.buffer)) {
      throw new BadRequestException('El DNI y la selfie no pueden ser la misma imagen.');
    }

    await this.textractService.validarDni(dni.buffer);

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