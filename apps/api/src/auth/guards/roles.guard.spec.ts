import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (unit)', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const contextFor = (user?: { role: string }): ExecutionContext => {
    const request: Record<string, unknown> = { user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows routes without @Roles for any authenticated user', () => {
    expect(guard.canActivate(contextFor({ role: 'CUSTOMER' }))).toBe(true);
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('allows a user whose role is in the required set', () => {
    reflector.getAllAndOverride.mockReturnValue(['CUSTOMER', 'DRIVER']);
    expect(guard.canActivate(contextFor({ role: 'DRIVER' }))).toBe(true);
  });

  it('forbids a user with a role outside the required set (403)', () => {
    reflector.getAllAndOverride.mockReturnValue(['CUSTOMER', 'DRIVER']);
    expect(() => guard.canActivate(contextFor({ role: 'ADMIN' }))).toThrow(
      ForbiddenException,
    );
  });

  it('treats a missing identity as unauthenticated (401), never authorized', () => {
    reflector.getAllAndOverride.mockReturnValue(['CUSTOMER']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      'Not authenticated',
    );
  });
});
