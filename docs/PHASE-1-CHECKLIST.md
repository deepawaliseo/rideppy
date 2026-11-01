# Rideppy — Phase 1 Acceptance Checklist

**Phase 1 goal:** production-oriented feature work on top of the Phase 0
foundation. Authentication comes first (WP-1); ride matching and dispatch
follow in later WPs.

**Environment facts (unchanged from Phase 0):** pnpm + Turborepo monorepo,
NestJS 11 + Prisma 6.19.3, native PostgreSQL 18.6 + PostGIS 3.6 on the
Windows dev PC (16 is NOT forced; both work), API on port 3100,
`scripts/verify.ps1` as the single Windows verification gate.

## WP-1 — Authentication foundation

### Repository inspection (done before any edit)
- [x] Inspected Prisma models (`User`/`Customer`/`Driver` already model the
      identity + role + status the auth needs; no duplication — auth builds
      on them), API modules, DTOs, shared contracts and env configuration.
- [x] Reused instead of rebuilt: `UserRole`/`AccountStatus` enums,
      `AllExceptionsFilter` error envelope, global `ValidationPipe`,
      global `ThrottlerGuard`, `PrismaService`, contracts package.
- [x] No pre-existing auth functionality found (Phase 0 deliberately shipped
      none) — nothing removed or renamed; zero breaking changes.

### Authentication implementation
- [x] Phone-number authentication (E.164, validated in DTOs AND contracts).
- [x] `POST /auth/otp/request` + `POST /auth/otp/verify` (202/201).
- [x] Access tokens (HS256 JWT, `typ: 'access'`, default 15 min) and refresh
      tokens (384-bit opaque, SHA-256 stored, 30-day window).
- [x] `POST /auth/refresh` with rotation + family reuse detection;
      `POST /auth/logout` (idempotent, ownership-checked) and
      `POST /auth/logout/all`.
- [x] Customer and driver role-based authorization: global `RolesGuard` +
      `@Roles` decorator; ADMIN excluded from self-service registration.
- [x] Protected API routes: global fail-closed `JwtAuthGuard` with `@Public`
      opt-out (throttle → authenticate → authorize order).
- [x] `GET /auth/me` authenticated profile endpoint.
- [x] Account status validation: SUSPENDED/DEACTIVATED rejected before SMS
      spend and before token issuance; PENDING_VERIFICATION activates on
      first successful OTP verification.
- [x] OTP provider abstraction (`OtpSender` interface + factory); safe
      dev/test `console` provider; declared-but-unimplemented SMS providers
      refuse to boot — no pretend delivery.

### Security requirements
- [x] OTP expiration (300 s default), resend cooldown (60 s), attempt limits
      (5, persisted before comparison), hourly cap (10), outstanding cap (3).
- [x] Rate limiting: stricter per-IP limits on the auth surface
      (`THROTTLE_OTP_REQUEST_LIMIT=5/min` etc.), global throttler untouched.
- [x] Secure OTP hashing: scrypt N=32768/r=8/p=1 with per-code salt,
      constant-time compare; plaintext never stored (proven by tests).
- [x] Refresh-token storage (SHA-256 only), rotation (parent → child, same
      family) and revocation (single, all-devices, family containment).
- [x] Strict DTO validation: whitelist + forbidNonWhitelisted (unknown fields
      rejected), E.164 phone regex, 6-digit code shape, role whitelist.
- [x] Consistent API error envelope on every auth failure path (filter from
      WP-3 reused; verified by e2e).

### Tests and verification
- [x] Contracts: `auth.ts` (+3 spec tests; 12 total in the package).
- [x] Unit tests: crypto util, OtpService (cooldown/caps/attempts/provider
      failure rollback), TokenService (rotation/reuse/revocation),
      AuthService (status rules, role conflicts, first-login fullName),
      both guards, sender factory — 62 new tests, all green.
- [x] E2E: 22 auth tests over real HTTP with the real module stack
      (guards, validation, throttler, envelope) — full e2e suite 30/30.
- [x] DB integration: 7 tests against real PostgreSQL behind the WP-6
      two-mode gate (`RIDEPPY_DB_REQUIRED=1` → explicit failure when the DB
      is unreachable; without it → honest skips, never counted as passes).
- [x] Sandbox-verified: build, typecheck, lint, unit, e2e, boot smoke.
- [ ] Windows-verified: full `scripts/verify.ps1` run on the dev PC
      (PostgreSQL 18.6 + PostGIS 3.6, migration `20261102000000_auth_foundation`
      deployed, integration tests green) — pending the WP-1 patch being applied.

### Docs
- [x] `docs/AUTH.md` — architecture, flows, security model, env vars,
      provider-extension guide, verification map.
- [x] `.env.example` extended with every new variable.
- [x] This checklist.
