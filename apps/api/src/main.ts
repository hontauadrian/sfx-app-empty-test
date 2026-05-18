import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { buildSwaggerDocument } from './swagger';
import { createHelmetOptions } from './config/helmet-options';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);

  app.use(helmet(createHelmetOptions()));
  app.use(cookieParser());
  const webOrigin = process.env.WEB_ORIGIN;
  app.enableCors({
    origin: webOrigin ? webOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  if (process.env.NODE_ENV !== 'production') {
    try {
      writeFileSync(
        join(__dirname, '..', '.openapi.json'),
        JSON.stringify(document, null, 2),
      );
    } catch {
      // non-fatal — static dump is a convenience for offline matrix regen
    }
  }

  await app.listen(port);
  console.warn(`API running on port ${port}`);
}

if (require.main === module) {
  bootstrap();
}
