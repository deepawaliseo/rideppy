# Rideppy — Phase 0 Acceptance Checklist (Foundation)

**Approved scope decision:** the Customer app, Driver app and Admin dashboard are
developed in their own phases. Phase 0 delivers the monorepo foundation, shared
packages, environment configuration, API hardening and the database layer.

**Locked decisions:** `@rideppy/*` package naming · `PORT=3100` everywhere ·
native PostgreSQL + PostGIS on Windows (no Docker/WSL2) · CI on every push ·
mobile testing on a physical Android phone.

## WP-1 — Project consistency ✅
- [x] `@biketaxi/*` renamed to `@rideppy/*` (contracts package, compose, env example)
- [x] `PORT=3100` standardized (`.env.example`, docs); port-4000 references removed
- [x] `.gitignore` deduplicated
- [x] BOM characters removed (`main.ts`, `app.controller.ts`); floating promise fixed
- [x] Turbo `test` / `test:e2e` tasks added
- [x] Docs updated: native Windows path, app shells deferred, brand naming
- [x] Minimal GitHub Actions CI added (install, build, lint, unit + e2e)
- [x] Build, lint, unit tests, e2e tests and live `/health` boot verified

## WP-2 — Configuration layer ✅
- [x] `@nestjs/config` wired globally (`ConfigModule.forRoot`) with zod validation
- [x] `apps/api/src/config/env.schema.ts` — full env schema; invalid config refuses to boot
- [x] Production safety: boot fails on placeholder/short `JWT_SECRET` or default `DATABASE_URL`
- [x] Namespaced config factories: `app`, `db`, `redis`, `jwt`, `cors`, `throttle`, `swagger`, `map`
- [x] `.env.example` completed: `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `CORS_ORIGIN`,
      `THROTTLE_*`, `SWAGGER_*`, `MAP_PROVIDER` / `MAP_STYLE_URL` / `MAP_API_KEY`, `PORT=3100`
- [x] Unit tests for valid, invalid and production-unsafe environments (23 tests)
- [x] Build, lint, unit + e2e green; API boots on 3100; bad env exits with readable error

## WP-3 — API hardening ✅
- [x] Helmet security headers always on (`x-content-type-options`, `x-frame-options`, ...)
- [x] CORS from `cors.origins` config; `*` works in dev, refused in production (env-validated)
- [x] Global rate limiting via `@nestjs/throttler` (`THROTTLE_TTL_MS` / `THROTTLE_LIMIT`)
- [x] Global `ValidationPipe`: `whitelist`, `transform`, `forbidNonWhitelisted`
- [x] `AllExceptionsFilter`: one consistent error envelope; unknown errors never leak internals
- [x] Swagger at `/docs` (+ `/docs-json`), toggleable via `SWAGGER_ENABLED`, bearer-auth scheme
- [x] Graceful shutdown hooks (`enableShutdownHooks`)
- [x] E2E: health, Swagger doc, error envelope, helmet headers, CORS, throttling 429
- [x] Build, lint, unit + e2e all green

## WP-4 — Shared packages wiring
- [ ] `@rideppy/contracts` imported by the API via tsconfig paths
- [ ] Shared tsconfig package created; strictness increased
- [ ] Contracts types used by at least one API surface (health response)

## WP-5 — PostgreSQL + PostGIS + Prisma (native Windows, no Docker)
- [ ] PostgreSQL 16 service running; `psql` on PATH
- [ ] PostGIS installed (Stack Builder) and `CREATE EXTENSION postgis` verified
- [ ] `rideppy` role + database created with least privilege
- [ ] Prisma installed; `schema.prisma` on `postgresql` provider
- [ ] Baseline migration applied; Prisma Studio opens
- [ ] Raw-SQL geo-query pattern documented (Prisma does not model PostGIS types)
- [ ] `/health` performs a real DB ping and fails honestly when DB is down

## WP-6 — Final gate (on the Windows PC)
- [ ] `pnpm install → build → lint → test → test:e2e` all green locally
- [ ] API boots on `127.0.0.1:3100`; `/health` returns ok; `/docs` renders
- [ ] No secrets committed anywhere; `.env` exists only on local machines
- [ ] GitHub Actions CI green on the pushed branch

**Phase 0 is NOT complete until every box above is evidenced.**
