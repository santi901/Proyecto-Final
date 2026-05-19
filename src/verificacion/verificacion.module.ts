import { Module } from '@nestjs/common';
import { VerificacionController } from './verificacion.controller';
import { VerificacionService } from './verificacion.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [VerificacionController],
  providers: [VerificacionService, StorageService],
})
export class VerificacionModule {}