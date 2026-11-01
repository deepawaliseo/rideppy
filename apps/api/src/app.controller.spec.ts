import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { HealthResponse } from '@rideppy/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    getHello: jest.Mock;
    pingDatabase: jest.Mock;
    getHealth: jest.Mock;
  };

  const healthyPayload: HealthResponse = {
    status: 'ok',
    service: 'Rideppy API',
    version: '0.0.1',
    timestamp: '2026-11-01T10:00:00.000Z',
    database: 'up',
  };

  beforeEach(async () => {
    appService = {
      getHello: jest.fn().mockReturnValue('Hello World!'),
      pingDatabase: jest.fn().mockResolvedValue(true),
      getHealth: jest.fn().mockResolvedValue(healthyPayload),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('returns the shared HealthResponse contract when the database is up', async () => {
      await expect(appController.getHealth()).resolves.toEqual(healthyPayload);
      expect(appService.pingDatabase).toHaveBeenCalledTimes(1);
      expect(appService.getHealth).toHaveBeenCalledWith('0.0.1');
    });

    it('throws 503 with the error envelope data when the database is down', async () => {
      appService.pingDatabase.mockResolvedValue(false);
      appService.getHealth.mockResolvedValue({
        ...healthyPayload,
        database: 'down',
      });

      const failure = (await appController
        .getHealth()
        .catch((error: unknown) => error)) as HttpException;
      expect(failure).toBeInstanceOf(HttpException);
      expect(failure.getStatus()).toBe(503);
      // Body consumed by AllExceptionsFilter -> ApiErrorResponse envelope.
      expect(failure.getResponse()).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database unreachable',
      });
      // The health payload must never be returned while the DB is down.
      expect(appService.getHealth).not.toHaveBeenCalled();
    });
  });
});
