import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Nest-managed PrismaClient.
 *
 * Boot policy: a database that is down must NOT prevent the API from booting
 * (Phase 0 keeps zero-config local boot working); instead the failure is
 * logged and /health reports it honestly (HTTP 503) until the connection
 * recovers. Prisma connects lazily, so a database that comes up after boot
 * is picked up automatically on the next query.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        `Database not reachable at boot: ${
          error instanceof Error ? error.message : String(error)
        }. /health will report the database as down until it recovers.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Real connectivity probe backing GET /health.
   * Returns true only when the database answered a round-trip query.
   */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
