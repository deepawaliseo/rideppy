import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthTokenPayload, TokenPair, UserRole } from '@rideppy/contracts';
import {
  generateRefreshToken,
  parseDurationToSeconds,
  sha256Hex,
} from './crypto.util';

/** Request metadata persisted with refresh-token rows for forensics. */
export interface TokenRequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  private readonly accessTtlSeconds: number;
  private readonly configService: ConfigService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.configService = configService;
    // Fail fast at DI time when the duration string is unparseable.
    this.accessTtlSeconds = parseDurationToSeconds(
      configService.get<string>('jwt.expiresIn', '15m'),
    );
  }

  private get refreshTtlDays(): number {
    return this.configService.get<number>('jwt.refreshTtlDays', 30);
  }

  /** Signs the short-lived HS256 access token (`typ: 'access'`). */
  async issueAccessToken(userId: string, role: UserRole): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      role,
      typ: 'access',
    } satisfies AuthTokenPayload);
  }

  /** Assembles the shared TokenPair contract from both raw tokens. */
  buildTokens(accessToken: string, refreshToken: string): TokenPair {
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
    };
  }

  /**
   * Issues a new refresh-token session: 384-bit CSPRNG token, SHA-256
   * stored. The raw token is returned ONCE and never persisted.
   */
  async issueRefreshToken(
    userId: string,
    meta: TokenRequestMeta,
    familyId?: string,
  ): Promise<string> {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId: familyId ?? crypto.randomUUID(),
        tokenHash: sha256Hex(raw),
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      },
    });
    return raw;
  }

  /** The token pair handed out by LOGIN (fresh family). */
  async issueTokenPair(
    userId: string,
    role: UserRole,
    meta: TokenRequestMeta,
  ): Promise<TokenPair> {
    const accessToken = await this.issueAccessToken(userId, role);
    const refreshToken = await this.issueRefreshToken(userId, meta);
    return this.buildTokens(accessToken, refreshToken);
  }

  /**
   * Rotates a refresh token: validates it, revokes it and issues a child in
   * the same family. The caller loads the user afterwards and signs the
   * access token with the user's CURRENT role (role changes propagate).
   *
   * Reuse detection: presenting an ALREADY-REVOKED token implies the token
   * was stolen/copied — the ENTIRE family is revoked immediately and the
   * caller must re-authenticate. Expired tokens are rejected without family
   * side effects (natural lifetime end).
   */
  async rotate(
    rawRefreshToken: string,
    meta: TokenRequestMeta,
  ): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = sha256Hex(rawRefreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException(
        'Refresh token reuse detected — every session of this token family was revoked, please log in again',
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired — log in again');
    }

    const childRaw = await this.issueRefreshToken(
      record.userId,
      meta,
      record.familyId,
    );
    const child = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(childRaw) },
      select: { id: true },
    });
    if (!child) {
      // Cannot realistically happen (the row was just created) — fail honestly.
      throw new UnauthorizedException('Refresh rotation failed, try again');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: child.id },
    });

    return { userId: record.userId, refreshToken: childRaw };
  }

  /** Revokes every still-valid token in one family (theft containment). */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Revokes ONE refresh token. When `userId` is given (authenticated logout)
   * a foreign token is silently ignored — logout is idempotent and never
   * fails closed, but never touches other people's sessions either.
   */
  async revoke(rawRefreshToken: string, userId?: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawRefreshToken) },
    });
    if (!record || record.revokedAt) return false;
    if (userId && record.userId !== userId) return false;
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  /** Revokes every refresh token of a user (logout everywhere). */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Guard helper: true when the raw token is currently usable. */
  async isRefreshTokenUsable(rawRefreshToken: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawRefreshToken) },
      select: { revokedAt: true, expiresAt: true },
    });
    return (
      !!record && !record.revokedAt && record.expiresAt.getTime() > Date.now()
    );
  }
}
