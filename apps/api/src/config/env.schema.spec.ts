import { DEV_DATABASE_URL, DEV_JWT_SECRET, validateEnv } from './env.schema';

const validDevEnv = {
  NODE_ENV: 'development',
  PORT: '3100',
  DATABASE_URL: DEV_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: DEV_JWT_SECRET,
  JWT_EXPIRES_IN: '1d',
  JWT_REFRESH_TTL_DAYS: '30',
  OTP_PROVIDER: 'console',
  OTP_CODE_TTL_SECONDS: '300',
  OTP_RESEND_COOLDOWN_SECONDS: '60',
  OTP_MAX_ATTEMPTS: '5',
  OTP_MAX_ACTIVE_PER_PHONE: '3',
  OTP_HOURLY_REQUEST_LIMIT: '10',
  CORS_ORIGIN: '*',
  THROTTLE_TTL_MS: '60000',
  THROTTLE_LIMIT: '100',
  SWAGGER_ENABLED: 'true',
  SWAGGER_PATH: 'docs',
  MAP_PROVIDER: 'none',
  MAP_STYLE_URL: '',
  MAP_API_KEY: '',
};

describe('validateEnv (valid configurations)', () => {
  it('accepts a fully valid environment and coerces numeric strings', () => {
    const env = validateEnv({ ...validDevEnv });
    expect(env.PORT).toBe(3100);
    expect(env.NODE_ENV).toBe('development');
    expect(env.THROTTLE_TTL_MS).toBe(60_000);
    expect(env.THROTTLE_LIMIT).toBe(100);
  });

  it('applies safe local defaults when variables are missing', () => {
    const env = validateEnv({});
    expect(env.PORT).toBe(3100);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe(DEV_DATABASE_URL);
    expect(env.JWT_SECRET).toBe(DEV_JWT_SECRET);
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.JWT_REFRESH_TTL_DAYS).toBe(30);
    expect(env.OTP_PROVIDER).toBe('console');
    expect(env.OTP_CODE_TTL_SECONDS).toBe(300);
    expect(env.OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
    expect(env.OTP_MAX_ACTIVE_PER_PHONE).toBe(3);
    expect(env.OTP_HOURLY_REQUEST_LIMIT).toBe(10);
    expect(env.MAP_PROVIDER).toBe('none');
    expect(env.SWAGGER_ENABLED).toBe('true');
  });

  it('accepts a hardened production environment', () => {
    const env = validateEnv({
      ...validDevEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'p'.repeat(48),
      DATABASE_URL:
        'postgresql://rideppy:strong-password@db.prod.internal:5432/rideppy',
      CORS_ORIGIN: 'https://admin.rideppy.example,https://app.rideppy.example',
      OTP_PROVIDER: 'twilio',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.JWT_SECRET).toHaveLength(48);
    expect(env.OTP_PROVIDER).toBe('twilio');
  });
});

describe('validateEnv (invalid configurations)', () => {
  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...validDevEnv, PORT: 'not-a-port' })).toThrow(
      /PORT/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...validDevEnv, PORT: '70000' })).toThrow(
      /PORT/,
    );
  });

  it('rejects a DATABASE_URL with the wrong scheme', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        DATABASE_URL: 'mysql://user:pass@localhost/db',
      }),
    ).toThrow(/postgresql:\/\//);
  });

  it('rejects a REDIS_URL with the wrong scheme', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/redis:\/\//);
  });

  it('rejects an invalid NODE_ENV value', () => {
    expect(() => validateEnv({ ...validDevEnv, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('rejects an invalid MAP_PROVIDER value', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, MAP_PROVIDER: 'google' }),
    ).toThrow(/MAP_PROVIDER/);
  });

  it('rejects an invalid SWAGGER_ENABLED value', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, SWAGGER_ENABLED: 'yes' }),
    ).toThrow(/SWAGGER_ENABLED/);
  });

  it('rejects an unknown OTP_PROVIDER value', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, OTP_PROVIDER: 'smoke-signals' }),
    ).toThrow(/OTP_PROVIDER/);
  });

  it('rejects non-numeric and out-of-range OTP tunables', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, OTP_MAX_ATTEMPTS: 'many' }),
    ).toThrow(/OTP_MAX_ATTEMPTS/);
    expect(
      () => validateEnv({ ...validDevEnv, OTP_CODE_TTL_SECONDS: '5' }), // below min 30
    ).toThrow(/OTP_CODE_TTL_SECONDS/);
    expect(
      () => validateEnv({ ...validDevEnv, JWT_REFRESH_TTL_DAYS: '400' }), // max 365
    ).toThrow(/JWT_REFRESH_TTL_DAYS/);
  });
});

describe('validateEnv (production safety)', () => {
  it('rejects the dev JWT secret in production', () => {
    expect(() =>
      validateEnv({ ...validDevEnv, NODE_ENV: 'production' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects a placeholder JWT secret in production even when long enough', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'CHANGE_ME_x'.repeat(6),
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects a short JWT secret in production', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects the dev database URL in production', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(48),
        OTP_PROVIDER: 'twilio',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects the console OTP provider in production (no pretend SMS delivery)', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(48),
        DATABASE_URL:
          'postgresql://rideppy:strong-password@db.prod.internal:5432/rideppy',
        CORS_ORIGIN: 'https://app.rideppy.example',
      }),
    ).toThrow(/OTP_PROVIDER/);
  });

  it('rejects the wildcard CORS_ORIGIN in production', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(48),
        DATABASE_URL:
          'postgresql://rideppy:strong-password@db.prod.internal:5432/rideppy',
        OTP_PROVIDER: 'twilio',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });
});
