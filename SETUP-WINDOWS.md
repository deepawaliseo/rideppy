# Windows 10 setup — Rideppy Phase 0 (native, no Docker/WSL2)

**Approved constraint:** the dev PC has ~8 GB RAM, so no Docker Desktop and no
WSL2. PostgreSQL + PostGIS run natively on Windows. Mobile testing later uses a
physical Android phone with Expo Go.

## 1. Prerequisites

- Node.js 22 LTS (or newer), Git
- pnpm 10.18.0 via corepack (pinned by root `package.json`)

```powershell
node --version
git --version
corepack enable
corepack pnpm --version   # must print 10.18.0
```

## 2. Install workspace dependencies

```powershell
cd C:\Projects\rideppy-platform
corepack pnpm install
```

## 3. Configure environment (never commit secrets)

```powershell
Copy-Item .env.example .env
notepad .env
```

Replace `CHANGE_ME_TO_A_STRONG_LOCAL_PASSWORD` with a strong local password in
**both** lines. `PORT=3100` is the API port everywhere. `.env` is git-ignored —
never commit it.

## 4. Run the API

```powershell
corepack pnpm --dir apps/api start:dev
```

Verify: `http://127.0.0.1:3100/health` returns
`{"service":"Rideppy API","status":"ok",...}`. The real database ping arrives
with WP-5.

## 5. Verify the toolchain

```powershell
corepack pnpm build
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
```

All four must pass. GitHub Actions CI runs the same steps on every push.

## 6. PostgreSQL + PostGIS (native Windows) — detailed steps arrive with WP-5

Planned path: PostgreSQL 16 installer (EDB) → Stack Builder → PostGIS →
create the `rideppy` role and database → Prisma migrate.

> Naming note: the standard database/role name is now **`rideppy`** (renamed
> from `biketaxi` in WP-1). If you already created an empty `biketaxi` database
> locally you may keep or drop it — WP-5 instructions will use `rideppy`.

If you ever want containers anyway, `compose.yaml` still works and now uses the
`rideppy` names too (`pnpm infra:up`) — but the dev-PC standard is native.

## 7. Deferred to later phases (do not scaffold now)

- `apps/customer`, `apps/driver` (Expo) — generated in their own phases
- `apps/admin` (Next.js) — generated in its own phase
- Swagger `/docs` and security middleware — WP-3
- Redis/BullMQ, Socket.IO — ride-phase work
- Physical-phone testing — mobile phases
