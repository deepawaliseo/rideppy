import { DEV_DATABASE_URL, DEV_JWT_SECRET, validateEnv } from './env.schema';

const validDevEnv = {
  NODE_ENV: 'development',
  PORT: '3100',
  DATABASE_URL: DEV_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: DEV_JWT_SECRET,
  JWT_EXPIRES_IN: '1d',
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
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.JWT_SECRET).toHaveLength(48);
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
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects the wildcard CORS_ORIGIN in production', () => {
    expect(() =>
      validateEnv({
        ...validDevEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(48),
        DATABASE_URL:
          'postgresql://rideppy:strong-password@db.prod.internal:5432/rideppy',
      }),
    ).toThrow(/CORS_ORIGIN/);
  });
});
