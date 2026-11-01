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
  redisConfig,
  swaggerConfig,
  throttleConfig,
} from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

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
        corsConfig,
        throttleConfig,
        swaggerConfig,
        mapConfig,
      ],
    }),
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
    // One consistent JSON error envelope for every response path.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
