import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthSession, AuthUser } from '@rideppy/contracts';
import { AuthService } from './auth.service';
import {
  OTP_REQUEST_THROTTLE,
  OTP_VERIFY_THROTTLE,
  REFRESH_THROTTLE,
} from './auth.throttle';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { AuthenticatedUser } from './auth.types';
import type { OtpIssueResult } from './otp/otp.service';
import type { TokenRequestMeta } from './token.service';
import type { Request } from 'express';

/**
 * Per-IP HTTP throttling for the auth surface (the OTP-level per-phone
 * cooldowns, caps and attempt limits live in OtpService). The global
 * default (100/min) stays untouched everywhere else; limits are
 * env-configurable (THROTTLE_OTP_* / THROTTLE_REFRESH_*).
 */

function requestMeta(request: Request): TokenRequestMeta {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Stage 1 — request a login OTP. Idempotent response shape whether or not
   * the phone has an account; the code itself NEVER appears in the response
   * (in development the console provider logs it server-side).
   */
  @Public()
  @Throttle(OTP_REQUEST_THROTTLE)
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a login OTP for a CUSTOMER/DRIVER phone' })
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @Req() request: Request,
  ): Promise<OtpIssueResult> {
    return this.authService.requestOtp(dto, requestMeta(request));
  }

  /**
   * Stage 2 — verify the OTP. Creates the account on first login (fullName
   * required then), activates PENDING_VERIFICATION accounts, and returns the
   * session (user + token pair).
   */
  @Public()
  @Throttle(OTP_VERIFY_THROTTLE)
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify the OTP and receive the session tokens' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() request: Request,
  ): Promise<AuthSession> {
    return this.authService.verifyOtp(dto, requestMeta(request));
  }

  /** Exchanges a valid refresh token for a fresh token pair (rotation). */
  @Public()
  @Throttle(REFRESH_THROTTLE)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token into a fresh pair' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<AuthSession> {
    // RefreshTokenDto is structurally the shared RefreshInput contract.
    return this.authService.refresh(dto, requestMeta(request));
  }

  /** Revokes the presented refresh token (idempotent, per-session logout). */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the presented refresh token (logout)' })
  @ApiBearerAuth()
  async logout(
    @Body() dto: LogoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.authService.logout(user.userId, dto.refreshToken);
  }

  /** Revokes EVERY refresh token of the account (logout on all devices). */
  @Post('logout/all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all refresh tokens of the account' })
  @ApiBearerAuth()
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.userId);
  }

  /**
   * Profile of the authenticated user. Only CUSTOMER/DRIVER sessions exist
   * in Phase 1 (ADMIN is provisioned by operations, never self-service), so
   * the route demonstrates the role gate explicitly.
   */
  @Roles('CUSTOMER', 'DRIVER')
  @Get('me')
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  @ApiBearerAuth()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.authService.getProfile(user.userId);
  }
}
