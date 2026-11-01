/**
 * Auth integration tests — REAL PostgreSQL via the real PrismaService.
 *
 * Same two-mode gate as database.int-spec.ts (see test/db/global-setup.js):
 *  - RIDEPPY_DB_REQUIRED=1: database verification is REQUIRED; an
 *    unreachable database fails EVERY test explicitly — skipped tests are
 *    never counted as database verification (WP-6 rule).
 *  - Without the flag (sandbox without PostgreSQL): honest native `it.skip`.
 *
 * Covers the full phone + OTP authentication flow over real HTTP against
 * the real database: persistence of otp_codes/refresh_tokens, rotation with
 * reuse detection, cascade deletes, cooldowns and attempt limits.
 */
import '../auth-test-env'; // MUST stay first: throttle decorators read env at import time
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OTP_SENDER } from '../../src/auth/otp/otp-sender.interface';

interface ProbeResult {
  probedAt?: string;
  required?: boolean;
  up?: boolean;
  error?: string | null;
  endpoint?: string | null;
}

const REQUIRED = /^(1|true|yes|on)$/i.test(
  process.env.RIDEPPY_DB_REQUIRED ?? '',
);

function readProbe(): ProbeResult {
  const probeFile = join(__dirname, 'db-probe.json');
  if (!existsSync(probeFile)) {
    return {
      probedAt: undefined,
      up: false,
      error: 'db-probe.json missing — test/db/global-setup.js did not run',
    };
  }
  return JSON.parse(readFileSync(probeFile, 'utf8')) as ProbeResult;
}

const probe = readProbe();
const dbUp = probe.up === true;

const itDb: typeof it = dbUp || REQUIRED ? it : it.skip;

function requireDbUp(): void {
  if (!dbUp) {
    throw new Error(
      'EXPLICIT FAILURE — database verification is REQUIRED ' +
        `(RIDEPPY_DB_REQUIRED=${process.env.RIDEPPY_DB_REQUIRED ?? '1'}) but ` +
        'the database is unreachable' +
        (probe.error ? `: ${probe.error}` : '') +
        '. Start PostgreSQL, verify DATABASE_URL in apps/api/.env, then ' +
        're-run. Skipped tests are never counted as database verification.',
    );
  }
}

