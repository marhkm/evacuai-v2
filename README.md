# EvacuAI

AI-assisted disaster alerts and indoor evacuation routing for the University of Cebu Lapu-Lapu and Mandaue (UCLM)
capstone project *"EvacuAI: An AI-Driven Disaster Alert and Intelligent Evacuation Routing System"*.

- **Mobile app** (Expo / React Native; Android and web): live alerts, hazard-aware evacuation routes, hazard reports
  with photos, SOS with chat, Check-in Safe, 2D / stacked / 3D campus maps, QR and barometer floor tracking.
- **Admin dashboard** (Laravel 13 + Filament): broadcast alerts, verify reports, block paths, SOS desk, Safety
  Monitor, live Campus 3D with drill replay, drill reports (CSV), users and class schedules.

## Quick start

Needs only [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp docker/.env.example docker/.env
```

```bash
docker compose -f docker/compose.yml up -d --build
```

Then open the app at http://localhost:8081 and the dashboard at http://localhost:8000/admin. Demo accounts (password
`evacuai-demo`, test setups only): `student@evacuai.test`, `safety_officer@evacuai.test`, `admin@evacuai.test`.

## Documentation

- [User manual](docs/USER-MANUAL.md) ([HTML version](docs/user-manual.html), open it in a browser): running it, every app and
  dashboard function, a full drill walkthrough, sample data and simulations.
- [Testing guide for students](docs/TESTING.md): test scenarios and automated browser tests.
- [Project plan](docs/PLAN.md): architecture, design decisions, testing and deployment.

## Repository layout

| Folder | Contents |
|---|---|
| `api/` | Laravel 13 API, Filament admin dashboard, Reverb (live updates), jobs |
| `mobile/` | Expo app (Android APK and web build) |
| `packages/routing` | Shared TypeScript routing: campus graph validation, hazard-aware Dijkstra, floor-change detection |
| `packages/campus-view` | Floor shapes, route overlays and step text for the maps |
| `packages/campus-3d` | three.js campus scene used by the app and the dashboard |
| `campus-data/` | Campus buildings, rooms and evacuation graph (source of the database seed) |
| `docker/` | Dockerfiles and the Compose stack used for local testing and deployment |
| `e2e/` | Playwright browser smoke tests |

## Development checks

```bash
npm ci && npm test && npm run typecheck && npm run validate
```

```bash
cd api && composer install && vendor/bin/pest
```

```bash
npm test -w @evacuai/mobile
```

Browser smoke tests against a running stack: `npx playwright install chromium`, then `npm run e2e`.
