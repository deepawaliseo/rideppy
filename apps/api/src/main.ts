import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3100);
  await app.listen(port, '127.0.0.1');

  const swaggerPath = configService.get<boolean>('swagger.enabled', true)
    ? configService.get<string>('swagger.path', 'docs')
    : null;
  const docsSuffix = swaggerPath
    ? ` - docs at http://127.0.0.1:${port}/${swaggerPath}`
    : ' - docs disabled';
  console.log(
    `Rideppy API running at http://127.0.0.1:${port} [${configService.get<string>('app.env')}]${docsSuffix}`,
  );
}

void bootstrap();
