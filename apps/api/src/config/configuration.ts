import { registerAs } from '@nestjs/config';

/**
 * Namespaced configuration factories for ConfigService.
 * Values are read AFTER validateEnv() has coerced and merged the environment.
 *
 * Usage: configService.get<number>('app.port'), configService.get('db.url'), etc.
 * Namespaces: app, db, redis, jwt, cors, throttle, swagger, map.
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
  secret: process.env.JWT_SECRET ?? '',
  expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
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
