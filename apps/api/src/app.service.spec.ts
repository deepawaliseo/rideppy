import { Test, TestingModule } from '@nestjs/testing';
import type { HealthResponse } from '@rideppy/contracts';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService', () => {
  let service: AppService;
  let prisma: { ping: jest.Mock };

  beforeEach(async () => {
    prisma = { ping: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  describe('getHello', () => {
    it('returns the starter greeting', () => {
      expect(service.getHello()).toBe('Hello World!');
    });
  });

  describe('pingDatabase', () => {
    it('proxies the PrismaService probe', async () => {
      await expect(service.pingDatabase()).resolves.toBe(true);
      expect(prisma.ping).toHaveBeenCalledTimes(1);

      prisma.ping.mockResolvedValue(false);
      await expect(service.pingDatabase()).resolves.toBe(false);
    });
  });

  describe('getHealth', () => {
    it('builds the HealthResponse contract with database up', async () => {
      const health: HealthResponse = await service.getHealth('9.9.9');

      expect(health.status).toBe('ok');
      expect(health.service).toBe('Rideppy API');
      expect(health.version).toBe('9.9.9');
      expect(health.database).toBe('up');
      expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('reports database down when the probe fails', async () => {
      prisma.ping.mockResolvedValue(false);
      const health: HealthResponse = await service.getHealth('9.9.9');
      expect(health.database).toBe('down');
    });
  });
});
