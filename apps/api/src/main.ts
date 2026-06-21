import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const apiPrefix = config.get<string>('app.apiPrefix', 'api');

  // Trust the single upstream nginx hop so req.ip resolves to the real
  // client IP (leftmost entry in X-Forwarded-For) rather than the
  // loopback / docker-bridge address. Adjust if more proxy hops are
  // ever introduced.
  app.set('trust proxy', 1);

  // BUG-151 (2026-06-22): explicit helmet config. Bare `helmet()` does not
  // emit Content-Security-Policy in v6+; before public launch we want
  // defence-in-depth headers on every API response (PDF streams + JSON):
  //   • CSP: API never serves HTML to a browser, so a tight default-src
  //     'self' + frame-ancestors 'none' + object-src 'none' blocks any
  //     future attempt to frame our PDF endpoints into a hostile origin.
  //   • HSTS: 1-year max-age + includeSubDomains. (No `preload` to avoid
  //     committing the apex domain to the HSTS preload list without sign-off.)
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins', []),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CTMP API')
    .setDescription('Corporate Tender Management Platform REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}

bootstrap();
