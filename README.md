# Bike Taxi Platform — Phase 0 Starter

This is a **foundation starter**, not a complete or production-ready application. The four app folders are created by the official scaffolding commands in `SETUP-WINDOWS.md`. No code has been run on your PC.

## Confirmed stack

- Separate Customer and Driver: Expo + React Native + TypeScript
- API: NestJS + TypeScript
- Admin: Next.js + TypeScript
- PostgreSQL + PostGIS, Redis, Socket.IO (future API integration)
- MapLibre (added during maps phase), payment gateway and SMS provider (later phases)
- Docker Compose for local infrastructure; Kubernetes deferred

## Fee model

First 30 days ₹0; thereafter ₹2/km capped at ₹10 per eligible completed ride, charged to driver earnings, subject to final rules and legal review.

## Start

1. Read `SETUP-WINDOWS.md`.
2. Copy `.env.example` to `.env` and replace placeholder password in both values.
3. Run `docker compose up -d`.
4. Generate apps with the documented commands and then install workspace dependencies.
5. Follow `docs/PHASE-0-CHECKLIST.md`.
