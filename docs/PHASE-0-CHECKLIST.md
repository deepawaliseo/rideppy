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

## WP-4 — Shared packages wiring ✅
- [x] `@rideppy/contracts` imported by the API via tsconfig paths
- [x] Shared tsconfig package created (`@rideppy/tsconfig`: `base` + `nestjs`); full `strict` mode on
- [x] Contracts types used by at least one API surface (health response + error envelope)
- [x] Domain contracts: Customer, Driver, Vehicle, Ride, RideStatus, Location,
      FareEstimate, Payment, HealthResponse / ApiErrorResponse / Paginated
- [x] Runtime value lists (`RIDE_STATUSES`, `USER_ROLES`, ...) + `isOneOf` guards;
      compile-time exhaustiveness proofs in the contract test suite
- [x] Money as integer paise (`toMinor` / `fromMinor`); locked fee model encoded
      in `FARE_RULES` (₹2/eligible km, ₹10 cap, 30-day waiver)
- [x] Contracts build to CJS `dist/` with declarations + `exports` map; framework-independent
- [x] `typecheck` script in every package; Turbo + CI run it

## WP-5 — PostgreSQL + PostGIS + Prisma (native Windows, no Docker) ✅
- [x] (Windows) PostgreSQL running natively — **verified on PostgreSQL 18.6 +
      PostGIS 3.6** (16 not forced; both supported); `psql` on PATH — docs/DATABASE-SETUP.md §1
- [x] (Windows) PostGIS installed and `CREATE EXTENSION postgis` verified — §2
- [x] (Windows) `rideppy` role + database created with least privilege — §3
- [x] Prisma 6.19 installed (`prisma` + `@prisma/client`, CJS-safe for NestJS 11 / Node 22);
      `schema.prisma` on `postgresql` provider — User/Customer/Driver/Vehicle/Ride/Payment
- [x] Versioned migration `20261101000000_init` applied on Windows; Prisma Studio opens
- [x] PostGIS in migration: `CREATE EXTENSION`, `geography(Point, 4326)` GENERATED
      columns on `rides`, GiST indexes
- [x] Raw-SQL geo-query pattern documented (docs/DATABASE-SETUP.md §7); Prisma models geo
      columns as `Unsupported` so they are never dropped by future migrations
- [x] `/health` performs a real `SELECT 1` DB ping and returns 503 + error envelope when
      the DB is down — **Windows: HTTP 200 with `"database":"up"` when healthy** (commit 3c5ed35)
- [x] Money stored as integer paise (Int columns, `*Minor`); seed script idempotent (upserts)
- [x] (Windows) Integration suite against live DB passed — 48 unit + 8 e2e + 6 real-database
      integration tests, migration + seed applied (WP-5 evidence, commit 3c5ed35)

## WP-6 — Final integration gate
- [x] Repeatable Windows verification script `scripts/verify.ps1`: preflight → install →
      build → typecheck → lint → unit → e2e → hygiene → database gate (migrate deploy,
      `migrate status` up-to-date, seed ×2, integration tests, live API smoke) — docs/VERIFICATION.md §1
- [x] DB integration tests are an honest two-mode gate: `RIDEPPY_DB_REQUIRED=1` + unreachable
      DB → **explicit failures, exit 1**; without the flag → **native `skipped`**, never counted
      as passes; verify.ps1 additionally fails on any skipped test in required mode
- [x] Seed idempotency proven in-test (`runSeed()` twice → identical row counts) and by
      verify.ps1 + CI seeding twice
- [x] Live HTTP gate `scripts/smoke.mjs` (27 checks): `/health` contract shape, `/docs` Swagger,
      `/docs-json` OpenAPI, exact 404/503 `ApiErrorResponse` envelopes, helmet header;
      `--expect-db-down` drives the 503 drill
- [x] Repository hygiene gate `scripts/check-repo-hygiene.mjs`: tracked build artifacts,
      tracked `.env` files, private keys, tokens, credential URLs (localhost/reserved-TLD
      fixtures allowed as info, real hosts fail)
- [x] CI `database` job upgraded to **postgis/postgis:18-3.6** (PG 18 + PostGIS 3.6, matching
      the Windows PC) with `RIDEPPY_DB_REQUIRED=1` — an unavailable database fails CI, never skips
- [x] Sandbox verification green: build/typecheck/lint, 39 unit + 8 e2e, gate semantics
      (1 passed + 7 skipped unflagged; 8 failed exit 1 flagged), 503 drill smoke 27/27,
      hygiene 0 failures — see docs/VERIFICATION.md §5
- [x] Docs: verification matrix + Windows commands (docs/VERIFICATION.md), DATABASE-SETUP.md
      PostgreSQL 16/18 wording, SETUP-WINDOWS.md verify.ps1 usage, api README test:db semantics
- [ ] (Windows) Run `powershell -ExecutionPolicy Bypass -File scripts\verify.ps1` end-to-end
      and record the summary as the Phase 0 completion evidence
- [ ] (Windows) GitHub Actions CI green on the pushed WP-6 branch

**Phase 0 is NOT complete until every box above is evidenced — in particular,
a `scripts\verify.ps1` run with database verification PERFORMED (no `-SkipDb`),
whose summary names every step PASS.**
