import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // 3001, no 3000: el backend de Nico (Express) ya usa 3000 por default, y las
  // apps/backend/ esperan a este servidor en 3001.
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();