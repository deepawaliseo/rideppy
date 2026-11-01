import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

/**
 * PrismaClient is replaced by a recorded fake: the lifecycle contract under
 * test is Nest's (connect on init, disconnect on destroy, honest ping), not
 * Prisma's driver internals.
 */
jest.mock('@prisma/client', () => {
  const recorded = {
    connectCalls: 0,
    disconnectCalls: 0,
    queryBehavior: 'ok' as 'ok' | 'fail',
  };
  class FakePrismaClient {
    $connect(): Promise<void> {
      recorded.connectCalls += 1;
      return Promise.resolve();
    }
    $disconnect(): Promise<void> {
      recorded.disconnectCalls += 1;
      return Promise.resolve();
    }
    $queryRaw(): Promise<unknown[]> {
      if (recorded.queryBehavior === 'fail') {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve([{ ok: 1 }]);
    }
  }
  return {
    PrismaClient: FakePrismaClient,
    __recorded: recorded,
  };
});

interface RecordedState {
  connectCalls: number;
  disconnectCalls: number;
  queryBehavior: 'ok' | 'fail';
}

const mockedModule = jest.requireMock<{ __recorded: RecordedState }>(
  '@prisma/client',
);
const recorded = mockedModule.__recorded;

describe('PrismaService lifecycle', () => {
  let service: PrismaService;

  beforeEach(async () => {
    recorded.connectCalls = 0;
    recorded.disconnectCalls = 0;
    recorded.queryBehavior = 'ok';

    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('connects on module init', async () => {
    await service.onModuleInit();
    expect(recorded.connectCalls).toBe(1);
  });

  it('survives a failed boot connection without throwing', async () => {
    // Simulate $connect blowing up (DB down at boot) — must not reject,
    // so the API still boots and /health reports the truth.
    jest
      .spyOn(service, '$connect')
      .mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('disconnects on module destroy', async () => {
    await service.onModuleDestroy();
    expect(recorded.disconnectCalls).toBe(1);
  });

  describe('ping', () => {
    it('returns true when the database answers', async () => {
      await expect(service.ping()).resolves.toBe(true);
    });

    it('returns false (never throws) when the query fails', async () => {
      recorded.queryBehavior = 'fail';
      await expect(service.ping()).resolves.toBe(false);
    });
  });
});
