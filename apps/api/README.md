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

## Notes

- Environment is loaded from the monorepo root `.env` (see `/.env.example`).
- `POST /health` responses will use types from `@rideppy/contracts` (WP-4).
- Never commit `.env` or real credentials.
