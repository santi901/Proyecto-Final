import { Module } from '@nestjs/common';
import { VerificacionController } from './verificacion.controller';
import { VerificacionService } from './verificacion.service';
import { StorageService } from './storage.service';
import { TextractService } from './textract.service';

@Module({
  controllers: [VerificacionController],
  providers: [VerificacionService, StorageService, TextractService],
})
export class VerificacionModule {}