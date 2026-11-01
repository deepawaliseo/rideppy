import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccountStatus,
  AuthSession,
  AuthUser,
  OtpRequestInput,
  OtpVerifyInput,
  RefreshInput,
} from '@rideppy/contracts';
import { OtpService } from './otp/otp.service';
import { TokenService } from './token.service';
import type { TokenRequestMeta } from './token.service';

/** Auth error wording kept deliberately stable — apps match on status codes. */
const STATUS_MESSAGES: Partial<Record<AccountStatus, string>> = {
  SUSPENDED: 'This account has been suspended — contact support',
  DEACTIVATED: 'This account has been deactivated — contact support',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Stage 1 of the login flow. Uniform response shape regardless of whether
   * the phone already has an account (no enumeration oracle).
   * Blocking statuses are rejected BEFORE an SMS spend is incurred.
   */
  async requestOtp(input: OtpRequestInput, meta: TokenRequestMeta) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: input.phone },
      select: { role: true, status: true },
    });

    if (existing) {
      if (existing.role !== input.role) {
        throw new ConflictException(
          `This phone number is registered as a ${existing.role} account`,
        );
      }
      this.assertStatusAllowed(existing.status);
    }

    return this.otpService.issue(input.phone, 'LOGIN', meta.ip);
  }

  /**
   * Stage 2 of the login flow: consume the OTP, then either activate an
   * existing account (PENDING_VERIFICATION -> ACTIVE — the OTP IS the phone
   * verification) or create a brand-new CUSTOMER/DRIVER account, and finally
   * hand out the token pair.
   */
  async verifyOtp(
    input: OtpVerifyInput,
    meta: TokenRequestMeta,
  ): Promise<AuthSession> {
    await this.otpService.verify(input.phone, 'LOGIN', input.code);

    let user = await this.prisma.user.findUnique({
      where: { phone: input.phone },
    });

    if (!user) {
      // First login on this phone: OTP proves phone ownership, so the
      // account is created ACTIVE. ADMIN can never be created here (DTO).
      if (!input.fullName || input.fullName.trim().length < 2) {
        throw new UnauthorizedException(
          'fullName is required when logging in for the first time',
        );
      }
      user = await this.prisma.user.create({
        data: {
          phone: input.phone,
          fullName: input.fullName.trim(),
          role: input.role,
          status: 'ACTIVE',
          ...(input.role === 'CUSTOMER'
            ? { customer: { create: {} } }
            : { driver: { create: {} } }),
        },
      });
      this.logger.log(
        `created ${input.role} account via OTP login (userId=${user.id})`,
      );
    } else {
      if (user.role !== input.role) {
        throw new ConflictException(
          `This phone number is registered as a ${user.role} account`,
        );
      }
      this.assertStatusAllowed(user.status);
      if (user.status === 'PENDING_VERIFICATION') {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE' },
        });
      }
    }

    const tokens = await this.tokenService.issueTokenPair(
      user.id,
      user.role,
      meta,
    );
    return { user: this.toAuthUser(user), tokens };
  }

  /**
   * Rotates a refresh token into a fresh pair. The account status is
   * re-checked on every refresh so suspensions kill sessions within one
   * access-token TTL (15 min by default).
   */
  async refresh(
    input: RefreshInput,
    meta: TokenRequestMeta,
  ): Promise<AuthSession> {
    const rotated = await this.tokenService.rotate(input.refreshToken, meta);

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });
    if (!user) {
      // Account deleted while a refresh token was outstanding.
      await this.tokenService.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException('Account no longer exists');
    }
    this.assertStatusAllowed(user.status);

    const accessToken = await this.tokenService.issueAccessToken(
      user.id,
      user.role,
    );
    return {
      user: this.toAuthUser(user),
      tokens: this.tokenService.buildTokens(accessToken, rotated.refreshToken),
    };
  }

  /**
   * Idempotent logout: revokes the presented refresh token when it belongs
   * to the authenticated user. Unknown/foreign/revoked tokens all resolve
   * to success (204) — logout never fails closed for the client.
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.tokenService.revoke(refreshToken, userId);
  }

  /** Logout everywhere: revokes every refresh token of the account. */
  async logoutAll(userId: string): Promise<number> {
    return this.tokenService.revokeAllForUser(userId);
  }

  /** Profile of the authenticated user (base identity projection). */
  async getProfile(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toAuthUser(user);
  }

  private assertStatusAllowed(status: AccountStatus): void {
    const message = STATUS_MESSAGES[status];
    if (message) {
      throw new ForbiddenException(message);
    }
  }

  /** Maps a Prisma user row onto the shared AuthUser contract. */
  private toAuthUser(user: {
    id: string;
    phone: string;
    fullName: string;
    email: string | null;
    role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
    status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
    createdAt: Date;
    updatedAt: Date;
  }): AuthUser {
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
