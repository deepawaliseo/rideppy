import { z } from 'zod';

/**
 * Zod schema for the Rideppy API environment.
 *
 * Design rules:
 * - Local development boots with ZERO configuration (every variable has a safe default).
 * - Production (NODE_ENV=production) fails fast unless real secrets are provided.
 * - Placeholders only — never put real credentials in this file or in Git.
 */

/** Dev-only default. MUST be overridden in production (enforced in validateEnv). */
export const DEV_JWT_SECRET =
  'dev-only-insecure-jwt-secret-change-me-000000000000';
export const DEV_DATABASE_URL =
  'postgresql://rideppy:rideppy@localhost:5432/rideppy';

export const envSchema = z.object({
  // --- Runtime -------------------------------------------------------------
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),

  // --- Database: PostgreSQL 16 + PostGIS (real connection used from WP-5) ---
  DATABASE_URL: z
    .string()
    .regex(/^postgresql:\/\//, 'DATABASE_URL must start with postgresql://')
    .default(DEV_DATABASE_URL),

  // --- Redis (jobs + realtime adapter, later phases) ------------------------
  REDIS_URL: z
    .string()
    .regex(/^redis:\/\//, 'REDIS_URL must start with redis://')
    .default('redis://localhost:6379'),

  // --- Auth (used from the auth phase onwards) -------------------------------
  JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),

  // --- HTTP surface -----------------------------------------------------------
  // '*' or a comma-separated origin list, e.g. "http://localhost:8081,https://admin.local"
  CORS_ORIGIN: z.string().default('*'),

  // --- Rate limiting -----------------------------------------------------------
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // --- Swagger ------------------------------------------------------------------
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('true'),
  SWAGGER_PATH: z.string().default('docs'),

  // --- MapLibre map provider (configurable licensed provider, decided later) ----
  MAP_PROVIDER: z
    .enum([
      'none',
      'maptiler',
      'mapmyindia',
      'nextbillion',
      'protomaps',
      'custom',
    ])
    .default('none'),
  MAP_STYLE_URL: z.string().default(''),
  MAP_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

/** Returns a list of production-safety problems (empty list = safe). */
export function assertProductionSafety(env: Env): string[] {
  const problems: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (
      env.JWT_SECRET === DEV_JWT_SECRET ||
      env.JWT_SECRET.startsWith('CHANGE_ME') ||
      env.JWT_SECRET.length < 32
    ) {
      problems.push(
        'JWT_SECRET must be a strong unique value (>= 32 chars, non-placeholder) in production',
      );
    }
    if (env.DATABASE_URL === DEV_DATABASE_URL) {
      problems.push(
        'DATABASE_URL must point to the real production database in production',
      );
    }
    if (env.CORS_ORIGIN.trim() === '*') {
      problems.push(
        'CORS_ORIGIN must be an explicit origin list in production (no "*")',
      );
    }
  }
  return problems;
}

/**
 * Validator for @nestjs/config `validate`.
 * Parses + coerces raw env values; on success the parsed values are merged back
 * into process.env by @nestjs/config; on failure the API refuses to boot with a
 * readable error listing every problem.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  const problems = assertProductionSafety(parsed.data);
  if (problems.length > 0) {
    throw new Error(
      `Environment validation failed (production safety):\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
  }

  return parsed.data;
}