describe('auth integration (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let otpSpy: { name: string; send: jest.Mock };

  // Isolated phone range for this run; cleaned up before and after.
  // E.164: "+9197" + 8 timestamp digits + single index digit = 14 chars.
  const phoneSuffix = String(Date.now()).slice(-8);
  const phoneFor = (n: number) => `+9197${phoneSuffix}${n}`;
  const PREFIX = `+9197${phoneSuffix}`;

  const lastCode = (): string => {
    const deliveries = otpSpy.send.mock.calls;
    expect(deliveries.length).toBeGreaterThan(0);
    return deliveries[deliveries.length - 1][0].code as string;
  };

  beforeAll(async () => {
    otpSpy = { name: 'console', send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_SENDER)
      .useValue(otpSpy)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    if (dbUp) {
      // Isolation: drop leftovers from earlier runs of this suite. Only
      // touched when the database is actually reachable — in optional mode
      // with the DB down, beforeAll must NOT fail (tests skip honestly).
      await prisma.otpCode.deleteMany({
        where: { phone: { startsWith: PREFIX } },
      });
      const oldUsers = await prisma.user.findMany({
        where: { phone: { startsWith: PREFIX } },
        select: { id: true },
      });
      await prisma.user.deleteMany({
        where: { id: { in: oldUsers.map((u) => u.id) } },
      });
    }
  });

  afterAll(async () => {
    // Cleanup only makes sense (and can only succeed) when the database was
    // reachable; cascade removes the refresh tokens of the created users.
    if (dbUp) {
      await prisma.otpCode.deleteMany({
        where: { phone: { startsWith: PREFIX } },
      });
      const users = await prisma.user.findMany({
        where: { phone: { startsWith: PREFIX } },
        select: { id: true },
      });
      await prisma.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
    }
    await app?.close();
  });

  it('db-gate: probe ran and the verification mode is reported honestly', () => {
    if (!probe.probedAt) {
      throw new Error(
        'db-probe.json missing — global-setup did not run; ' +
          'this run proves nothing about the database',
      );
    }
    expect(typeof probe.up).toBe('boolean');
    expect(probe.required).toBe(REQUIRED);
  });

  itDb('persists a hashed OTP and never the plaintext', async () => {
    requireDbUp();
    const phone = phoneFor(1);
    const res = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, role: 'CUSTOMER' })
      .expect(202);
    expect(res.body.deliveredVia).toBe('console');

    const rows = await prisma.otpCode.findMany({ where: { phone } });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toMatch(/^scrypt\$/);
    expect(rows[0].codeHash).not.toContain(lastCode());
    expect(rows[0].consumedAt).toBeNull();
    expect(rows[0].attempts).toBe(0);
  });

  itDb('enforces the resend cooldown against the real database', async () => {
    requireDbUp();
    const phone = phoneFor(2);
    await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, role: 'CUSTOMER' })
      .expect(202);

    const res = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, role: 'CUSTOMER' })
      .expect(429);
    expect(String(res.body.message)).toMatch(/already requested/i);
  });

  itDb(
    'runs the full login loop: wrong code, lockout-free retry, activation',
    async () => {
      requireDbUp();
      const phone = phoneFor(3);
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'DRIVER' })
        .expect(202);

      // One wrong attempt (401) — attempt counter is persisted.
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'DRIVER',
          code: '000000',
          fullName: 'Integration Ivan',
        })
        .expect(401);
      const afterWrong = await prisma.otpCode.findFirst({
        where: { phone, consumedAt: null },
      });
      expect(afterWrong?.attempts).toBe(1);

      // Correct code creates the DRIVER account ACTIVE with a driver profile.
      const res = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'DRIVER',
          code: lastCode(),
          fullName: 'Integration Ivan',
        })
        .expect(201);
      expect(res.body.user).toMatchObject({
        phone,
        role: 'DRIVER',
        status: 'ACTIVE',
      });

      const user = await prisma.user.findUnique({
        where: { phone },
        include: { driver: true },
      });
      expect(user?.driver).not.toBeNull();
      expect(user?.status).toBe('ACTIVE');

      const consumed = await prisma.otpCode.findFirst({
        where: { phone, consumedAt: { not: null } },
      });
      expect(consumed).not.toBeNull();
    },
  );

  itDb('rotates refresh tokens in the database and detects reuse', async () => {
    requireDbUp();
    const phone = phoneFor(4);
    const login = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, role: 'CUSTOMER' })
      .expect(202);
    expect(login.status).toBe(202);

    const session = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone,
        role: 'CUSTOMER',
        code: lastCode(),
        fullName: 'Rotate Rani',
      })
      .expect(201);

    const rowsBefore = await prisma.refreshToken.findMany();
    expect(rowsBefore.length).toBeGreaterThanOrEqual(1);

    // Rotation: parent revoked, child in the same family.
    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: session.body.tokens.refreshToken })
      .expect(201);

    const allForUser = await prisma.refreshToken.findMany({
      where: { userId: session.body.user.id },
    });
    expect(allForUser).toHaveLength(2);
    const parent = allForUser.find((r) => r.revokedAt && r.replacedById);
    const child = allForUser.find((r) => !r.revokedAt);
    expect(parent).toBeTruthy();
    expect(child?.id).toBe(parent?.replacedById);
    expect(child?.familyId).toBe(parent?.familyId);

    // Reuse of the parent revokes the whole family — child included.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: session.body.tokens.refreshToken })
      .expect(401);
    const afterReuse = await prisma.refreshToken.findMany({
      where: { userId: session.body.user.id },
    });
    expect(afterReuse.every((r) => r.revokedAt)).toBe(true);

    void rotated;
  });

  itDb(
    'logout revokes the presented session; logout/all revokes everything',
    async () => {
      requireDbUp();
      const phone = phoneFor(5);
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);
      const session = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: lastCode(),
          fullName: 'Logout Lin',
        })
        .expect(201);
      const userId: string = session.body.user.id;
      const auth = {
        Authorization: `Bearer ${session.body.tokens.accessToken}`,
      };

      // A second session via rotation so logout/all has something extra to kill.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.body.tokens.refreshToken })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/logout/all')
        .set(auth)
        .expect(204);

      const remaining = await prisma.refreshToken.findMany({
        where: { userId, revokedAt: null },
      });
      expect(remaining).toHaveLength(0);
    },
  );

  itDb(
    'profile endpoint serves the persisted account (role-gated)',
    async () => {
      requireDbUp();
      const phone = phoneFor(6);
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);
      const session = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: lastCode(),
          fullName: 'Profile Priya',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.body.tokens.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        phone,
        role: 'CUSTOMER',
        status: 'ACTIVE',
      });

      // Without a token the global guard closes the route.
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    },
  );
});
