/**
 * In-memory PrismaService fake for the auth e2e suite: boots the REAL
 * AppModule (guards, pipes, filters, services, hashing) against deterministic
 * in-memory tables instead of PostgreSQL. Implements exactly the Prisma
 * operations the WP-1 auth stack uses — intentionally small; the REAL
 * database behavior is covered by the database integration suite
 * (test/db/auth.int-spec.ts) which runs against live PostgreSQL.
 */

export interface AuthPrismaFake extends Record<string, any> {
  ping: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $queryRaw: jest.Mock;
  /** Direct access for test setup (e.g. seeding a SUSPENDED user). */
  tables: {
    users: any[];
    otpCodes: any[];
    refreshTokens: any[];
  };
}

export function createAuthPrismaFake(): AuthPrismaFake {
  const users: any[] = [];
  const otpCodes: any[] = [];
  const refreshTokens: any[] = [];
  let seq = 0;
  const nextId = () =>
    `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  // --- generic filter emulation -------------------------------------------
  const matches = (row: any, where: any): boolean => {
    for (const [key, rawCondition] of Object.entries(where ?? {})) {
      const condition = rawCondition as any;
      if (condition === null) {
        if (row[key] !== null && row[key] !== undefined) return false;
        continue;
      }
      if (typeof condition === 'object') {
        if (condition.gt && !(row[key] > condition.gt)) return false;
        if (condition.not !== undefined && row[key] === condition.not)
          return false;
        continue;
      }
      if (row[key] !== condition) return false;
    }
    return true;
  };

  return {
    ping: jest.fn().mockResolvedValue(true),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
    tables: { users, otpCodes, refreshTokens },

    user: {
      findUnique: async ({ where }: any) =>
        users.find((u) =>
          where.phone !== undefined
            ? u.phone === where.phone
            : where.id !== undefined
              ? u.id === where.id
              : false,
        ) ?? null,
      create: async ({ data }: any) => {
        const now = new Date();
        const user = {
          id: nextId(),
          passwordHash: null,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        users.push(user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error('user not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
    },

    otpCode: {
      findFirst: async ({ where, orderBy }: any) => {
        const found = otpCodes
          .filter((row) => matches(row, where))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        const result = found[0] ?? null;
        void orderBy; // descending createdAt is what the service asks for
        return result;
      },
      count: async ({ where }: any) =>
        otpCodes.filter((row) => matches(row, where)).length,
      create: async ({ data }: any) => {
        const now = new Date();
        const row = {
          id: nextId(),
          attempts: 0,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        otpCodes.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = otpCodes.find((c) => c.id === where.id);
        if (!row) throw new Error('otpCode not found');
        if (data.attempts?.increment !== undefined) {
          row.attempts = (row.attempts ?? 0) + data.attempts.increment;
        }
        for (const [key, value] of Object.entries(data)) {
          if (key !== 'attempts') row[key] = value;
        }
        return row;
      },
      delete: async ({ where }: any) => {
        const index = otpCodes.findIndex((c) => c.id === where.id);
        if (index >= 0) otpCodes.splice(index, 1);
        return {};
      },
    },

    refreshToken: {
      findUnique: async ({ where }: any) =>
        refreshTokens.find((r) => r.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: nextId(),
          revokedAt: null,
          replacedById: null,
          ...data,
          createdAt: new Date(),
        };
        refreshTokens.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = refreshTokens.find((r) => r.id === where.id);
        if (!row) throw new Error('refreshToken not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of refreshTokens) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}
