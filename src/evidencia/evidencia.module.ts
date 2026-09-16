import { Module } from '@nestjs/common';
import { EvidenciaController } from './evidencia.controller';
import { EvidenciaService } from './evidencia.service';
import { VerificacionModule } from '../verificacion/verificacion.module';

@Module({
  imports: [VerificacionModule],
  controllers: [EvidenciaController],
  providers: [EvidenciaService],
})
export class EvidenciaModule {}
