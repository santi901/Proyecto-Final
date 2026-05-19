import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VerificacionModule } from './verificacion/verificacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    VerificacionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}