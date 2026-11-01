import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/**
 * Shared application configuration used by BOTH the real bootstrap (main.ts)
 * and the e2e tests, so tested behavior == production behavior.
 *
 * Applies (in order): security headers, CORS, graceful shutdown, Swagger.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const isProduction =
    configService.get<string>('app.env', 'development') === 'production';

  // --- Security headers (always on) ----------------------------------------
  app.use(helmet());

  // --- CORS (from validated, namespaced config) -----------------------------
  // Dev default allows everything; production validation (env.schema.ts)
  // forbids the '*' wildcard, so this is defense in depth.
  const origins = configService.get<string[]>('cors.origins', ['*']);
  const wildcard = origins.includes('*') || origins.length === 0;
  // Dev wildcard -> literal '*' header; production wildcard (defense in depth,
  // should never occur) -> empty list denies all cross-origin requests.
  app.enableCors({
    origin: wildcard ? (isProduction ? [] : '*') : origins,
  });

  // --- Graceful shutdown (SIGTERM / SIGINT close the server cleanly) --------
  app.enableShutdownHooks();

  // --- Swagger (configurable via SWAGGER_ENABLED / SWAGGER_PATH) ------------
  const swaggerEnabled = configService.get<boolean>('swagger.enabled', true);
  if (swaggerEnabled) {
    const document = new DocumentBuilder()
      .setTitle('Rideppy API')
      .setDescription('Rideppy bike taxi platform API — Phase 0 foundation')
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, document);
    SwaggerModule.setup(
      configService.get<string>('swagger.path', 'docs'),
      app,
      swaggerDocument,
    );
  }
}
