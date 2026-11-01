import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthTokenPayload } from '@rideppy/contracts';
import { IS_PUBLIC_KEY } from '../auth.constants';
import type { AuthenticatedUser } from '../auth.types';

/** Extracts the raw bearer token from the Authorization header (or null). */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim().length > 0 ? token.trim() : null;
}

/**
 * Global authentication guard: every route requires a valid access token
 * unless marked @Public. Verifies the HS256 JWT and rejects refresh-token
 * material via the `typ` claim (defense in depth).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (payload.typ !== 'access' || !payload.sub || !payload.role) {
      throw new UnauthorizedException('Invalid access token payload');
    }

    (request as Request & { user?: AuthenticatedUser }).user = {
      userId: payload.sub,
      role: payload.role,
    };
    return true;
  }
}
