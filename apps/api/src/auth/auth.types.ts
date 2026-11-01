import type { UserRole } from '@rideppy/contracts';

/**
 * Identity attached to a request after the JwtAuthGuard verifies the bearer
 * token. Deliberately minimal: the role lives in the (signed) token and is
 * re-checked by the RolesGuard; sensitive actions re-load the user from the
 * database when freshness matters (e.g. account status checks on refresh).
 */
export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by JwtAuthGuard for protected routes. */
      user?: AuthenticatedUser;
    }
  }
}
