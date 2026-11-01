# Rideppy — Authentication Foundation (Phase 1 / WP-1)

Phone-number authentication with OTP, JWT access tokens and rotating refresh
tokens for CUSTOMER and DRIVER accounts. This document describes the shipped
architecture, the security model, every tunable and how to verify it.

---

## 1. What is implemented

| Capability | Where |
| --- | --- |
| `POST /auth/otp/request` — request a login OTP (202) | `apps/api/src/auth/auth.controller.ts` |
| `POST /auth/otp/verify` — verify OTP, create/activate account, get session | 〃 |
| `POST /auth/refresh` — rotate refresh token, fresh pair | 〃 |
| `POST /auth/logout` — revoke one session (204, idempotent) | 〃 |
| `POST /auth/logout/all` — revoke every session of the account (204) | 〃 |
| `GET /auth/me` — authenticated profile (`@Roles('CUSTOMER','DRIVER')`) | 〃 |
| Global JWT auth guard (fail-closed, `@Public` opt-out) | `auth/guards/jwt-auth.guard.ts` |
| Global role authorization guard (`@Roles(...)`) | `auth/guards/roles.guard.ts` |
| OTP provider abstraction (console sender; real gateways plug in) | `auth/otp/*` |
| OTP hashing (scrypt), cooldowns, caps, attempt limits | `auth/otp/otp.service.ts`, `auth/crypto.util.ts` |
| Refresh-token rotation with family reuse detection | `auth/token.service.ts` |
| Shared contracts (`AuthSession`, `TokenPair`, `AuthUser`, ...) | `packages/contracts/src/auth.ts` |
| Data model: `OtpCode`, `RefreshToken`, `OtpPurpose` | `apps/api/prisma/schema.prisma` + migration `20261102000000_auth_foundation` |

## 2. Login flow

```
App                          API                                Database
 │  POST /auth/otp/request    │                                    │
 │  {phone, role}────────────▶│ cooldown/caps checked (DB)         │
 │                            │ 6-digit CSPRNG code, scrypt hash   │
 │                            │ delivery provider.send()──────────▶│ otp_codes row
 │◀─── 202 {expiresIn, ...}   │ (console: log / SMS: gateway)      │ (hash only)
 │
 │  POST /auth/otp/verify     │
 │  {phone, role, code,       │ attempt counter++ (persisted)      │
 │   fullName?}──────────────▶│ scrypt verify, consume             │
 │                            │ new? create User+profile ACTIVE    │
 │                            │ pending? activate to ACTIVE        │
 │                            │ suspended/deactivated? 403         │
 │◀─── 201 {user, tokens}     │ access JWT + refresh token         │ refresh_tokens row
 │
 │  every request: Authorization: Bearer <accessToken> (15 min)
 │
 │  POST /auth/refresh        │ rotate: parent revoked, child issued
 │◀─── 201 {user, tokens}     │ (same family; reuse ⇒ family revoked)
```

### Account creation rules

- Only `CUSTOMER` and `DRIVER` are self-service (`AUTH_ROLES` in contracts).
  **ADMIN can never be created or used through this API.**
- A phone maps to exactly one account; requesting the other role → `409`.
- First login REQUIRES `fullName`; the account is created `ACTIVE` because
  the successful OTP **is** the phone verification.
- Status rules: `SUSPENDED` / `DEACTIVATED` → `403` before any SMS spend and
  before any token is issued; `PENDING_VERIFICATION` → activated on first
  successful verification.

### The fullName trade-off (documented behavior)

`fullName` is required only when the phone has no account. The check runs
AFTER the OTP is consumed on purpose: checking first would turn
`/auth/otp/verify` into an unauthenticated phone-enumeration oracle.
Consequence: a verify attempt without `fullName` burns the code — the client
requests a new OTP (respecting the resend cooldown) and retries.

## 3. Security model

### OTP

- **Generation**: `crypto.randomInt(0, 1_000_000)` — CSPRNG, 6 digits.
- **Storage**: scrypt (N=32768, r=8, p=1, 32-byte key) with a per-code salt;
  self-describing hash format `scrypt$N$r$p$salt$hash`. Plaintext codes are
  never stored. scrypt is memory-hard because a 6-digit code has only ~20
  bits of entropy.
- **Comparison**: constant-time (`timingSafeEqual`).
- **Lifetime**: `OTP_CODE_TTL_SECONDS` (default 300 s).
- **Attempt limit**: every verify attempt is persisted BEFORE the hash
  comparison; at `OTP_MAX_ATTEMPTS` (default 5) the code locks with `429`.
- **Abuse caps per phone** (database-enforced):
  - resend cooldown `OTP_RESEND_COOLDOWN_SECONDS` (default 60 s) → `429`;
  - hourly request cap `OTP_HOURLY_REQUEST_LIMIT` (default 10) → `429`;
  - outstanding-code cap `OTP_MAX_ACTIVE_PER_PHONE` (default 3) → `429`.
- **Per-IP HTTP throttling** (env-tunable, see §4): 5/min request,
  10/min verify, 20/min refresh; the global default remains 100/min.

### Tokens

- **Access token**: HS256 JWT, `typ: 'access'` claim, default **15 min**
  (`JWT_EXPIRES_IN`). Claims: `sub` (user id), `role`, `typ`, `iat`, `exp`.
  The guard rejects any token whose `typ` is not `access`.
- **Refresh token**: 384-bit CSPRNG, base64url — opaque to the client.
  Stored ONLY as SHA-256 hash (`tokenHash`, unique). Shown exactly once.
