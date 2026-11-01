import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPrismaMock } from './prisma-mock';

/**
 * Rate limiting e2e: overrides throttle env BEFORE the module compiles so
 * validateEnv() picks up tiny limits, then proves the 3rd request is blocked.
 */
describe('Throttling (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.THROTTLE_TTL_MS = '10000';
    process.env.THROTTLE_LIMIT = '2';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createPrismaMock())
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.THROTTLE_TTL_MS;
    delete process.env.THROTTLE_LIMIT;
    await app.close();
  });

  it('allows requests up to the limit and returns 429 with the error envelope beyond it', async () => {
    const server = app.getHttpServer();

    await request(server).get('/health').expect(200);
    await request(server).get('/health').expect(200);

    const blocked = await request(server).get('/health').expect(429);
    const body = blocked.body as {
      success: boolean;
      statusCode: number;
      message: string;
    };
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(429);
    expect(String(body.message)).toMatch(/too many requests/i);
  });
});
