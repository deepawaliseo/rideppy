# Rideppy Platform — Phase 0 Foundation

Monorepo for the **Rideppy** bike taxi platform (pnpm + Turborepo).

> **Status:** foundation phase. The Customer app, Driver app and Admin dashboard
> are built in their own phases (approved scope decision).

## Stack

| Layer | Technology | Location |
|---|---|---|
| API | NestJS + TypeScript, port `3100` | `apps/api` |
| Shared types | `@rideppy/contracts` | `packages/contracts` |
| Customer app | Expo + React Native | later phase |
| Driver app | Expo + React Native | later phase |
| Admin dashboard | Next.js | later phase |
| Database | PostgreSQL 16 + PostGIS (native Windows install) | WP-5 |
| Jobs/realtime | Redis + BullMQ, Socket.IO | ride phases |

`compose.yaml` remains available as an **optional** Postgres+PostGIS/Redis
reference but is not used on the development PC (no Docker/WSL2).

## Quick start (Windows PowerShell)

```powershell
cd C:\Projects\rideppy-platform
corepack enable
corepack pnpm install
Copy-Item .env.example .env   # then edit: set a strong local password
corepack pnpm --dir apps/api start:dev
```

Verify: `http://127.0.0.1:3100/health` returns JSON with `"status":"ok"`.

Full setup guide: `SETUP-WINDOWS.md` · Acceptance checklist: `docs/PHASE-0-CHECKLIST.md`.

## Fee model (implemented in a later phase)

First 30 days ₹0 platform fee per driver; thereafter ₹2 per eligible kilometre,
capped at ₹10 per completed ride, charged against driver earnings — subject to
final rules and legal review.

## Development rules

- Never commit `.env`, keys or credentials (`.gitignore` + CI structure).
- Work on feature branches; `main` is updated via reviewed pull requests.
- CI runs install → build → lint → unit + e2e tests on every push and PR.
