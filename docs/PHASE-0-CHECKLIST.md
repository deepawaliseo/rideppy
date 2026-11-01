# Phase 0 — Foundation acceptance checklist

- [ ] Windows + WSL2 + Docker Desktop installed and operational
- [ ] Node.js supported LTS, Git, pnpm, Android Studio installed
- [ ] Repository initialized and pnpm workspace install passes
- [ ] `docker compose up -d` succeeds; PostGIS and Redis healthy
- [ ] `apps/api` generated with NestJS; `/health` returns HTTP 200
- [ ] `apps/admin` generated with Next.js; opens in browser
- [ ] `apps/customer` Expo app runs on Android device/emulator
- [ ] `apps/driver` Expo app runs on Android device/emulator
- [ ] Shared TypeScript contracts imported successfully
- [ ] Lint, typecheck and smoke tests pass
- [ ] CI pipeline configured and first successful run recorded
- [ ] No secrets committed; no real booking or payment enabled

**Phase 0 is NOT complete until all checks are evidenced.**
