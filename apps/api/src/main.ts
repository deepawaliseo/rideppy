import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port', 3100);
  await app.listen(port, '127.0.0.1');

  console.log(
    `Rideppy API running at http://127.0.0.1:${port} [${configService.get<string>('app.env')}]`,
  );
}

void bootstrap();
