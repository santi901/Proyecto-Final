import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VerificacionModule } from './verificacion/verificacion.module';
import { LocationModule } from './location/location.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { SupabaseModule } from './supabase/supabase.module';
import { MatchingModule } from './matching/matching.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    VerificacionModule,
    LocationModule,
    NotificacionesModule,
    MatchingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
