import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OtpSender } from './otp-sender.interface';
import { OTP_SENDER } from './otp-sender.interface';
import { OtpService } from './otp.service';
import { hashOtpCode } from '../crypto.util';
import { PrismaService } from '../../prisma/prisma.service';

describe('OtpService (unit)', () => {
  let service: OtpService;

  let prisma: Record<string, any>;
  let sender: OtpSender & { send: jest.Mock };

  const configValues: Record<string, unknown> = {
    'otp.codeTtlSeconds': 300,
    'otp.resendCooldownSeconds': 60,
    'otp.maxAttempts': 5,
    'otp.maxActivePerPhone': 3,
    'otp.hourlyRequestLimit': 10,
  };
  const configService = {
    get: (key: string, def?: unknown) =>
      key in configValues ? configValues[key] : def,
  } as unknown as ConfigService;

  const now = new Date('2026-11-01T10:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers({ now });

    prisma = {
      otpCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'otp-row-1',
            createdAt: now,
            updatedAt: now,
            consumedAt: null,
            attempts: 0,
            ...data,
          }),
        ),
        update: jest.fn().mockResolvedValue({ attempts: 1 }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };
    sender = { name: 'console', send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: OTP_SENDER, useValue: sender },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('issue', () => {
    let lastIssuedAt: Date | null;

    beforeEach(() => {
      lastIssuedAt = null;
      // findFirst mock respects the createdAt cooldown filter the service sends.
      prisma.otpCode.findFirst.mockImplementation(
        async ({ where }: { where?: any }) => {
          const gt = where?.createdAt?.gt as Date | undefined;
          if (lastIssuedAt && (!gt || lastIssuedAt.getTime() > gt.getTime())) {
            return { createdAt: lastIssuedAt };
          }
          return null;
        },
      );
    });

    it('creates a hashed code row and hands the plaintext ONLY to the provider', async () => {
      const result = await service.issue('+919876543210', 'LOGIN', '10.0.0.1');

      expect(result).toEqual({
        phone: '+919876543210',
        purpose: 'LOGIN',
        expiresIn: 300,
        resendCooldownSeconds: 60,
        deliveredVia: 'console',
      });

      expect(prisma.otpCode.create).toHaveBeenCalledTimes(1);
      const data = prisma.otpCode.create.mock.calls[0][0].data;
      expect(data.phone).toBe('+919876543210');
      expect(data.codeHash).toMatch(/^scrypt\$/);
      expect(data.codeHash).not.toContain('code');
      expect(data.requestIp).toBe('10.0.0.1');

      expect(sender.send).toHaveBeenCalledTimes(1);
      const delivery = sender.send.mock.calls[0][0];
      expect(delivery.code).toMatch(/^\d{6}$/);
      expect(delivery.expiresAt.getTime()).toBe(now.getTime() + 300_000);
    });

    it('rejects a second request inside the resend cooldown (429)', async () => {
      lastIssuedAt = new Date(now.getTime() - 10_000);

      await expect(
        service.issue('+919876543210', 'LOGIN'),
      ).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(sender.send).not.toHaveBeenCalled();
    });

    it('allows the request again once the cooldown has elapsed', async () => {
      lastIssuedAt = new Date(now.getTime() - 61_000);

      await expect(
        service.issue('+919876543210', 'LOGIN'),
      ).resolves.toBeDefined();
    });

    it('enforces the hourly request cap (429)', async () => {
      prisma.otpCode.count.mockImplementation(
        async ({ where }: { where?: any }) =>
          // createdAt filter present => hourly count query
          'createdAt' in where && !('consumedAt' in where) ? 10 : 0,
      );

      await expect(
        service.issue('+919876543210', 'LOGIN'),
      ).rejects.toMatchObject({
        status: 429,
      });
    });

    it('enforces the outstanding-code cap (429)', async () => {
      prisma.otpCode.count.mockImplementation(
        async ({ where }: { where?: any }) => ('consumedAt' in where ? 3 : 0),
      );

      await expect(
        service.issue('+919876543210', 'LOGIN'),
      ).rejects.toMatchObject({
        status: 429,
      });
    });

    it('deletes the row and reports 400 when the provider fails (no pretend delivery)', async () => {
      sender.send.mockRejectedValue(new Error('gateway down'));

      await expect(
        service.issue('+919876543210', 'LOGIN'),
      ).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.otpCode.delete).toHaveBeenCalledWith({
        where: { id: 'otp-row-1' },
      });
    });
  });

  describe('verify', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'otp-row-1',
      phone: '+919876543210',
      purpose: 'LOGIN',
      codeHash: null as string | null,
      expiresAt: new Date(now.getTime() + 200_000),
      consumedAt: null,
      attempts: 0,
      createdAt: now,
      ...overrides,
    });

    async function prepare(
      overrides: Record<string, unknown> = {},
      code = '654321',
    ) {
      const stored = row(overrides);
      // Use the real hasher so the flow is exercised end-to-end.
      stored.codeHash = await hashOtpCode(code);
      prisma.otpCode.findFirst.mockResolvedValue(stored);
      return code;
    }

    it('consumes the code on a correct attempt', async () => {
      const code = await prepare();
      prisma.otpCode.update
        .mockResolvedValueOnce({ attempts: 1 }) // attempt counter
        .mockResolvedValueOnce({}); // consume

      await expect(
        service.verify('+919876543210', 'LOGIN', code),
      ).resolves.toBeUndefined();
      expect(prisma.otpCode.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: { consumedAt: now } }),
      );
    });

    it('rejects a wrong code with remaining attempts (401)', async () => {
      await prepare();
      prisma.otpCode.update.mockResolvedValueOnce({ attempts: 1 });

      await expect(
        service.verify('+919876543210', 'LOGIN', '000000'),
      ).rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({
          message: expect.stringContaining('4 attempt'),
        }),
      });
    });

    it('locks out after the configured attempt limit (429)', async () => {
      await prepare();
      prisma.otpCode.update.mockResolvedValueOnce({ attempts: 6 }); // > maxAttempts 5

      await expect(
        service.verify('+919876543210', 'LOGIN', '000000'),
      ).rejects.toMatchObject({
        status: 429,
      });
    });

    it('rejects when there is no active code (400)', async () => {
      prisma.otpCode.findFirst.mockResolvedValue(null);
      await expect(
        service.verify('+919876543210', 'LOGIN', '123456'),
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    it('ignores consumed and expired codes (they never match findFirst)', async () => {
      // findFirst only returns unconsumed+unexpired rows by construction;
      // consumedAt set / expired rows simply do not surface here.
      await prepare({ consumedAt: new Date(now.getTime() - 1000) });
      prisma.otpCode.findFirst.mockResolvedValue(null);

      await expect(
        service.verify('+919876543210', 'LOGIN', '654321'),
      ).rejects.toMatchObject({
        status: 400,
      });
    });
  });
});
