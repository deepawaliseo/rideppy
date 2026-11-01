import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TokenService, TokenRequestMeta } from './token.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TokenService (unit)', () => {
  let service: TokenService;

  let prisma: Record<string, any>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  const meta: TokenRequestMeta = { ip: '10.0.0.9', userAgent: 'jest/1.0' };

  const configService = {
    get: (key: string, def?: unknown) =>
      key === 'jwt.refreshTtlDays' ? 30 : key === 'jwt.expiresIn' ? '15m' : def,
  } as unknown as ConfigService;

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'rt-1',
            createdAt: new Date('2026-11-01T10:00:00.000Z'),
            revokedAt: null,
            replacedById: null,
            ...data,
          }),
        ),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.access.jwt'),
      verifyAsync: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(TokenService);
  });

  describe('issueAccessToken', () => {
    it('signs an access-typ claim with sub and role', async () => {
      await expect(service.issueAccessToken('u-1', 'DRIVER')).resolves.toBe(
        'signed.access.jwt',
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'u-1',
        role: 'DRIVER',
        typ: 'access',
      });
    });
  });

  describe('issueTokenPair', () => {
    it('returns a Bearer pair with the configured TTL and stores only a hash', async () => {
      const tokens = await service.issueTokenPair('u-1', 'CUSTOMER', meta);

      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(900); // 15m
      expect(tokens.accessToken).toBe('signed.access.jwt');
      expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{64,}$/);

      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe('u-1');
      expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(data.tokenHash).not.toContain(tokens.refreshToken);
      expect(data.userAgent).toBe('jest/1.0');
      expect(data.ip).toBe('10.0.0.9');
    });
  });

  describe('rotate', () => {
    const future = () => new Date(Date.now() + 86_400_000);

    it('rotates a valid token: parent revoked with replacedById, same family', async () => {
      const record = {
        id: 'rt-parent',
        userId: 'u-1',
        familyId: 'fam-1',
        tokenHash: 'parent-hash',
        expiresAt: future(),
        revokedAt: null,
        replacedById: null,
      };
      prisma.refreshToken.create.mockImplementation(
        ({ data }: { data: object }) =>
          Promise.resolve({ id: 'rt-child', ...data }),
      );
      // First findUnique call = parent (by presented token hash), second =
      // child lookup right after the child row was created.
      prisma.refreshToken.findUnique
        .mockResolvedValueOnce(record)
        .mockResolvedValue({ id: 'rt-child' });

      const result = await service.rotate('raw-token', meta);

      expect(result.userId).toBe('u-1');
      expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{64,}$/);
      // The child inherits the family id of the parent.
      const childData = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(childData.familyId).toBe('fam-1');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-parent' },
        data: expect.objectContaining({ replacedById: 'rt-child' }),
      });
      const revokedAt = prisma.refreshToken.update.mock.calls[0][0].data
        .revokedAt as Date;
      expect(revokedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('rejects unknown tokens with 401 and no side effects', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('nope', meta)).rejects.toMatchObject({
        status: 401,
      });
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('detects reuse of a revoked token and revokes the whole family (401)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'u-1',
        familyId: 'fam-1',
        expiresAt: future(),
        revokedAt: new Date('2026-11-01T09:00:00.000Z'),
      });

      await expect(service.rotate('replayed', meta)).rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({
          message: expect.stringContaining('reuse detected'),
        }),
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects expired tokens with 401 (no family side effects)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-old',
        userId: 'u-1',
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });

      await expect(service.rotate('expired', meta)).rejects.toMatchObject({
        status: 401,
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('revoke / revokeAllForUser / revokeFamily', () => {
    it('revoke is idempotent and scoped to the owner when userId is given', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-1',
        revokedAt: null,
      });

      await expect(service.revoke('raw', 'u-1')).resolves.toBe(true);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });

      // Foreign token: silently ignored (logout never fails closed, never
      // touches other users' sessions).
      await expect(service.revoke('raw', 'u-OTHER')).resolves.toBe(false);
      // Already revoked: no-op.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u-1',
        revokedAt: new Date(),
      });
      await expect(service.revoke('raw', 'u-1')).resolves.toBe(false);
      // Unknown token: no-op.
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.revoke('raw', 'u-1')).resolves.toBe(false);
    });

    it('revokeAllForUser reports how many sessions were closed', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      await expect(service.revokeAllForUser('u-1')).resolves.toBe(3);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokeFamily only touches still-valid rows of that family', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      await expect(service.revokeFamily('fam-1')).resolves.toBe(2);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
