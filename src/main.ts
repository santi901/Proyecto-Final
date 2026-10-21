import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // La foto de evidencia llega como base64 dentro del JSON (ver evidencia.controller.ts):
  // el límite por defecto de 100kb la cortaría.
  app.useBodyParser('json', { limit: '15mb' });
  // 3001, no 3000: el backend de Nico (Express) ya usa 3000 por default, y las
  // apps/backend/ esperan a este servidor en 3001.
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
