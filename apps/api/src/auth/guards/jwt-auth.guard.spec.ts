import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { extractBearerToken, JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard (unit)', () => {
  let guard: JwtAuthGuard;
  let jwtService: { verifyAsync: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const contextFor = (headers: Record<string, string>): ExecutionContext => {
    const request = { headers } as unknown as Request;
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  it('short-circuits @Public routes without touching the token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token with 401', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects malformed Authorization headers', async () => {
    await expect(
      guard.canActivate(contextFor({ authorization: 'Token abc' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer   ' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid/expired JWT with 401', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer bad' })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token without the access typ claim (refresh cannot pose as access)', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'u-1', role: 'CUSTOMER' });
    await expect(
      guard.canActivate(contextFor({ authorization: 'Bearer ok' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid access token and attaches the identity to the request', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'u-1',
      role: 'DRIVER',
      typ: 'access',
    });
    const ctx = contextFor({ authorization: 'Bearer good' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // request.user is typed via the Express augmentation in auth.types.ts.
    const request = ctx.switchToHttp().getRequest<Request>();
    expect(request.user).toEqual({ userId: 'u-1', role: 'DRIVER' });
  });

  describe('extractBearerToken', () => {
    it('is case-insensitive on the scheme and trims the token', () => {
      const lower = {
        headers: { authorization: 'bEaReR abc' },
      } as unknown as Request;
      const empty = { headers: {} } as unknown as Request;
      expect(extractBearerToken(lower)).toBe('abc');
      expect(extractBearerToken(empty)).toBeNull();
    });
  });
});
