import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OtpService } from './otp/otp.service';
import { createOtpSender } from './otp/otp-sender.factory';
import { OTP_SENDER } from './otp/otp-sender.interface';
import { TokenService } from './token.service';

/**
 * WP-1 authentication foundation: phone + OTP login, JWT access tokens,
 * rotating refresh tokens, role-based authorization guards.
 *
 * JwtModule is EXPORTED so the globally-registered JwtAuthGuard (APP_GUARD
 * in AppModule) can resolve JwtService from the root injector.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwt.secret'),
        signOptions: {
          // Validated upstream by env.schema (min length, defaults); the
          // double cast bridges @nestjs/config's plain string to the
          // `ms`-style StringValue union used by @nestjs/jwt.
          expiresIn: configService.getOrThrow<string>(
            'jwt.expiresIn',
          ) as unknown as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    // OTP delivery provider, selected once per process from validated env.
    {
      provide: OTP_SENDER,
      inject: [ConfigService],
      useFactory: createOtpSender,
    },
    // Concrete guard classes are also provided here so unit tests (and any
    // feature module) can inject them; the global APP_GUARD registration
    // happens in AppModule to keep the security order explicit.
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtModule, TokenService],
})
export class AuthModule {}
