<#
.SYNOPSIS
    Rideppy Phase 0 — repeatable Windows verification gate (WP-6).

.DESCRIPTION
    One command that runs the ENTIRE verification pipeline on the Windows dev PC:

      0. Preflight        — Node >= 22, pnpm, git, PostgreSQL service state
      1. Install          — pnpm install --frozen-lockfile           (unless -SkipInstall)
      2. Build            — pnpm build (turbo: contracts -> tsconfig -> api)
      3. Typecheck        — pnpm typecheck
      4. Lint             — pnpm lint
      5. Unit tests       — pnpm test
      6. E2E tests        — pnpm test:e2e
      7. Repo hygiene     — node scripts/check-repo-hygiene.mjs (artifacts + secret scan)
      8. DATABASE GATE    — prisma migrate deploy + migrate status ("up to date")
                            + seed twice (idempotency) + integration tests with
                            RIDEPPY_DB_REQUIRED=1 + live API boot smoke
                            (unless -SkipDb)

    DATABASE VERIFICATION SEMANTICS (WP-6 rule):
      * Without -SkipDb the script sets RIDEPPY_DB_REQUIRED=1. If PostgreSQL is
        unreachable the integration suite FAILS EXPLICITLY — skipped tests are
        NEVER counted as database verification.
      * With -SkipDb the run is reported as "DATABASE VERIFICATION NOT
        PERFORMED" and can never be quoted as a database verification.

.PARAMETER SkipInstall
    Skip `pnpm install` (deps already installed and lockfile unchanged).

.PARAMETER SkipDb
    Skip every database-dependent step. The summary then explicitly states
    that NO database verification was performed.

