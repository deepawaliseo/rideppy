import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth.constants';

/**
 * Marks a route as publicly reachable (no bearer token required).
 *
 * The JwtAuthGuard is registered GLOBALLY, so the platform's default posture
 * is "authenticated unless explicitly public" — new endpoints fail closed.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
