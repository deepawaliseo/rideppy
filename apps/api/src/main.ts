import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, '127.0.0.1');

  console.log(`Rideppy API running at http://127.0.0.1:${port}`);
}

bootstrap();