- **Rotation**: every `/auth/refresh` revokes the parent (`revokedAt` +
  `replacedById` → child) and issues a child in the same `familyId`.
- **Reuse detection**: presenting an already-revoked token is treated as
  token theft — the ENTIRE family is revoked and the caller must log in
  again (`401` with `reuse detected` in the message).
- **Revocation**: `logout` (one session, idempotent, ownership-checked),
  `logout/all` (every session). Sessions are also re-validated against the
  account status on every refresh, so suspensions take effect within one
  access-token TTL.
- **Session TTL**: `JWT_REFRESH_TTL_DAYS` (default 30, max 365).

### Provider honesty ("never pretend")

- `OTP_PROVIDER=console` (default) prints the code to the server log,
  clearly labeled `NOT delivered as SMS`. Responses report
  `deliveredVia: 'console'`.
- `OTP_PROVIDER=twilio|msg91` is accepted by the schema but the sender
  factory **refuses to boot** until the provider is actually implemented
  and configured — no silent dropping, no fake success.
- Production (`NODE_ENV=production`) **fails to boot** with
  `OTP_PROVIDER=console` (env validation, `assertProductionSafety`).
- If a provider throws mid-issue, the OTP row is deleted and the API
  returns `400` — a code that can never arrive is not kept around.

### Fail-closed routing

`JwtAuthGuard` and `RolesGuard` are registered GLOBALLY (`APP_GUARD`, order:
throttle → authenticate → authorize). Every route requires a valid access
token unless explicitly marked `@Public`. Currently public: `/`,
`/health`, `/docs`, and the auth endpoints listed in §1 that are
pre-authentication by nature (`otp/request`, `otp/verify`, `refresh`).

## 4. Environment variables (additions in WP-1)

All have safe development defaults; nothing needs to be set to boot locally.

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `15m` | Access-token lifetime (was `1d`; nothing consumed it before WP-1) |
| `JWT_REFRESH_TTL_DAYS` | `30` | Refresh-token session window (1..365) |
| `OTP_PROVIDER` | `console` | `console` \| `twilio` \| `msg91` (unimplemented → boot refusal) |
| `OTP_CODE_TTL_SECONDS` | `300` | OTP validity (30..3600) |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Per-phone resend cooldown (15..600) |
| `OTP_MAX_ATTEMPTS` | `5` | Wrong-code attempts per code (1..10) |
| `OTP_MAX_ACTIVE_PER_PHONE` | `3` | Concurrent unconsumed codes (1..10) |
| `OTP_HOURLY_REQUEST_LIMIT` | `10` | Per-phone requests per hour (1..60) |
| `THROTTLE_OTP_REQUEST_LIMIT` | `5` | Per-IP/min on `POST /auth/otp/request` |
| `THROTTLE_OTP_VERIFY_LIMIT` | `10` | Per-IP/min on `POST /auth/otp/verify` |
| `THROTTLE_REFRESH_LIMIT` | `20` | Per-IP/min on `POST /auth/refresh` |

Production boot remains fail-fast on: dev/placeholder/short `JWT_SECRET`,
default `DATABASE_URL`, `CORS_ORIGIN=*`, and now `OTP_PROVIDER=console`.

## 5. Data model

```
otp_codes:  id, phone, purpose(LOGIN), codeHash, expiresAt,
            consumedAt, attempts, requestIp, createdAt, updatedAt
            idx (phone, purpose, createdAt)

refresh_tokens: id, userId → users.id ON DELETE CASCADE, familyId,
            tokenHash (unique), expiresAt, revokedAt, replacedById,
            userAgent, ip, createdAt
            idx (userId), idx (familyId)
```

Migration: `apps/api/prisma/migrations/20261102000000_auth_foundation/`.
Apply with `pnpm --filter api exec prisma migrate deploy` (verify.ps1 does
this inside the database gate).

## 6. How to add a real SMS provider

1. Implement the `OtpSender` interface
   (`apps/api/src/auth/otp/otp-sender.interface.ts`) — e.g.
   `TwilioOtpSender` reading credentials from new `TWILIO_*` env vars.
2. Add a `case 'twilio'` in `createOtpSender`
   (`auth/otp/otp-sender.factory.ts`) returning the implementation.
3. Extend `OTP_PROVIDER` in `env.schema.ts` if new values are needed.
4. Set `OTP_PROVIDER=twilio` + credentials in the deployment env.
Until step 2 exists, step 4 fails the boot loudly — by design.

## 7. Verification map

| Suite | Command | Sandbox | Windows (verify.ps1) |
| --- | --- | --- | --- |
| Unit (incl. 62 auth tests) | `pnpm test` | ✅ runs | ✅ runs |
| E2E (incl. 22 auth tests, in-memory fake) | `pnpm test:e2e` | ✅ runs | ✅ runs |
| DB integration (7 auth tests, real PostgreSQL) | `pnpm test:db` | honest skips (`RIDEPPY_DB_REQUIRED` unset, no PostgreSQL in sandbox) | ✅ runs with `RIDEPPY_DB_REQUIRED=1`; skipped ≠ passed |
| Live boot + `/health` | `node dist/main.js` + curl | ✅ runs (DB reported down without PostgreSQL — honest) | ✅ runs (`database: "up"`) |

The DB integration suite boots the real `AppModule` with the real
`PrismaService` and exercises: hashed OTP persistence, cooldown, attempt
counting, account creation with profile, rotation + reuse detection against
real rows, cascade deletes and the role-gated profile route.
