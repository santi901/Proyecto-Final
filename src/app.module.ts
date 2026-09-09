import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VerificacionModule } from './verificacion/verificacion.module';
import { LocationModule } from './location/location.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MatchingModule } from './matching/matching.module';
import { EvidenciaModule } from './evidencia/evidencia.module';
import { CalificacionesModule } from './calificaciones/calificaciones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    VerificacionModule,
    LocationModule,
    NotificacionesModule,
    MatchingModule,
    EvidenciaModule,
    CalificacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
