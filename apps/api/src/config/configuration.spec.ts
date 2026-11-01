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
} from './configuration';

describe('configuration factories', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('appConfig exposes name, env and port', () => {
    process.env.PORT = '3100';
    process.env.NODE_ENV = 'test';
    expect(appConfig()).toEqual({
      name: 'rideppy-api',
      env: 'test',
      port: 3100,
    });
  });

  it('dbConfig and redisConfig expose URLs', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/rideppy';
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(dbConfig()).toEqual({
      url: 'postgresql://u:p@localhost:5432/rideppy',
    });
    expect(redisConfig()).toEqual({ url: 'redis://localhost:6379' });
  });

  it('jwtConfig exposes secret, access expiry and refresh TTL', () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '10m';
    process.env.JWT_REFRESH_TTL_DAYS = '14';
    expect(jwtConfig()).toEqual({
      secret: 'test-secret',
      expiresIn: '10m',
      refreshTtlDays: 14,
    });
  });

  it('jwtConfig defaults to a short access token and 30-day refresh window', () => {
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_TTL_DAYS;
    process.env.JWT_SECRET = 'test-secret';
    expect(jwtConfig()).toEqual({
      secret: 'test-secret',
      expiresIn: '15m',
      refreshTtlDays: 30,
    });
  });

  it('otpConfig exposes the delivery provider and abuse limits', () => {
    process.env.OTP_PROVIDER = 'console';
    process.env.OTP_CODE_TTL_SECONDS = '120';
    process.env.OTP_RESEND_COOLDOWN_SECONDS = '30';
    process.env.OTP_MAX_ATTEMPTS = '3';
    process.env.OTP_MAX_ACTIVE_PER_PHONE = '2';
    process.env.OTP_HOURLY_REQUEST_LIMIT = '6';
    expect(otpConfig()).toEqual({
      provider: 'console',
      codeTtlSeconds: 120,
      resendCooldownSeconds: 30,
      maxAttempts: 3,
      maxActivePerPhone: 2,
      hourlyRequestLimit: 6,
    });
  });

  it('corsConfig parses comma-separated origins', () => {
    process.env.CORS_ORIGIN = 'http://a.local, http://b.local';
    expect(corsConfig()).toEqual({
      origins: ['http://a.local', 'http://b.local'],
    });
  });

  it('corsConfig falls back to the wildcard origin', () => {
    delete process.env.CORS_ORIGIN;
    expect(corsConfig()).toEqual({ origins: ['*'] });
  });

  it('throttleConfig coerces numeric strings', () => {
    process.env.THROTTLE_TTL_MS = '30000';
    process.env.THROTTLE_LIMIT = '50';
    expect(throttleConfig()).toEqual({
      ttlMs: 30000,
      limit: 50,
      otpRequestLimit: 5,
      otpVerifyLimit: 10,
      refreshLimit: 20,
    });
  });

  it('throttleConfig exposes the auth-surface limits with safe defaults', () => {
    delete process.env.THROTTLE_OTP_REQUEST_LIMIT;
    delete process.env.THROTTLE_OTP_VERIFY_LIMIT;
    delete process.env.THROTTLE_REFRESH_LIMIT;
    process.env.THROTTLE_TTL_MS = '60000';
    process.env.THROTTLE_LIMIT = '100';
    expect(throttleConfig()).toEqual({
      ttlMs: 60_000,
      limit: 100,
      otpRequestLimit: 5,
      otpVerifyLimit: 10,
      refreshLimit: 20,
    });
  });

  it('swaggerConfig parses the enabled flag strictly (only "true" enables)', () => {
    process.env.SWAGGER_ENABLED = 'false';
    expect(swaggerConfig()).toEqual({ enabled: false, path: 'docs' });
  });

  it('mapConfig exposes the provider triple', () => {
    process.env.MAP_PROVIDER = 'maptiler';
    process.env.MAP_STYLE_URL = 'https://tiles.example/style.json';
    process.env.MAP_API_KEY = 'placeholder-key';
    expect(mapConfig()).toEqual({
      provider: 'maptiler',
      styleUrl: 'https://tiles.example/style.json',
      apiKey: 'placeholder-key',
    });
  });
});
