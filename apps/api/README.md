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
| `GET /health` | Service health JSON — DB ping arrives in WP-5 |

Swagger docs at `/docs` arrive in WP-3.

## Configuration

- Environment is validated at boot with zod (`src/config/env.schema.ts`) — an
  invalid or production-unsafe configuration refuses to start with a readable error.
- Structured namespaces via `ConfigService`: `app.*`, `db.*`, `redis.*`, `jwt.*`,
  `cors.*`, `throttle.*`, `swagger.*`, `map.*` (`src/config/configuration.ts`).
- Every variable and its safe placeholder: `/.env.example`.

## Notes

- `PORT=3100` is read from validated config (`app.port`).
- Never commit `.env` or real credentials.
