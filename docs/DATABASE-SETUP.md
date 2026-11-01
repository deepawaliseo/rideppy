# Rideppy — Database Setup (native Windows, no Docker)

PostgreSQL 16 + PostGIS + Prisma, running as a native Windows service.
Everything here runs on the dev PC; CI (GitHub Actions) uses the
`postgis/postgis:16` image and proves the same migrations on every push.

---

## 1. Install PostgreSQL 16

1. Download the **PostgreSQL 16** installer from
   <https://www.enterprisedb.com/downloads-postgres-postgresql-downloads> (Windows x86-64).
2. During setup (defaults are fine):
   - Keep port **5432**.
   - Set the `postgres` superuser password and **save it somewhere safe**.
   - Leave Stack Builder checked at the end.

## 2. Install PostGIS (Stack Builder)

1. Launch **Stack Builder** (Start menu) → select the PostgreSQL 16 install.
2. Under *Spatial Extensions*, pick **PostGIS 3.x Bundle for PostgreSQL 16**.
3. Install with all defaults; allow the component installer to also register
   `CREATE EXTENSION` support. When asked, **do not** create a template
   spatial database (we create the extension per database instead).
4. Verify afterwards (Command Prompt):

   ```bat
   psql -U postgres -c "SELECT name, default_version FROM pg_available_extensions WHERE name = 'postgis';"
   ```

   Expect a row with `postgis | 3.x`. If `psql` is not on PATH, add
   `C:\Program Files\PostgreSQL\16\bin` to your user PATH.

## 3. Create the `rideppy` role and database

Open a psql shell as the superuser:

```bat
psql -U postgres
```

```sql
CREATE ROLE rideppy LOGIN PASSWORD 'rideppy' CREATEDB;
-- CREATEDB lets Prisma create its temporary shadow database during dev
-- migrations. Do NOT use this role in production.
CREATE DATABASE rideppy OWNER rideppy;

-- PostGIS files are owned by the superuser, so the superuser pre-creates the
-- extension; the WP-5 migration's `CREATE EXTENSION IF NOT EXISTS postgis`
-- then applies as a no-op when the `rideppy` role runs migrations.
\c rideppy
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

## 4. Configure the API environment

Create **`apps/api/.env`** (this file is git-ignored; never commit it):

```dotenv
DATABASE_URL=postgresql://rideppy:rideppy@localhost:5432/rideppy
# Everything else has safe development defaults; see .env.example
```

> The API and the Prisma CLI both read `apps/api/.env`. Keep it in
> `apps/api/` (NOT the repo root) so `pnpm --filter api ...` commands find it.

## 5. Apply migrations and seed

From the repo root:

```powershell
pnpm install                                   # also runs `prisma generate`
pnpm --filter api exec prisma migrate deploy   # applies prisma/migrations/*
pnpm --filter api exec prisma db seed          # idempotent demo data
```

Expected result: `20261101000000_init` applied; seed prints
`Seed complete: 4 users, 2 customers, 2 drivers, 2 vehicles, 2 rides, 1 payment.`
Re-running the seed is safe (upserts only, no deletes).

## 6. Verify the database end to end

```powershell
# 1) Tables + geo columns exist
psql -U rideppy -d rideppy -c "\dt"
psql -U rideppy -d rideppy -c "\d rides"       # pickupGeo geography(Point,4326) generated

# 2) Integration tests against the real database (skips honestly if DB is down)
pnpm --filter api test:db

# 3) Boot the API with the live database
pnpm --filter api build
node apps/api/dist/main.js
```

- `GET http://127.0.0.1:3100/health` → `200` with `"database":"up"`.
- Stop the PostgreSQL service (`net stop postgresql-x64-16` as admin) and
  re-request `/health` → `503` envelope `Database unreachable` — the API
  never reports the database healthy when it is disconnected. Start the
  service again and `/health` recovers on its own (lazy reconnect).

## 7. Raw SQL geo-query pattern (PostGIS + Prisma)

Prisma cannot model PostGIS types, so `pickupGeo`/`dropGeo` are declared as
`Unsupported("geography(Point, 4326)")`: application code writes the plain
`pickupLat`/`pickupLng` (etc.) columns via Prisma Client, and reads geo
features through `$queryRaw`:

```typescript
// Rides starting within 500 m of a point (uses the GiST index):
const rides = await prisma.$queryRaw<{ id: string; distanceM: number }[]>`
  SELECT "id"::text,
         ST_Distance("pickupGeo", ${ST_Point(lng, lat)}::geography) AS "distanceM"
  FROM "rides"
  WHERE ST_DWithin("pickupGeo", ${ST_Point(lng, lat)}::geography, 500)
    AND "status" = 'SEARCHING'
  LIMIT 20
`;

// ST_Point helper (immutable, SRID 4326):
//   ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
```

Rules of thumb:
- `ST_X`/`ST_Y`/`ST_SRID` take **geometry** → cast first: `"pickupGeo"::geometry`.
- `ST_DWithin`/`ST_Distance` have **geography** overloads → pass geography
  (meters, not degrees).
- Never hand-write into `pickupGeo`/`dropGeo` — they are
  `GENERATED ALWAYS AS`, PostgreSQL rejects direct writes.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `prisma migrate deploy` fails with `permission denied to create extension` | The extension wasn't pre-created. Repeat step 3's `CREATE EXTENSION` as `postgres`, then re-run. |
| P1001 can't reach database | PostgreSQL service stopped: `net start postgresql-x64-16`. |
| `P3006` migration failed at `CREATE EXTENSION` on a fresh DB | Extension missing: run step 3 again on that database. |
| Shadow database errors during `migrate dev` | The `rideppy` role needs `CREATEDB` (step 3) or use `SHADOW_DATABASE_URL` in `apps/api/.env`. |
| Seed prints `P2002` unique violation | Impossible by design (upserts) — report a bug. |
