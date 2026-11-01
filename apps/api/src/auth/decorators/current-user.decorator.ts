import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.types';

/**
 * Parameter decorator extracting the authenticated identity that the
 * JwtAuthGuard attached to the request.
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * Throws 500 when used on a route the guard did not run for — a programming
 * error, never a runtime condition.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new InternalServerErrorException(
        'CurrentUser used on a route without authentication — missing guard?',
      );
    }
    return request.user;
  },
);
