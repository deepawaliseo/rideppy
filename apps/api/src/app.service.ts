import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@rideppy/contracts';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Real database connectivity probe. Never cached, never faked: a `false`
   * here MUST result in /health reporting the service as unhealthy.
   */
  async pingDatabase(): Promise<boolean> {
    return this.prisma.ping();
  }

  /**
   * Builds the GET /health payload, typed by the shared
   * HealthResponse contract from @rideppy/contracts.
   * Only called after pingDatabase() returned true, hence database: 'up'.
   */
  async getHealth(version: string): Promise<HealthResponse> {
    const databaseUp = await this.pingDatabase();
    return {
      status: 'ok',
      service: 'Rideppy API',
      version,
      timestamp: new Date().toISOString(),
      database: databaseUp ? 'up' : 'down',
    };
  }
}
