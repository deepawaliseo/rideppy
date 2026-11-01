/**
 * Deterministic PrismaService test double for e2e runs: no database needed.
 * `ping` defaults to resolving true (healthy); individual tests override it
 * to drive the unhealthy paths.
 */
export type PrismaMock = {
  ping: jest.Mock;
  $queryRaw: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
};

export function createPrismaMock(): PrismaMock {
  return {
    ping: jest.fn().mockResolvedValue(true),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
}
