import './auth-test-env'; // MUST stay first: throttle decorators read env at import time
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { OTP_SENDER } from '../src/auth/otp/otp-sender.interface';
import { createAuthPrismaFake } from './auth-prisma-fake';

/**
 * Auth surface e2e: boots the REAL AppModule (global guards, validation
 * pipe, error filter, throttler, services) against an in-memory Prisma fake.
 * The OTP delivery provider is replaced with a spy so tests can read the
 * generated code deterministically (the console provider only logs it).
 *
 * Real-PostgreSQL behavior (constraints, FKs, real Prisma queries) is proven
 * separately by test/db/auth.int-spec.ts (Windows/CI database gate).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let fake: ReturnType<typeof createAuthPrismaFake>;
  let otpSpy: { name: string; send: jest.Mock };

  const lastCode = (): string => {
    const deliveries = otpSpy.send.mock.calls;
    expect(deliveries.length).toBeGreaterThan(0);
    return deliveries[deliveries.length - 1][0].code as string;
  };

  /** Runs the full 2-step login and returns the session body. */
  async function login(
    phone: string,
    role: 'CUSTOMER' | 'DRIVER',
    fullName: string,
  ) {
    await request(app.getHttpServer())
      .post('/auth/otp/request')
      .send({ phone, role })
      .expect(202);
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone, role, code: lastCode(), fullName })
      .expect(201);
    return verify.body as {
      user: { id: string; phone: string; role: string; status: string };
      tokens: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
      };
    };
  }

  beforeAll(async () => {
    fake = createAuthPrismaFake();
    otpSpy = { name: 'console', send: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fake)
      .overrideProvider(OTP_SENDER)
      .useValue(otpSpy)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/otp/request', () => {
    it('issues an OTP with a uniform response that never contains the code', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919000000101', role: 'CUSTOMER' })
        .expect(202);

      expect(res.body).toEqual({
        phone: '+919000000101',
        purpose: 'LOGIN',
        expiresIn: 300,
        resendCooldownSeconds: 60,
        deliveredVia: 'console',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/"code"/);
      expect(otpSpy.send).toHaveBeenCalledTimes(1);
      expect(otpSpy.send.mock.calls[0][0].code).toMatch(/^\d{6}$/);
    });

    it('rejects an immediate second request with 429 + error envelope (resend cooldown)', async () => {
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919000000102', role: 'CUSTOMER' })
        .expect(202);

      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919000000102', role: 'CUSTOMER' })
        .expect(429);

      expect(res.body).toMatchObject({
        success: false,
        statusCode: 429,
        error: 'Too Many Requests',
        path: '/auth/otp/request',
      });
      expect(res.body.timestamp).toBeTruthy();
    });

    it('refuses an OTP spend for a suspended account with 403', async () => {
      fake.tables.users.push({
        id: '00000000-0000-4000-8000-999999999991',
        phone: '+919000000103',
        fullName: 'Suspended Sam',
        email: null,
        role: 'CUSTOMER',
        status: 'SUSPENDED',
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919000000103', role: 'CUSTOMER' })
        .expect(403);
      expect(res.body.success).toBe(false);
      expect(String(res.body.message)).toMatch(/suspended/i);
    });

    it('rejects a role switch on an existing phone with 409', async () => {
      await login('+919000000104', 'CUSTOMER', 'Role Conflict');
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919000000104', role: 'DRIVER' })
        .expect(409);
      // The message names the REGISTERED role — the caller learns the truth.
      expect(String(res.body.message)).toMatch(
        /registered as a CUSTOMER account/,
      );
    });

    it('validates the DTO strictly (E.164, role whitelist, unknown fields)', async () => {
      const badPhone = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '919876543210', role: 'CUSTOMER' })
        .expect(400);
      expect(badPhone.body.statusCode).toBe(400);

      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919876543210', role: 'ADMIN' })
        .expect(400);

      // forbidNonWhitelisted: unknown properties are rejected, not ignored.
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone: '+919876543210', role: 'CUSTOMER', isAdmin: true })
        .expect(400);
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('completes first-time onboarding into an ACTIVE account and session', async () => {
      const phone = '+919000000110';
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);

      // fullName is REQUIRED on first login. Security note: the requirement
      // is evaluated AFTER the OTP is consumed (checking first would hand
      // out an unauthenticated phone-enumeration oracle), so a failed
      // attempt burns the code — the client must request a new OTP.
      const missing = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, role: 'CUSTOMER', code: lastCode() })
        .expect(401);
      expect(String(missing.body.message)).toMatch(/fullName/i);

      // The burned code can no longer be used at all.
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: lastCode(),
          fullName: 'Onboard Otis',
        })
        .expect(400);

      expect(fake.tables.otpCodes.find((c) => c.phone === phone)).toMatchObject(
        {
          consumedAt: expect.any(Date),
        },
      );
    });

    it('onboards with fullName provided in a single pass (fresh phone)', async () => {
      const phone = '+919000000115';
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);
      expect(res.body.purpose).toBe('LOGIN');

      const verify = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: lastCode(),
          fullName: 'Onboard Otis',
        })
        .expect(201);

      expect(verify.body.user).toMatchObject({
        phone,
        fullName: 'Onboard Otis',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      });
      expect(verify.body.tokens).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      expect(verify.body.tokens.accessToken).toMatch(/^ey/);
      expect(verify.body.tokens.refreshToken).toBeTruthy();
    });

    it('creates a DRIVER with a driver profile on first login', async () => {
      const session = await login('+919000000111', 'DRIVER', 'Driver Devi');
      expect(session.user.role).toBe('DRIVER');
      expect(session.user.status).toBe('ACTIVE');
    });

    it('counts wrong attempts, then accepts the correct code', async () => {
      const phone = '+919000000112';
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);

      const wrong = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: '000000',
          fullName: 'Attempt Ana',
        })
        .expect(401);
      expect(String(wrong.body.message)).toMatch(/attempt/i);

      const good = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({
          phone,
          role: 'CUSTOMER',
          code: lastCode(),
          fullName: 'Attempt Ana',
        })
        .expect(201);
      expect(good.body.user.phone).toBe(phone);
    });

    it('locks out after the configured attempt limit (429)', async () => {
      const phone = '+919000000113';
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .send({ phone, role: 'CUSTOMER' })
        .expect(202);

      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, role: 'CUSTOMER', code: '111111' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, role: 'CUSTOMER', code: '222222' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, role: 'CUSTOMER', code: '333333' })
        .expect(401); // attempts == max (3), still a normal wrong-code 401

      const locked = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, role: 'CUSTOMER', code: '444444' })
        .expect(429);
      expect(String(locked.body.message)).toMatch(
        /too many incorrect attempts/i,
      );
    });

    it('rejects a 5-digit or non-numeric code with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone: '+919000000114', role: 'CUSTOMER', code: '12345' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone: '+919000000114', role: 'CUSTOMER', code: 'ABCDEF' })
        .expect(400);
    });
  });

  describe('GET /auth/me (protected route)', () => {
    it('returns the profile for a valid bearer token', async () => {
      const session = await login('+919000000120', 'CUSTOMER', 'Me Myself');

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.tokens.accessToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: session.user.id,
        phone: '+919000000120',
        fullName: 'Me Myself',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      });
    });

    it('rejects a missing token with the standard error envelope (401)', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 401,
        error: 'Unauthorized',
        path: '/auth/me',
      });
      expect(res.body.timestamp).toBeTruthy();
    });

    it('rejects a garbage token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });

    it('forbids a role outside the @Roles set (403 for ADMIN)', async () => {
      const jwtService = app.get(JwtService);
      const adminToken = await jwtService.signAsync({
        sub: '00000000-0000-4000-8000-000000000001',
        role: 'ADMIN',
        typ: 'access',
      });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(String(res.body.message)).toMatch(/ADMIN/);
    });
  });

  describe('POST /auth/refresh (rotation + reuse detection)', () => {
    it('rotates to a fresh pair and the new access token works', async () => {
      const session = await login('+919000000130', 'CUSTOMER', 'Rotate Rita');

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(201);

      expect(res.body.tokens.refreshToken).not.toBe(
        session.tokens.refreshToken,
      );
      expect(res.body.user.id).toBe(session.user.id);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${res.body.tokens.accessToken}`)
        .expect(200);
    });

    it('detects reuse of the old refresh token and revokes the whole family', async () => {
      const session = await login('+919000000131', 'CUSTOMER', 'Reuse Ray');
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(201);

      // Replaying the PARENT token => theft signal => family revoked.
      const reuse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(401);
      expect(String(reuse.body.message)).toMatch(/reuse detected/i);

      // The child issued moments ago is dead too — attacker gains nothing.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.tokens.refreshToken })
        .expect(401);
    });

    it('rejects an unknown refresh token with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'A'.repeat(64) })
        .expect(401);
    });
  });

  describe('POST /auth/logout and /auth/logout/all', () => {
    it('revokes the presented refresh token and returns 204 (idempotent)', async () => {
      const session = await login('+919000000140', 'CUSTOMER', 'Logout Luna');

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${session.tokens.accessToken}`)
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(204);

      // Second logout with the same (already revoked) token: still 204.
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${session.tokens.accessToken}`)
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(204);

      // The session can no longer be refreshed.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(401);

      // ...but the short-lived access token still works (by design).
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.tokens.accessToken}`)
        .expect(200);
    });

    it('revokes every session of the account (logout everywhere)', async () => {
      const session = await login(
        '+919000000141',
        'CUSTOMER',
        'Everywhere Eve',
      );
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/logout/all')
        .set('Authorization', `Bearer ${rotated.body.tokens.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.tokens.refreshToken })
        .expect(401);
    });

    it('requires authentication (401 without a bearer token)', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'A'.repeat(64) })
        .expect(401);
    });
  });

  describe('infrastructure routes stay public', () => {
    it('GET /health still works without a token', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });
});
