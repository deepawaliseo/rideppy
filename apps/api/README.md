# @rideppy/api — Rideppy API

NestJS API for the Rideppy bike taxi platform. Part of the pnpm + Turborepo
monorepo. Runs on **port 3100** (`PORT` env var).

## Scripts (run from `apps/api` or with `pnpm --dir apps/api <script>`)

| Command | Purpose |
|---|---|
| `start:dev` | Watch-mode development server |
| `build` | Compile to `dist/` |
| `lint` | ESLint (auto-fix) |
| `test` | Jest unit tests |
| `test:e2e` | Jest e2e tests (`test/`) |

## Endpoints (Phase 0 so far)

| Route | Description |
|---|---|
| `GET /` | Hello world (starter) |
| `GET /health` | `200` + `HealthResponse` (from `@rideppy/contracts`) when the database answers a `SELECT 1`; `503` + error envelope (`Database unreachable`) otherwise — the DB is never reported healthy while disconnected |
| `GET /docs` | Swagger UI (toggle via `SWAGGER_ENABLED`) |
| `GET /docs-json` | OpenAPI 3 document |

## Database (WP-5)

- **Stack**: PostgreSQL 16 + PostGIS via Prisma 6 (`prisma` / `@prisma/client`, CJS-safe).
- **Schema**: `prisma/schema.prisma` — User → 1:1 Customer/Driver profiles,
  Vehicle, Ride (with `GENERATED ALWAYS AS geography(Point, 4326)` columns +
  GiST indexes), Payment; money is integer paise (`*Minor` Int columns).
- **Migrations**: `prisma/migrations/20261101000000_init` (versioned SQL;
  the PostGIS hand-edits are documented in the file header).
- **Service**: `src/prisma/PrismaService` (global) — connects on boot, never
  crashes boot when the DB is down, disconnects on shutdown, powers the
  `/health` ping.
- **Windows setup**: see `docs/DATABASE-SETUP.md` (install, roles, `.env`,
  migrate, seed, verify).

### Database commands

| Command | Purpose |
|---|---|
| `pnpm --filter api db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `pnpm --filter api exec prisma db seed` | Idempotent demo data (upserts only) |
| `pnpm --filter api db:studio` | Prisma Studio GUI |
| `pnpm --filter api test:db` | Integration tests against a live DB (auto-skip when unreachable) |

## Shared contracts (WP-4)

All API payloads are typed by `@rideppy/contracts` (framework-independent
TypeScript, built to `dist/` with declarations). Jest resolves the package to
its TypeScript source via `moduleNameMapper`, so tests never depend on build
order.

## Security & HTTP behavior (WP-3)

- Helmet security headers on every response (`apps/api/src/app.setup.ts`).
- CORS from `CORS_ORIGIN`: `*` in development, explicit origin list required in
  production (enforced by env validation at boot).
- Global rate limiting via `@nestjs/throttler` — configure with `THROTTLE_TTL_MS`
  and `THROTTLE_LIMIT`; exceeded requests get HTTP 429 in the error envelope.
- Global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`).
- Every error uses one consistent JSON envelope
  (`src/common/filters/http-exception.filter.ts`); unknown exceptions never
  leak internals to clients.
- Graceful shutdown on SIGTERM/SIGINT (`enableShutdownHooks`).
- `main.ts` and the e2e tests share `configureApp()` from `app.setup.ts`, so
  tested behavior equals production behavior.

## Configuration

- Environment is validated at boot with zod (`src/config/env.schema.ts`) — an
  invalid or production-unsafe configuration refuses to start with a readable error.
- Structured namespaces via `ConfigService`: `app.*`, `db.*`, `redis.*`, `jwt.*`,
  `cors.*`, `throttle.*`, `swagger.*`, `map.*` (`src/config/configuration.ts`).
- Every variable and its safe placeholder: `/.env.example`.

## Notes

- `PORT=3100` is read from validated config (`app.port`).
- Never commit `.env` or real credentials.
