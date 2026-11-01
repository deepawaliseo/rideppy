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
| `GET /health` | Service health JSON (`HealthResponse` from `@rideppy/contracts`) — DB ping arrives in WP-5 |
| `GET /docs` | Swagger UI (toggle via `SWAGGER_ENABLED`) |
| `GET /docs-json` | OpenAPI 3 document |

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
