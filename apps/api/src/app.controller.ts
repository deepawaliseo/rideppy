import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@rideppy/contracts';
import { AppService } from './app.service';

/** API version reported by GET /health (single source: package.json version). */
const API_VERSION = '0.0.1';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth(API_VERSION);
  }
}
