# EvacuAI

AI-assisted disaster alerts and indoor evacuation routing for the University of Cebu Lapu-Lapu and Mandaue (UCLM)
capstone project *"EvacuAI: An AI-Driven Disaster Alert and Intelligent Evacuation Routing System"*.

- **Mobile app** (Expo / React Native; Android and web): live alerts, hazard-aware evacuation routes, hazard reports
  with photos, SOS with chat, Check-in Safe, 2D / stacked / 3D campus maps, QR and barometer floor tracking.
- **Responder mode** in the same app for safety officers: SOS inbox and chat, who's missing, path status, alerts.
- **Command Center** (React, at `/command`): the officers' web control room: live map, alerts, hazard reports, paths,
  SOS chat, safety board with drill reports (CSV), 3D drill replay, feedback.
- **Admin panel** (Laravel 13 + Filament, at `/admin`, admins only): users and roles, activity log, class schedules,
  QR stickers.

## Quick start

Needs only [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp docker/.env.example docker/.env
```

```bash
docker compose -f docker/compose.yml up -d --build
```

Then open the app at http://localhost:8081, the Command Center at http://localhost:8000/command and the Admin panel at
http://localhost:8000/admin. Demo accounts (password `evacuai-demo`, test setups only): `student@evacuai.test`,
`safety_officer@evacuai.test`, `admin@evacuai.test`.

## Documentation

- [Setup Guide](docs/SETUP-GUIDE.md) ([HTML version](docs/setup-guide.html), opens offline): run EvacuAI on your own
  computer with Docker, connect a phone, sample data and simulations, troubleshooting.
- [Walkthrough and test scenarios](docs/WALKTHROUGH.md) ([HTML version](docs/walkthrough.html)): every function, role by
  role, with steps, expected results, check boxes and a results table.
- [Project plan](docs/PLAN.md): architecture, design decisions, testing and deployment.

## Repository layout

| Folder | Contents |
|---|---|
| `api/` | Laravel 13 API, Filament admin panel, Reverb (live updates), jobs |
| `command/` | Command Center (Vite + React), built into the Docker image |
| `packages/design` | Signage design tokens shared by the app, the Command Center and the guides |
| `mobile/` | Expo app (Android APK and web build) |
| `packages/routing` | Shared TypeScript routing: campus graph validation, hazard-aware Dijkstra, floor-change detection |
| `packages/campus-view` | Floor shapes, route overlays and step text for the maps |
| `packages/campus-3d` | three.js campus scene used by the app and the Command Center |
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

```bash
npm test -w command
```

Browser tests against a running stack: `npx playwright install chromium`, then `npm run e2e` (set `E2E_CHANNEL=msedge`
to use an installed Edge). The app and admin tests only read data; the Command Center tests create a drill alert and an
SOS from the demo student and toggle one path, then clean up, so run them on your own stack.

Guides: `npm run manual` rebuilds the HTML guides from the Markdown, and `node scripts/capture-screens.mjs` retakes the
walkthrough screenshots from a running stack.
