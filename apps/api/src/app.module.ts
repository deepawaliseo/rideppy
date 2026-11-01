import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';
import {
  appConfig,
  corsConfig,
  dbConfig,
  jwtConfig,
  mapConfig,
  otpConfig,
  redisConfig,
  swaggerConfig,
  throttleConfig,
} from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [
        appConfig,
        dbConfig,
        redisConfig,
        jwtConfig,
        otpConfig,
        corsConfig,
        throttleConfig,
        swaggerConfig,
        mapConfig,
      ],
    }),
    PrismaModule,
    // WP-1: phone + OTP authentication (controller, services, OTP provider).
    AuthModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('throttle.ttlMs', 60_000),
            limit: configService.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global validation: strips unknown properties, transforms payloads,
    // rejects requests containing non-whitelisted properties.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    },
    // Global rate limiting (throttle.* config).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // WP-1: global authentication + role authorization. ORDER MATTERS:
    // throttle (per-IP) -> authenticate (JWT) -> authorize (roles). Every
    // route is protected unless marked @Public (fail-closed posture).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // One consistent JSON error envelope for every response path.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
