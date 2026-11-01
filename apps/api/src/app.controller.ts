import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
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

  /**
   * Liveness + database readiness.
   * - Database reachable  -> 200 + HealthResponse (database: 'up').
   * - Database unreachable -> 503 + the shared ApiErrorResponse envelope.
   * The database is never reported healthy when it cannot answer a query.
   */
  @Get('health')
  async getHealth(): Promise<HealthResponse> {
    const databaseUp = await this.appService.pingDatabase();
    if (!databaseUp) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message: 'Database unreachable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.appService.getHealth(API_VERSION);
  }
}