.PARAMETER BaseUrl
    Base URL the API is expected to listen on (default http://127.0.0.1:3100).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\verify.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipInstall

.NOTES
    Works on Windows PowerShell 5.1 and PowerShell 7+. No admin rights needed.
    Prisma reads apps/api/.env (see docs/DATABASE-SETUP.md).
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipDb,
    [string]$BaseUrl = 'http://127.0.0.1:3100'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$script:DbVerified = $false
$script:Steps = New-Object System.Collections.Generic.List[string]

function Write-Banner([string]$Text) {
    Write-Host ''
    Write-Host ('=' * 72) -ForegroundColor DarkGray
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('=' * 72) -ForegroundColor DarkGray
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Banner $Name
    try {
        & $Body
        $script:Steps.Add("PASS  $Name") | Out-Null
        Write-Host "  -> PASS: $Name" -ForegroundColor Green
        return $true
    }
    catch {
        $script:Steps.Add("FAIL  $Name  ($($_.Exception.Message))") | Out-Null
        Write-Host "  -> FAIL: $Name — $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ---------------------------------------------------------------------------
Write-Banner 'Rideppy Phase 0 verification (WP-6)'
Write-Host "repo:    $RepoRoot"
Write-Host "mode:    $(if ($SkipDb) { 'DATABASE VERIFICATION SKIPPED (-SkipDb)' } else { 'full — database verification REQUIRED' })"
Write-Host "base:    $BaseUrl"
$started = Get-Date

# --- 0) Preflight -----------------------------------------------------------
$preflightOk = Invoke-Step '0. Preflight (node >= 22, pnpm, git, PostgreSQL service)' {
    $nodeVersion = (& node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    Write-Host "  node $($nodeVersion)"
    if ($nodeMajor -lt 22) { throw "Node.js >= 22 required, found $($nodeVersion)" }

    $pnpmVersion = (& pnpm --version)
    Write-Host "  pnpm  $($pnpmVersion)"
    if (-not $pnpmVersion) { throw 'pnpm not found — run: corepack enable' }

    $gitVersion = (& git --version)
    Write-Host "  git   $($gitVersion)"

    $pgService = Get-Service | Where-Object { $_.Name -like 'postgresql*' }
    if ($pgService) {
        foreach ($svc in $pgService) {
            Write-Host "  service $($svc.Name): $($svc.Status)"
        }
        $running = $pgService | Where-Object { $_.Status -eq 'Running' }
        if (-not $running -and -not $SkipDb) {
            Write-Warning '  PostgreSQL service is NOT running — the database gate below will fail explicitly (by design). Start it: net start postgresql-x64-18'
        }
    }
    else {
        Write-Warning '  No postgresql* Windows service found. If the database gate fails with P1001, install PostgreSQL (docs/DATABASE-SETUP.md).'
    }
}
if (-not $preflightOk) { throw 'Preflight failed — fix the environment first.' }

# --- 1) Install -------------------------------------------------------------
if ($SkipInstall) {
    $script:Steps.Add('SKIP  1. Install (-SkipInstall)') | Out-Null
    Write-Banner '1. Install — SKIPPED (-SkipInstall)'
}
else {
    Invoke-Step '1. Install (pnpm install --frozen-lockfile)' {
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "pnpm install exited $LASTEXITCODE" }
    } | Out-Null
}

# --- 2..4) Build / typecheck / lint ------------------------------------------
Invoke-Step '2. Build (pnpm build)' {
    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build exited $LASTEXITCODE" }
} | Out-Null

Invoke-Step '3. Typecheck (pnpm typecheck)' {
    & pnpm typecheck
    if ($LASTEXITCODE -ne 0) { throw "pnpm typecheck exited $LASTEXITCODE" }
} | Out-Null

Invoke-Step '4. Lint (pnpm lint)' {
    & pnpm lint
    if ($LASTEXITCODE -ne 0) { throw "pnpm lint exited $LASTEXITCODE" }
} | Out-Null

# --- 5) Unit tests ------------------------------------------------------------
Invoke-Step '5. Unit tests (pnpm test)' {
    & pnpm test
    if ($LASTEXITCODE -ne 0) { throw "pnpm test exited $LASTEXITCODE" }
} | Out-Null

# --- 6) E2E tests ---------------------------------------------------------------
Invoke-Step '6. E2E tests (pnpm test:e2e)' {
    & pnpm test:e2e
    if ($LASTEXITCODE -ne 0) { throw "pnpm test:e2e exited $LASTEXITCODE" }
} | Out-Null

# --- 7) Repository hygiene -------------------------------------------------------
Invoke-Step '7. Repository hygiene + secret scan (scripts/check-repo-hygiene.mjs)' {
    & node (Join-Path $RepoRoot 'scripts\check-repo-hygiene.mjs')
    if ($LASTEXITCODE -ne 0) { throw "hygiene check exited $LASTEXITCODE" }
} | Out-Null

# --- 8) DATABASE GATE -------------------------------------------------------------
if ($SkipDb) {
    Write-Banner '8. DATABASE GATE — NOT RUN (-SkipDb)'
    $script:Steps.Add('SKIP  8. Database gate (-SkipDb)') | Out-Null
}
else {
    Invoke-Step '8. DATABASE VERIFICATION (migrations, seed idempotency, integration, live smoke)' {
        $env:RIDEPPY_DB_REQUIRED = '1'

        try {
            Write-Host '  8a) prisma migrate deploy' -ForegroundColor DarkCyan
            & pnpm --filter api exec prisma migrate deploy
            if ($LASTEXITCODE -ne 0) { throw "migrate deploy exited $LASTEXITCODE (is PostgreSQL running? see docs/DATABASE-SETUP.md)" }

            Write-Host '  8b) prisma migrate status (must be up to date)' -ForegroundColor DarkCyan
            $migOut = & pnpm --filter api exec prisma migrate status | Out-String
            if ($LASTEXITCODE -ne 0) { throw "migrate status exited $LASTEXITCODE" }
            if ($migOut -notmatch 'up to date') {
                throw "migrate status did not report 'up to date':`n$migOut"
            }
            Write-Host '  migrate status: up to date' -ForegroundColor DarkCyan

            Write-Host '  8c) seed run #1' -ForegroundColor DarkCyan
            & pnpm --filter api exec prisma db seed
            if ($LASTEXITCODE -ne 0) { throw "seed run #1 exited $LASTEXITCODE" }

            Write-Host '  8d) seed run #2 (idempotency)' -ForegroundColor DarkCyan
            & pnpm --filter api exec prisma db seed
            if ($LASTEXITCODE -ne 0) { throw 'seed run #2 exited non-zero — seed is NOT idempotent' }

            Write-Host '  8e) database integration tests (RIDEPPY_DB_REQUIRED=1, skips impossible)' -ForegroundColor DarkCyan
            $dbTestOut = & pnpm --filter api test:db | Out-String
            if ($LASTEXITCODE -ne 0) { throw "test:db exited $LASTEXITCODE — database verification FAILED" }
            $summary = ($dbTestOut -split "`n" | Select-String -Pattern '^\s*Tests:').Line
            if ($summary) { Write-Host "  $($summary.Trim())" -ForegroundColor DarkCyan }
            if ($dbTestOut -match '(?m)^\s*Tests:.*\b([1-9]\d*)\s+skipped') {
                throw "test:db reported $($Matches[1]) skipped test(s) — skips can never count as database verification"
            }

            Write-Host '  8f) boot API and run the live HTTP gate (smoke.mjs)' -ForegroundColor DarkCyan
            $port = ([Uri]$BaseUrl).Port
            if ($port -le 0) { $port = 80 }
            $env:PORT = [string]$port
            $apiLog = Join-Path $RepoRoot 'verify-api.log'
            $apiErr = Join-Path $RepoRoot 'verify-api.err.log'
            $proc = Start-Process -FilePath 'node' `
                -ArgumentList 'dist/main.js' `
                -WorkingDirectory (Join-Path $RepoRoot 'apps\api') `
                -PassThru -NoNewWindow `
                -RedirectStandardOutput $apiLog -RedirectStandardError $apiErr
            try {
                $healthy = $false
                $lastBody = ''
                foreach ($i in 1..60) {
                    if ($proc.HasExited) {
                        throw "API process exited during boot (code $($proc.ExitCode)). See $apiErr"
                    }
                    Start-Sleep -Milliseconds 500
                    try {
                        $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 2
                        $lastBody = $resp.Content
                        if ($resp.StatusCode -eq 200 -and $lastBody -match '"database":"up"') {
                            $healthy = $true
                            break
                        }
                    }
                    catch { }
                }
                if (-not $healthy) {
                    throw "/health never returned 200 with database up (last body: $lastBody). See $apiErr"
                }
                Write-Host "  /health 200 database up (after $([math]::Round($i * 0.5, 1))s)" -ForegroundColor DarkCyan

                & node (Join-Path $RepoRoot 'scripts\smoke.mjs') --base-url $BaseUrl
                if ($LASTEXITCODE -ne 0) { throw 'smoke.mjs failed' }
            }
            finally {
                if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
                Remove-Item Env:PORT -ErrorAction SilentlyContinue
            }

            $script:DbVerified = $true
        }
        finally {
            Remove-Item Env:RIDEPPY_DB_REQUIRED -ErrorAction SilentlyContinue
        }
    } | Out-Null
}

# ---------------------------------------------------------------------------
Write-Banner 'VERIFICATION SUMMARY'
foreach ($line in $script:Steps) {
    if ($line.StartsWith('PASS')) { Write-Host "  $line" -ForegroundColor Green }
    elseif ($line.StartsWith('SKIP')) { Write-Host "  $line" -ForegroundColor Yellow }
    else { Write-Host "  $line" -ForegroundColor Red }
}

Write-Host ''
if ($script:DbVerified) {
    Write-Host '  DATABASE VERIFICATION: PERFORMED (real PostgreSQL answered: migrations up to date, seed idempotent, integration tests passed, /health database=up).' -ForegroundColor Green
}
else {
    Write-Host '  DATABASE VERIFICATION: NOT PERFORMED. This run is NOT a database verification.' -ForegroundColor Yellow
    Write-Host '  Run without -SkipDb (with PostgreSQL running) to verify the database.' -ForegroundColor Yellow
}

$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
Write-Host ''
Write-Host "Elapsed: ${elapsed}s"

$failed = @($script:Steps | Where-Object { $_.StartsWith('FAIL') })
if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host "VERIFICATION FAILED — $($failed.Count) step(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host ''
Write-Host 'VERIFICATION PASSED.' -ForegroundColor Green
exit 0
