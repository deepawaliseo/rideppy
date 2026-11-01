import { registerAs } from '@nestjs/config';

/**
 * Namespaced configuration factories for ConfigService.
 * Values are read AFTER validateEnv() has coerced and merged the environment.
 *
 * Usage: configService.get<number>('app.port'), configService.get('db.url'), etc.
 * Namespaces: app, db, redis, jwt, otp, cors, throttle, swagger, map.
 */

export const appConfig = registerAs('app', () => ({
  name: 'rideppy-api',
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3100),
}));

export const dbConfig = registerAs('db', () => ({
  url: process.env.DATABASE_URL ?? '',
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL ?? '',
}));

export const jwtConfig = registerAs('jwt', () => ({
  /** HS256 signing secret. >= 32 chars, non-placeholder in production. */
  secret: process.env.JWT_SECRET ?? '',
  /** ACCESS-token lifetime (e.g. '15m'). Refresh tokens use JWT_REFRESH_TTL_DAYS. */
  expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  /** Refresh-token session lifetime in days (rotation window). */
  refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
}));

export const otpConfig = registerAs('otp', () => ({
  /** 'console' (dev/test only) — real SMS providers refuse to boot until implemented. */
  provider: process.env.OTP_PROVIDER ?? 'console',
  codeTtlSeconds: Number(process.env.OTP_CODE_TTL_SECONDS ?? 300),
  resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
  maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  maxActivePerPhone: Number(process.env.OTP_MAX_ACTIVE_PER_PHONE ?? 3),
  hourlyRequestLimit: Number(process.env.OTP_HOURLY_REQUEST_LIMIT ?? 10),
}));

export const corsConfig = registerAs('cors', () => ({
  /** '*' or a comma-separated list of origins, parsed into an array. */
  origins: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
}));

export const throttleConfig = registerAs('throttle', () => ({
  ttlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  limit: Number(process.env.THROTTLE_LIMIT ?? 100),
  /** Stricter per-IP limits for the auth surface (see auth.controller). */
  otpRequestLimit: Number(process.env.THROTTLE_OTP_REQUEST_LIMIT ?? 5),
  otpVerifyLimit: Number(process.env.THROTTLE_OTP_VERIFY_LIMIT ?? 10),
  refreshLimit: Number(process.env.THROTTLE_REFRESH_LIMIT ?? 20),
}));

export const swaggerConfig = registerAs('swagger', () => ({
  enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
  path: process.env.SWAGGER_PATH ?? 'docs',
}));

export const mapConfig = registerAs('map', () => ({
  provider: process.env.MAP_PROVIDER ?? 'none',
  styleUrl: process.env.MAP_STYLE_URL ?? '',
  apiKey: process.env.MAP_API_KEY ?? '',
}));
