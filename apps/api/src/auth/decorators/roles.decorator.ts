import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@rideppy/contracts';
import { ROLES_KEY } from '../auth.constants';

/**
 * Declares the roles allowed on a route. Evaluated by the global RolesGuard
 * AFTER the JwtAuthGuard has authenticated the request.
 *
 * Example: @Roles('CUSTOMER', 'DRIVER')
 */
export const Roles = (...roles: UserRole[]): MethodDecorator =>
  SetMetadata(ROLES_KEY, roles);
