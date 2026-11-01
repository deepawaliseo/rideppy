# Rideppy — Verification Guide (WP-6 final integration gate)

Two different machines verify this repository, and **they verify different
things**. Every claim about "it works" must name which environment proved it.

| | Sandbox (delivery pipeline) | Windows dev PC / CI |
|---|---|---|
| install · build · typecheck · lint | ✅ verified | ✅ verified |
| unit tests (39) · e2e tests (8) | ✅ verified | ✅ verified |
| Patch applies cleanly (`git am --3way`) | ✅ verified | ✅ verified |
| Repository hygiene + secret scan | ✅ verified | ✅ verified |
| DB integration tests **skipped honestly** (DB down → `skipped`, never passed) | ✅ verified | — |
| DB integration tests **explicit failure** (`RIDEPPY_DB_REQUIRED=1` + DB down → exit 1) | ✅ verified | — |
| API boots, `/health` = 503 + error envelope when DB unreachable | ✅ verified | — |
| Live HTTP gate (`scripts/smoke.mjs --expect-db-down`): 27 checks | ✅ verified | — |
| `prisma migrate deploy` / `migrate status` on real PostgreSQL | ❌ impossible | ✅ **required** |
| Seed + seed idempotency on real PostgreSQL | ❌ impossible | ✅ **required** |
| DB integration tests **passing for real** (7 tests) | ❌ impossible | ✅ **required** |
| `/health` = 200 with `"database":"up"` | ❌ impossible | ✅ **required** |
| Live HTTP gate with database up (smoke.mjs default mode) | ❌ impossible | ✅ **required** |

**Rule introduced in WP-6:** skipped database tests are never reported as
passes, and a run with `-SkipDb` can never be quoted as database
verification.

---

## 1. The one Windows command

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

Runs, in order (stopping failures are reported in the final summary):

| Step | What runs | Requires DB |
|---|---|---|
| 0 | Preflight: Node ≥ 22, pnpm, git, PostgreSQL service status | – |
| 1 | `pnpm install --frozen-lockfile` | – |
| 2 | `pnpm build` | – |
| 3 | `pnpm typecheck` | – |
| 4 | `pnpm lint` | – |
| 5 | `pnpm test` (unit) | – |
| 6 | `pnpm test:e2e` | – |
| 7 | `node scripts/check-repo-hygiene.mjs` (tracked artifacts + secret scan) | – |
| 8a | `prisma migrate deploy` | ✅ |
| 8b | `prisma migrate status` — must print **up to date** | ✅ |
| 8c/8d | `prisma db seed` **twice** (idempotency) | ✅ |
| 8e | `pnpm --filter api test:db` with `RIDEPPY_DB_REQUIRED=1` | ✅ |
| 8f | Boot `apps/api/dist/main.js`, wait for `/health` 200 + `database:up`, run `scripts/smoke.mjs` (27 live checks) | ✅ |

Switches:

```powershell
# Re-run everything but skip reinstall:
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipInstall

# No database today? Explicitly NOT a database verification:
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipDb
```

`-SkipDb` prints **"DATABASE VERIFICATION: NOT PERFORMED"** in the summary and
is intended only for quick toolchain checks.

### Database-down drill (optional, ~1 minute)

Proves the API never reports a dead database as healthy:

```powershell
# 1. Start the drill with the DB still up, API on 3100:
pnpm --filter api build
node apps\api\dist\main.js          # keep this window open

# 2. In a second window, stop PostgreSQL (admin):
net stop postgresql-x64-18          # or postgresql-x64-16

# 3. The API must degrade honestly:
node scripts\smoke.mjs --base-url http://127.0.0.1:3100 --expect-db-down
#    → "SMOKE OK — 27 checks passed (database-down drill)"

# 4. Recover:
net start postgresql-x64-18
node scripts\smoke.mjs --base-url http://127.0.0.1:3100
#    → "SMOKE OK — 27 checks passed (database up)"
```

---

## 2. How the DB integration gate works (WP-6 fix)

`apps/api/test/db/` — `global-setup.js` probes the database **once** with a
real `SELECT 1` before tests are collected and writes a credential-free probe
result; `global-teardown.js` deletes it.

| Situation | Behaviour |
|---|---|
| DB up | all 7 integration tests run for real |
| DB down, `RIDEPPY_DB_REQUIRED` **set** (verify.ps1, CI) | every test **fails explicitly** with "EXPLICIT FAILURE — database verification is REQUIRED…" → exit 1 |
| DB down, flag **unset** (local dev, sandbox) | tests register as **native `skipped`** (`○ skipped`) — visibly skipped, never "passed" |

`scripts/verify.ps1` additionally greps the Jest summary and fails if any
skipped test appears in the REQUIRED-mode run.

The suite also includes a WP-6 gate self-check (always runs) and a **seed
idempotency test**: `runSeed()` is executed twice against the live database
and row counts must be identical.

## 3. CI (GitHub Actions)

`verify` job: install → build → typecheck → lint → unit → e2e.
`database` job: **PostgreSQL 18 + PostGIS 3.6** (`postgis/postgis:18-3.6`,
same major versions as the Windows dev PC) with `RIDEPPY_DB_REQUIRED=1`:
migrate deploy → migrate status (`up to date`) → seed ×2 → integration tests
(explicit-failure mode) → boot + `/health` `"database":"up"`.

## 4. Applying a WP patch on Windows

```powershell
git checkout main
git pull origin main
git am --3way rideppy-wp6.patch     # keep patch file OUTSIDE the repo tree
corepack pnpm install
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipInstall
```

If `git am` reports conflicts: `git am --abort` and report the patch filename
back — do not hand-merge WP patches.

## 5. Sandbox evidence (this delivery)

Verified on the WP-6 delivery branch before the patch was generated:

- `pnpm build` / `typecheck` / `lint` — green, 0 warnings
- `pnpm test` — 39 passed · `pnpm test:e2e` — 8 passed
- `pnpm --filter api test:db` (no DB, no flag) — **1 passed (gate self-check), 7 skipped**, exit 0
- `RIDEPPY_DB_REQUIRED=1 … test:db` (no DB) — **8 failed, exit 1** (explicit)
- Boot with unreachable DB → `/health` 503 + exact `ApiErrorResponse` envelope
- `scripts/smoke.mjs --expect-db-down` — **27/27 checks** (503 envelope, `/docs`,
  `/docs-json`, 404 envelope, helmet header)
- `scripts/check-repo-hygiene.mjs` — 61 tracked files, 0 failures (its
  fail-path was proven: it initially flagged a fictional test fixture, which
  was then properly allow-listed as a reserved-TLD placeholder)
- Patch applies with `git am --3way` on a pristine `origin/main` worktree

Not verifiable in the sandbox (no PostgreSQL): migrate/seed/`test:db`-passing/
`database:"up"` — these are exactly steps 8a–8f of `verify.ps1` on Windows.
