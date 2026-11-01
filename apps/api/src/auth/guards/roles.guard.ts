import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@rideppy/contracts';
import { ROLES_KEY } from '../auth.constants';

/**
 * Global role-based authorization guard. Runs AFTER the JwtAuthGuard (guard
 * registration order in AppModule), so a missing identity means the auth
 * guard was skipped — treated as unauthenticated, never as authorized.
 *
 * Routes without @Roles are open to every authenticated role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user || !user.role) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Role ${user.role} is not allowed to access this resource`,
      );
    }
    return true;
  }
}
