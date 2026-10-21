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

const MAX_BYTES_FOTO = 10 * 1024 * 1024;

// JPEG (FF D8 FF) o PNG (89 50 4E 47), por contenido y no por lo que diga el cliente.
function esImagen(buffer: Buffer): boolean {
  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const png = buffer.length >= 4 && buffer.readUInt32BE(0) === 0x89504e47;
  return jpeg || png;
}

// La foto puede llegar de dos formas:
//   - JSON { fotoBase64, subidoPor } — lo que manda AppEmployee. Antes mandaba multipart
//     con un `File` de expo-file-system en el FormData, y según qué fetch lo serializara
//     no llegaba el contenido del archivo (mismo problema que tuvo la verificación).
//   - multipart con el campo `foto` (formato anterior, sigue aceptado).
// El JSON con la foto en base64 pesa varios MB: main.ts sube el límite del body a 15mb.
function decodificarFoto(
  archivo: Express.Multer.File | undefined,
  base64: string | undefined,
): Buffer {
  let buffer: Buffer | undefined = archivo?.buffer;
  if (!buffer && typeof base64 === 'string' && base64) {
    const limpio = base64.includes(',')
      ? base64.slice(base64.indexOf(',') + 1)
      : base64;
    buffer = Buffer.from(limpio, 'base64');
  }

  if (!buffer?.length) {
    throw new BadRequestException('Tenés que enviar una foto de evidencia.');
  }
  if (buffer.length > MAX_BYTES_FOTO) {
    throw new BadRequestException('La foto puede pesar hasta 10 MB.');
  }
  if (!esImagen(buffer)) {
    throw new BadRequestException('La foto tiene que ser JPG o PNG.');
  }
  return buffer;
}

@Controller('trabajos/:trabajoId/evidencia')
export class EvidenciaController {
  constructor(private readonly evidenciaService: EvidenciaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('foto'))
  async subir(
    @Param('trabajoId') trabajoId: string,
    @Body('subidoPor') subidoPor: string,
    @Body('fotoBase64') fotoBase64?: string,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    return this.evidenciaService.subirEvidencia(
      trabajoId,
      subidoPor,
      decodificarFoto(foto, fotoBase64),
    );
  }

  @Get()
  listar(@Param('trabajoId') trabajoId: string) {
    return this.evidenciaService.listarEvidencia(trabajoId);
  }
}
