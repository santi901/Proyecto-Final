import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VerificacionModule } from './verificacion/verificacion.module';

@Module({
  imports: [VerificacionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
