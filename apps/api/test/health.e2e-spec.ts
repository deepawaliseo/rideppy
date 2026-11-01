import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiErrorResponse, HealthResponse } from '@rideppy/contracts';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPrismaMock } from './prisma-mock';

type OpenApiBody = { info: { title: string }; openapi: string };

describe('Health, Swagger, error envelope and security headers (e2e)', () => {
  let app: INestApplication<App>;
  let prismaMock: ReturnType<typeof createPrismaMock>;

  beforeAll(async () => {
    prismaMock = createPrismaMock();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health returns the ok payload with the database up', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .then(({ body }) => {
        const health = body as HealthResponse;
        expect(health.status).toBe('ok');
        expect(health.service).toBe('Rideppy API');
        expect(health.version).toBe('0.0.1');
        expect(health.database).toBe('up');
        expect(typeof health.timestamp).toBe('string');
      });
  });

  it('/health returns 503 with the error envelope when the database is down', async () => {
    prismaMock.ping.mockResolvedValue(false);
    try {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(503);
      const envelope = response.body as ApiErrorResponse;
      expect(envelope.success).toBe(false);
      expect(envelope.statusCode).toBe(503);
      expect(envelope.error).toBe('Service Unavailable');
      expect(envelope.message).toBe('Database unreachable');
      expect(envelope.path).toBe('/health');
      expect(typeof envelope.timestamp).toBe('string');
    } finally {
      prismaMock.ping.mockResolvedValue(true);
    }
  });

  it('/docs serves the Swagger UI and /docs-json the OpenAPI document', () => {
    const server = app.getHttpServer();
    return request(server)
      .get('/docs-json')
      .expect(200)
      .then(({ body }) => {
        const doc = body as OpenApiBody;
        expect(doc.info.title).toBe('Rideppy API');
        expect(doc.openapi).toMatch(/^3\./);
      });
  });

  it('unknown routes return the consistent error envelope', () => {
    return request(app.getHttpServer())
      .get('/definitely-not-here')
      .expect(404)
      .then(({ body }) => {
        const envelope = body as ApiErrorResponse;
        expect(envelope.success).toBe(false);
        expect(envelope.statusCode).toBe(404);
        expect(envelope.path).toBe('/definitely-not-here');
        expect(envelope.error).toBe('Not Found');
        expect(envelope.timestamp).toBeDefined();
      });
  });

  it('applies helmet security headers', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .then(({ headers }) => {
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBeDefined();
      });
  });

  it('allows cross-origin requests from any origin in development', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:8081')
      .expect(200)
      .then(({ headers }) => {
        expect(headers['access-control-allow-origin']).toBe('*');
      });
  });
});
