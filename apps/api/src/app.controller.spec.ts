import { Test, TestingModule } from '@nestjs/testing';
import { HealthResponse } from '@rideppy/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('returns the shared HealthResponse contract', () => {
      const health: HealthResponse = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.service).toBe('Rideppy API');
      expect(health.version).toBe('0.0.1');
      expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
