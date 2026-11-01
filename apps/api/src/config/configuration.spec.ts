import {
  appConfig,
  corsConfig,
  dbConfig,
  jwtConfig,
  mapConfig,
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

  it('jwtConfig exposes secret and expiry', () => {
    process.env.JWT_SECRET = 'test-secret';
    expect(jwtConfig()).toEqual({ secret: 'test-secret', expiresIn: '1d' });
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
    expect(throttleConfig()).toEqual({ ttlMs: 30000, limit: 50 });
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
