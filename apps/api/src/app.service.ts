import { Injectable } from '@nestjs/common';
import { HealthResponse } from '@rideppy/contracts';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Builds the GET /health payload, typed by the shared
   * HealthResponse contract from @rideppy/contracts.
   */
  getHealth(version: string): HealthResponse {
    return {
      status: 'ok',
      service: 'Rideppy API',
      version,
      timestamp: new Date().toISOString(),
    };
  }
}
