# Windows PowerShell setup — Phase 0

## 1. Install prerequisites

Install Windows Subsystem for Linux 2, Docker Desktop with WSL2 integration, supported Node.js LTS, Git, Android Studio and VS Code. Restart if prompted. Ensure Android SDK and emulator are installed.

Check in PowerShell:

```powershell
wsl --status
docker version
docker compose version
node --version
npm --version
git --version
```

## 2. Extract this starter into your desired project directory

Example: `C:\Projects\bike-taxi-platform`. Open PowerShell inside that folder.

```powershell
corepack enable
corepack pnpm --version
Copy-Item .env.example .env
notepad .env
# Replace BOTH password placeholders with the same strong local password.
docker compose up -d
docker compose ps
```

If Corepack is unavailable with your Node installation, install Corepack according to current Node.js/pnpm guidance. Never use the placeholder database password in a networked deployment.

## 3. Generate the four applications

These official scaffold commands should be run **from the repository root**. Select TypeScript defaults. If the tool reports a non-empty directory, stop and inspect before retrying.

```powershell
npx create-expo-app@latest apps/customer --template default
npx create-expo-app@latest apps/driver --template default
npx @nestjs/cli@latest new apps/api --package-manager pnpm --skip-git
npx create-next-app@latest apps/admin --ts --eslint --tailwind --app --use-pnpm
```

CLI flags/templates can change: verify the current prompts before proceeding. If generators create nested Git repositories or standalone lockfiles, remove those **only after reviewing them** and keep a single root lockfile. Ensure app package names are unique.

```powershell
pnpm install
```

## 4. Start apps

```powershell
pnpm --dir apps/api start:dev
pnpm --dir apps/admin dev
pnpm --dir apps/customer start
pnpm --dir apps/driver start
```

Use four terminals. The mobile app's local API host differs for Android emulator (`10.0.2.2`), physical phones (LAN IP) and iOS; configure later with public Expo environment variables (never secrets). Expo Go is only for early screens; MapLibre/background GPS require custom development builds.

## 5. Backend health endpoint (implement after NestJS generation)

Create `apps/api/src/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  check() { return { status: 'ok', service: 'bike-taxi-api' }; }
}
```

Add `HealthController` to `controllers` in the generated `AppModule`, and configure port 4000 in `main.ts` if desired. Then verify `http://localhost:4000/health` returns HTTP 200.

## 6. Verify before Phase 1

See `docs/PHASE-0-CHECKLIST.md`. Do not enable real rides, real OTP, or payments in Phase 0.
