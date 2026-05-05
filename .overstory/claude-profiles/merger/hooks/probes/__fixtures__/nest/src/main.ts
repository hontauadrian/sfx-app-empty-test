import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create({} as any);
  app.setGlobalPrefix('api/v1');
  await app.listen(3001);
}

bootstrap();
