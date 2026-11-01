import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { OtpService } from './otp/otp.service';
import { TokenService } from './token.service';
import type { TokenRequestMeta } from './token.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService (unit)', () => {
  let service: AuthService;

  let prisma: Record<string, any>;
  let otpService: { issue: jest.Mock; verify: jest.Mock };
  let tokenService: {
    issueTokenPair: jest.Mock;
    issueAccessToken: jest.Mock;
    buildTokens: jest.Mock;
    rotate: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };

  const meta: TokenRequestMeta = { ip: '10.0.0.5' };
  const configService = {} as ConfigService;

  const baseUser = {
    id: 'u-1',
    phone: '+919876543210',
    fullName: 'Asha Verma',
    email: null as string | null,
    role: 'CUSTOMER' as const,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    passwordHash: null as string | null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      customer: { create: jest.fn() },
      driver: { create: jest.fn() },
    };
    otpService = {
      issue: jest.fn().mockResolvedValue({
        phone: '+919876543210',
        purpose: 'LOGIN',
        expiresIn: 300,
        resendCooldownSeconds: 60,
        deliveredVia: 'console',
      }),
      verify: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
      issueAccessToken: jest.fn().mockResolvedValue('at'),
      buildTokens: jest
        .fn()
        .mockImplementation((accessToken: string, refreshToken: string) => ({
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: 900,
        })),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(true),
      revokeAllForUser: jest.fn().mockResolvedValue(2),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: OtpService, useValue: otpService },
        { provide: TokenService, useValue: tokenService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('requestOtp', () => {
    it('issues an OTP when the phone is unknown (uniform response)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.requestOtp(
        { phone: '+919876543210', role: 'CUSTOMER' },
        meta,
      );
      expect(otpService.issue).toHaveBeenCalledWith(
        '+919876543210',
        'LOGIN',
        '10.0.0.5',
      );
      expect(result.deliveredVia).toBe('console');
    });

    it('issues an OTP for an existing ACTIVE account of the same role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'CUSTOMER',
        status: 'ACTIVE',
      });
      await expect(
        service.requestOtp({ phone: '+919876543210', role: 'CUSTOMER' }, meta),
      ).resolves.toBeDefined();
    });

    it('rejects a role mismatch with 409 (no role-switching via OTP)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'DRIVER',
        status: 'ACTIVE',
      });
      await expect(
        service.requestOtp({ phone: '+919876543210', role: 'CUSTOMER' }, meta),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('refuses OTP spend for suspended (403) and deactivated (403) accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'CUSTOMER',
        status: 'SUSPENDED',
      });
      await expect(
        service.requestOtp({ phone: '+919876543210', role: 'CUSTOMER' }, meta),
      ).rejects.toMatchObject({ status: 403 });

      prisma.user.findUnique.mockResolvedValue({
        role: 'CUSTOMER',
        status: 'DEACTIVATED',
      });
      await expect(
        service.requestOtp({ phone: '+919876543210', role: 'CUSTOMER' }, meta),
      ).rejects.toMatchObject({ status: 403 });
      expect(otpService.issue).not.toHaveBeenCalled();
    });

    it('allows PENDING_VERIFICATION accounts to request an OTP', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'CUSTOMER',
        status: 'PENDING_VERIFICATION',
      });
      await expect(
        service.requestOtp({ phone: '+919876543210', role: 'CUSTOMER' }, meta),
      ).resolves.toBeDefined();
    });
  });

  describe('verifyOtp', () => {
    const input = {
      phone: '+919876543210',
      role: 'CUSTOMER' as const,
      code: '123456',
    };

    it('creates a new ACTIVE CUSTOMER with profile when fullName is given', async () => {
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(baseUser);

      const session = await service.verifyOtp(
        { ...input, fullName: ' Asha Verma ' },
        meta,
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '+919876543210',
          fullName: 'Asha Verma', // trimmed
          role: 'CUSTOMER',
          status: 'ACTIVE',
          customer: { create: {} },
        }),
      });
      expect(session.user.role).toBe('CUSTOMER');
      expect(session.user.status).toBe('ACTIVE');
      expect(session.user.createdAt).toBe('2026-11-01T10:00:00.000Z');
      expect(session.tokens).toEqual({
        accessToken: 'at',
        refreshToken: 'rt',
        tokenType: 'Bearer',
        expiresIn: 900,
      });
    });

    it('creates a DRIVER with a driver profile on first login', async () => {
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ ...baseUser, role: 'DRIVER' });

      const session = await service.verifyOtp(
        {
          phone: '+919876543210',
          role: 'DRIVER',
          code: '123456',
          fullName: 'Vikram Rao',
        },
        meta,
      );

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          driver: { create: {} },
          role: 'DRIVER',
        }),
      });
      expect(session.user.role).toBe('DRIVER');
    });

    it('demands fullName on first login (401, OTP already consumed)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyOtp(input, meta)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('activates a PENDING_VERIFICATION account on successful login', async () => {
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: 'PENDING_VERIFICATION',
      });
      prisma.user.update.mockResolvedValue(baseUser);

      const session = await service.verifyOtp(input, meta);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { status: 'ACTIVE' },
      });
      expect(session.user.status).toBe('ACTIVE');
    });

    it('rejects suspended accounts with 403 after OTP verification', async () => {
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: 'SUSPENDED',
      });
      await expect(service.verifyOtp(input, meta)).rejects.toMatchObject({
        status: 403,
      });
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('rejects a role mismatch with 409', async () => {
      otpService.verify.mockResolvedValue(undefined);
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'DRIVER' });
      await expect(service.verifyOtp(input, meta)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('always consumes the OTP first (verification before account checks)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: 'SUSPENDED',
      });
      await expect(service.verifyOtp(input, meta)).rejects.toBeTruthy();
      expect(otpService.verify).toHaveBeenCalledWith(
        '+919876543210',
        'LOGIN',
        '123456',
      );
    });
  });

  describe('refresh', () => {
    it('re-issues a session with the CURRENT database role and status check', async () => {
      tokenService.rotate.mockResolvedValue({
        userId: 'u-1',
        refreshToken: 'rt-new',
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);

      const session = await service.refresh({ refreshToken: 'rt-old' }, meta);

      expect(tokenService.rotate).toHaveBeenCalledWith('rt-old', meta);
      expect(tokenService.issueAccessToken).toHaveBeenCalledWith(
        'u-1',
        'CUSTOMER',
      );
      expect(session.tokens.refreshToken).toBe('rt-new');
    });

    it('blocks refresh for suspended accounts (403)', async () => {
      tokenService.rotate.mockResolvedValue({
        userId: 'u-1',
        refreshToken: 'rt-new',
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        status: 'SUSPENDED',
      });
      await expect(
        service.refresh({ refreshToken: 'rt-old' }, meta),
      ).rejects.toMatchObject({
        status: 403,
      });
    });

    it('revokes everything and 401s when the account vanished', async () => {
      tokenService.rotate.mockResolvedValue({
        userId: 'u-gone',
        refreshToken: 'rt-new',
      });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.refresh({ refreshToken: 'rt-old' }, meta),
      ).rejects.toMatchObject({
        status: 401,
      });
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u-gone');
    });
  });

  describe('logout / logoutAll', () => {
    it("logout revokes only the caller's own token (idempotent)", async () => {
      await expect(
        service.logout('u-1', 'some-refresh-token'),
      ).resolves.toBeUndefined();
      expect(tokenService.revoke).toHaveBeenCalledWith(
        'some-refresh-token',
        'u-1',
      );
    });

    it('logoutAll reports the number of revoked sessions', async () => {
      await expect(service.logoutAll('u-1')).resolves.toBe(2);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u-1');
    });
  });

  describe('getProfile', () => {
    it('returns the shared AuthUser projection', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const profile = await service.getProfile('u-1');
      expect(profile).toEqual({
        id: 'u-1',
        phone: '+919876543210',
        fullName: 'Asha Verma',
        email: null,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      });
    });

    it('404s for unknown users', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('nope')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
