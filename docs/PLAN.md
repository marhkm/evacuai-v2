# EvacuAI — Development, Implementation, Testing & Deployment Plan

## Context

The capstone manuscript *"EvacuAI: An AI-Driven Disaster Alert and Intelligent Evacuation Routing System"* (UCLM, approved July 2026) specifies:
- A mobile app and an admin web dashboard for campus disaster alerts.
- Hazard reporting.
- AI-assisted indoor evacuation routing.
- SOS with chat.
- Check-in Safe.
- Evacuation analytics.

It covers 4 buildings (OLD, Annex 1, Annex 2, Basic Ed) and 3 hazards (earthquake, fire, flood).

The project directory `D:\Coding\Projects\evacu-ai` is empty. We start from scratch.

The manuscript contradicts itself on the stack: Django vs Flask vs FastAPI, SQLite vs PostgreSQL vs Firebase, and scikit-learn vs Prophet vs Gemini. Decisions made with the user:

- **Backend + admin web:** **Laravel 13** (PHP 8.3+), with **Filament** for the admin dashboard and **PostgreSQL** for the database.
- **Mobile:** **Expo (React Native)**, Android first. iOS stays one EAS build away.
- **Hosting:** a single **VPS (~$5–12/mo) or a UCLM server**. Both run the **same Docker Compose stack** that students use locally.
- **Pace:** we build it together (user + Claude), with no sprint calendar. The goal is a testable build as fast as possible, without dropping any function from the manuscript.
- **Testers (students):** need only **Docker Desktop**. One `docker compose up` gives them the full, seeded system.
- **Login:** traditional email + password (with email verification and password reset), plus **Google** sign-in. **Microsoft** sign-in is optional, if UCLM uses Microsoft 365.

> Note for the manuscript: Table 19 lists FastAPI + Firebase. Clear the switch to Laravel 13 + PostgreSQL with the adviser. The Network section already mentions PHP, and Chapter III already argues for PostgreSQL.

**Existing student prototype:** [Lexageda/evacuai](https://github.com/Lexageda/evacuai) is a Flask + SQLite web app: a single `app.py` plus 9 templates, Basic Ed building only. Decision: **a complete rebuild on the new stack.** The students' repo stays untouched; we only copy assets and ideas from it (§0).

---

## 0. Reuse from the student prototype (read-only)

The rebuild's defaults already avoid the prototype's security mistakes:
- Secrets come from `.env`, never from the code.
- `APP_DEBUG=false` in production.
- Passwords are hashed with bcrypt/argon.
- Login is throttled, and the error message never reveals whether an account exists.
- Blade/React escape output by default, and no inline `onclick` strings are built from data.
- Every endpoint is authorized by a Policy.
- No DB, `vendor/` or `node_modules/` is committed.

**Port into the rebuild:**

| From prototype | To | Slice |
|---|---|---|
| `static/svg/floors/*.svg`, room IDs (`Room_BE101`, `Stairs_Left_G`, `Exit_North`, …), IMPORT_GUIDE dimensions | `campus-data/` nodes and edges for Basic Ed. Use the same ID scheme for the other 3 buildings | 3 |
| **Schedule-based location** (`schedules` table, Excel upload, `day_matches`, room→floor) | `schedules` table + Filament Excel import (native ImportAction). The app pre-fills the routing origin from the student's current class, then QR or picker confirms it | 5 |
| **Drill mode** (`drill_sessions`, drill banner, start/end broadcast) | `alerts.is_drill` flag + drill start/end actions in Filament. Drill metrics come per incident, which fixes the prototype's shared `safe_count` bug | 4 / 7 |
| SOS lifecycle (sent → responded → resolved, cancel before response) | `sos_alerts.status` state machine + SOS chat | 6 |
| Audit log (`audit()` helper) | `users_activity_logs` written by a model observer / middleware | 2 onward |
| **Semaphore SMS** broadcast | A Laravel Notification channel (queued, chunked, delivery logged in `alert_notifications`). Off unless `SEMAPHORE_API_KEY` is set | 4 |
| PH mobile validation `^(\+639\d{9}|09\d{9})$` | A Laravel validation rule on profile phone | 2 |
| Student CSV bulk add | Filament ImportAction. Use invite emails or forced reset, **not** the predictable `uc@<digits>` passwords | 2 |
| Crowd count per floor | Live congestion from route counts and check-ins | 5 |

**Do not port:**
- Keyword-based blocking (`BLOCKED_KEYWORDS`, where one report containing "fire" blocks a room).
- The all-time 3-report count with no time window.
- Global shared `is_read` flags.
- 3–5 s polling.
- The text-only "AVOID: X" instructions. Real graph routing replaces them.

---

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| API + admin | **Laravel 13** (PHP 8.3+) | Mature, readable MVC. Good for teaching |
| Admin dashboard | **Filament** (latest release supporting Laravel 13) | Generates the CRUD tables, forms, actions, charts and CSV export. Lives inside the same Laravel app |
| Database | **PostgreSQL** (current stable) | Matches the relational data dictionary |
| Auth (mobile API) | **Laravel Sanctum** (personal access tokens) | Simple bearer tokens for the Expo app |
| Auth flows | **Laravel Fortify** (headless): register, email verification, login, forgot/reset password | Built-in, tested flows. No custom auth code |
| Social login | **Laravel Socialite**: Google (+ Microsoft via the Socialite Providers package) | One user record per email; Google and password both work for it |
| Realtime | **Laravel Reverb** with its **database driver** (no Redis) + **laravel-echo/pusher-js** in Expo | Live alerts, path status, SOS chat, check-ins |
| Jobs / scheduling | Laravel **queues (database driver)** + **Scheduler** | Push fan-out, feed polling, retention purge. No Redis needed |
| Authorization | Role column (PHP enum) + **Policies/Gates** + **`throttle` rate limits** | Native Laravel. No permission package needed |
| Push | **Expo Push Service** called from a queued job using Laravel's `Http` client (batches of 100) | Reaches Android apps that are backgrounded or closed |
| Mobile app | **Expo (latest stable SDK), TypeScript, Expo Router, NativeWind, TanStack Query** (persisted cache) | One codebase for Android, iOS and web, with an offline cache |
| Routing "AI" | **Shared TypeScript package**: weighted Dijkstra/A* + hazard rules, running **on-device** | Routing works offline. No PHP duplicate |
| Floor plans | **react-native-svg**: the node graph drawn over floor-plan SVGs | GPS does not work indoors |
| Indoor location | **QR codes** at rooms, stairwells and assembly points (`expo-camera`) + a manual building/floor/room picker. `expo-location` only pre-selects a building | Cheap, accurate positioning. The picker covers the web build |
| Mobile Google login | `expo-auth-session` gets a Google token → `POST /api/auth/google` → Socialite `userFromToken()` → Sanctum token | Works in the APK and the web build |
| Web server | **FrankenPHP** (official image, built-in Caddy) | One container serves the app, with **automatic HTTPS** in production |
| External feeds | **USGS Earthquake GeoJSON**, **PHIVOLCS** bulletins, **Open-Meteo** rainfall, **PAGASA** bulletins (scrape, fragile), polled by the Scheduler | Create **draft** alerts for admin approval only |
| LLM (optional) | **Laravel AI SDK (`laravel/ai`, first-party)**. Primary: **Gemini Flash free tier** (named in the manuscript). Fallback: **Groq free tier**. Optional local: **Ollama** container (compose profile `ai-local`). Provider and failover are set by `.env` | Summarizes report clusters and translates free-text alerts. Admin-approved. Off when no key is set. Fixed alert templates are pre-translated, so emergencies never wait on an LLM |
| Local email | **Mailpit** container | Verification and reset emails work offline at `localhost:8025` |
| Monitoring | **Laravel Pulse** (server metrics), **Sentry** (Laravel + Expo crashes), **UptimeRobot** (uptime) | Production only |
| CI/CD | **GitHub Actions**: tests, image build → **GHCR**, SSH deploy; **EAS Build/Update** for mobile | |

**Dropped, with reasons:**
- Prophet and a scikit-learn decision tree: no historical or labeled data exists. Rules carry the same logic.
- SQLite, Django, Flask, FastAPI, Firebase, a separate GIS server, a separate notification server, and Redis: Laravel's built-in pieces cover all of these.
- NDRRMC SMS mirroring: apps cannot read cell broadcasts, and Play Store policy blocks `READ_SMS`. Admins re-post official warnings manually instead, using an "Official advisory" alert type.
- SMS: kept as an **optional** Semaphore notification channel, ported from the prototype. It costs money per message, so it is off by default.

### Repo layout (target)

```
evacu-ai/
  api/                    Laravel 13 app: REST API, Filament admin, Reverb, jobs, seeders
  mobile/                 Expo app (Android APK + web build)
  packages/routing/       pure TS: graph, weights, dijkstra, hazard rules, validate script + tests
  campus-data/            nodes.json, edges.json, floor-plan SVGs (single source for seeder + CI validation)
  docker/
    Dockerfile            one PHP image (FrankenPHP) used by app/queue/scheduler/reverb
    Dockerfile.mobile-web nginx serving Expo web export
    compose.yml           full stack (students + production)
    compose.dev.yml       override: mount source for developers
    .env.example
  .github/workflows/      ci.yml, images.yml, deploy.yml, eas.yml
  docs/                   PLAN.md, TESTING.md (student guide), RUNBOOK.md
```

pnpm workspace = `mobile` + `packages/routing`. The Laravel app is managed by Composer in `api/`.

---

## 2. Design fixes to the manuscript (applied as we build)

**Security (must fix):**
1. **Self-registration as admin** (Registration screen, "choose user or admin"): remove it.
   - Every account starts as `student`, `faculty` or `staff`.
   - Only an admin can promote an account to `safety_officer` or `admin` in Filament.
   - Filament `canAccessPanel()` allows only `admin` and `safety_officer`.
   - The first admin comes from the seeder.
2. **Email-domain allowlist** (`ALLOWED_EMAIL_DOMAINS`), enforced in both the register validation and the Socialite callback. Empty locally means allow all; in production, UCLM domains only.
3. **3-report auto-broadcast override**, hardened:
   - Only distinct, email-verified, active accounts count.
   - The reports must share the same hazard type and building/floor within 10 minutes.
   - Reports are rate-limited.
   - The auto-alert is labeled **"Unverified — reported by N users"** and pages admins.
   - Admins can confirm or retract it in one click.
4. **Rate limits** via `RateLimiter`, e.g. reports and SOS at most 5 per minute per user, and login and OTP attempts throttled.
5. **OAuth hygiene:**
   - Verify the Google token server-side (Socialite).
   - Allowlist redirect URIs.
   - Request only the `email` and `profile` scopes.
   - Link accounts by email only when Google reports the email as verified.

**Correctness:**
6. Replace the 5-second Live Alerts polling with Reverb events, plus push notifications for background delivery.
7. Alerts reach every registered device, not only "logged-in users".
8. **Incidents scope:** add an `alert_id` FK to `evacuation_logs` and `evacuation_routes`, so check-ins and safety status belong to one emergency.
9. Safety status uses `safe`, `needs_help`, `unknown` instead of the `safe`/`missing` enum. `unknown` means no check-in for the active alert.
10. Add:
    - `floors.floor_plan_url`.
    - A `sos_messages` table for the SOS chat.
    - `evac_edges.is_bidirectional` and `edge_type` (`corridor`, `stairs`, `ramp`, `door`, `outdoor`).
    - A `device_tokens` table for Expo push tokens.
    - `schedules` (ported from the prototype) and an `alerts.is_drill` flag (drill mode, ported from the prototype).
11. `buildings.building_name` becomes `string`, not an ENUM.
12. Hazard-specific destinations, stored as `evac_nodes.safe_for`:
    - Earthquake → open-space assembly points.
    - Fire → fire exits, avoiding smoke-flagged corridors.
    - Flood → upper floors or high ground.
13. `users` follows Laravel conventions: hashed `password` (bcrypt/argon), `email_verified_at`, `role` enum, `first_name`/`last_name`, department, phone, `is_active`. Social identities live in a small `social_accounts` table (provider, provider_id, user_id).

**Manuscript text to correct:**
- Respondents: the text says 500, but Table 2 totals 50.
- The `evac_edge` description is a copy of the `evac_nodes` description.
- The Network section says SQLite.
- "Startup Idea" and "Business Roadmap" become the institutional deployment roadmap only.

**Privacy (RA 10173, Data Privacy Act of 2012):**
- A consent screen at first login (password or Google).
- Location is collected only during route requests, SOS and check-in.
- A scheduled purge clears IP and location fields after a retention period.
- Admins see only the data they need.
- Consult the UCLM DPO before any real-user pilot.
- Self-hosting on a UCLM server keeps the data on campus.

---

## 3. Core algorithms (the "AI" layer, explicit and testable)

**Routing** (`packages/routing`, runs in the app):
- The graph comes from the `/api/campus-snapshot` JSON (nodes, edges, current statuses, rule weights), cached on the device.
- Edge cost = `distance_m × status × hazard × congestion`:
  - Status: `blocked` = ∞, `congested` = 2–3.
  - Hazard rules, e.g. fire + smoke-flagged edge = ∞, elevator = ∞, earthquake + glass corridor = 3.
  - Congestion comes from live route counts per edge versus capacity.
- The destination is the cheapest reachable node whose `safe_for` includes the active hazard. Full assembly points get a penalty.
- The app re-routes on the Reverb event `EdgeStatusChanged` whenever the changed edge is on the current path.
- Each computed route is POSTed to the server for congestion counts and analytics.
- Weights live in `system_configurations`, editable in Filament.

**Campus data validation:** `campus-data/*.json` is the single source. The Laravel seeder imports it, and CI runs `pnpm --filter routing validate`. That check fails when any node cannot reach a safe node for any hazard, or when an edge points to a missing node.

**Report verification:**
- A query scope or SQL view groups pending reports by `(hazard_type, building, floor, 10-min bucket)` and counts distinct reporters.
- The Filament "Broadcast" action is enabled at 3 or more, with a confirm-anyway path.
- The auto-unverified rule runs in a model observer that uses the same query.

**External feeds:** a Scheduler job runs every 5 minutes. It creates **draft** alerts when either holds:
- USGS shows an earthquake of magnitude 4.5 or more within 100 km of UCLM.
- Rainfall goes above a threshold.

Drafts are never auto-broadcast. In local Docker, `FEEDS_FAKE=true` reads fixture files.

**LLM assist (optional):** summarizes clusters and translates approved free-text alerts. An admin approves every output.

Rules:
- **Templates first:** standard alert templates (hazard × building × floor) are translated into Cebuano and Filipino once, at setup, and stored in the DB. Emergencies use the stored text.
- **No PII to free tiers:** send only the hazard text and node or building names, never names, emails, phones or IDs. Free tiers (e.g. Gemini) may use the content to improve their products.
- **Resilience:** requests are queued, with failover Gemini → Groq → English-only. The LLM is never on the alert or routing critical path.
- **Real-user pilot:** switch `.env` to a paid tier (does not train on data, cents per month at this volume) or to Ollama on the UCLM server. xAI Grok is not used: it has no permanent free tier, and its credit program requires data sharing.

---

## 4. Build order (we build together; each step ends testable in Docker)

Vertical slices in dependency order, with no dates. A slice merges only when its tests are green and `docker compose up` runs it. Tests ship with each slice.

| # | Slice | Done when |
|---|---|---|
| 1 | **Foundation**: Laravel 13 + Filament install, migrations from the data dictionary (+ §2 fixes), Expo skeleton, routing package skeleton, Dockerfile + compose (app, queue, scheduler, reverb, postgres, mailpit, mobile-web), CI (Pest, Larastan, Pint, Vitest, ESLint/tsc) | `docker compose up` gives the Filament login at `localhost:8000/admin` and the app at `localhost:8081`, connected to a seeded DB |
| 2 | **Auth**: Fortify register / verify email (Mailpit) / login / forgot + reset password, Sanctum tokens for the mobile app, Google sign-in (Socialite) on mobile and admin, domain allowlist, consent, profile edit, change password, delete account, Filament user management + role promotion | Both login methods work on web and APK. Pest proves a student cannot self-promote or reach `/admin` |
| 3 | **Campus data**: Basic Ed starts from the prototype's floor SVGs and room IDs (copied, not linked). Then the real graph for the other 3 buildings in `campus-data/`, plus floor-plan SVGs, `safe_for`, QR ids, an artisan command that prints a QR sticker PDF | Every floor renders. CI validation passes |
| 4 | **Alerts + hazard reports**: report form (+ optional photo), Filament report clusters, hardened 3-report rule, Filament compose/broadcast action, `AlertBroadcast` Reverb event + Expo push job, Live Alerts + history in the app | An admin broadcast reaches all clients in seconds, and the APK as a push |
| 5 | **Routing**: routing package + property tests, QR/manual origin, hazard-aware route on the floor plan, live re-route, Filament Stairs/Path status toggles, offline snapshot cache | A path toggle re-routes live. Airplane mode still routes from the cache |
| 6 | **SOS + Check-in Safe**: SOS with location node, two-way chat (Reverb private channel), acknowledge/resolve in Filament; QR check-in at assembly points; occupancy; Filament Safety Monitor page (Safe / Needs help / Unknown highlighted) | The full emergency flow works on 2 devices + admin |
| 7 | **Reports & analytics**: Filament dashboard widgets (registered, safe, pending reports, evacuation time, check-in rate, congested edges, SOS response time), Filament CSV export of logs, feedback submit/view, activity log | Admin exports a drill report |
| 8 | **Extras** (each off by default, switched on by env): external feed drafts, LLM assist, Microsoft sign-in | |

**The first student test build comes after slice 4.** Later slices arrive with `docker compose pull`.

The real campus graph (slice 3) needs floor plans and a walk-through of the 4 buildings. Get them early from UCLM facilities or the Civil Security Unit. A small demo building ships in the seed until the real data lands.

---

## 5. Local test environment for students (Docker only)

**Tester requirements:** Docker Desktop (WSL2 on Windows), 8 GB RAM recommended, and a browser. An Android phone is optional.

**Steps:**
1. Download the release zip, which contains `compose.yml` and `.env.example`.
2. Copy `.env.example` to `.env`.
3. Run `docker compose up`.

The first start runs migrations and the demo seed automatically.

| Service | Image | URL |
|---|---|---|
| `app` (FrankenPHP: API + Filament admin) | `ghcr.io/<owner>/evacuai-api` | `localhost:8000` (admin at `/admin`) |
| `reverb` (WebSockets) | same image, `php artisan reverb:start` | `localhost:8080` |
| `queue` | same image, `php artisan queue:work` | — |
| `scheduler` | same image, `php artisan schedule:work` | — |
| `postgres` | official `postgres` | — |
| `mailpit` | official `axllent/mailpit` | `localhost:8025` |
| `mobile-web` (nginx, Expo web export) | `ghcr.io/<owner>/evacuai-mobile-web` | `localhost:8081` (use the browser's phone-size view) |
| `ollama` (optional, `--profile ai-local`) | official `ollama/ollama` | — (needs ~4+ GB extra RAM) |

AI features are off unless `GEMINI_API_KEY` or `GROQ_API_KEY` is set in `.env`, or the `ai-local` profile is used. Students can each get a free Gemini key from Google AI Studio.

**Demo data:**
- Demo accounts for each role. Their emails and passwords are defined in the Laravel demo seeder and listed in `docs/TESTING.md`.
- A demo building.
- A sample active incident, so every screen has data.
- `docker compose down -v` resets everything.

**Real Android phone (optional):**
- Install the **preview APK** from GitHub Releases.
- Non-production builds show a **"Server URL"** field on the login screen. Enter `http://<PC-LAN-IP>:8000`, with the phone and PC on the same Wi-Fi.
- Push works on the APK. The web build gets alerts in-app through Reverb.

**Google sign-in locally:**
- The Google button appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Email + password always works.
- The instructor creates one **testing-only** Google OAuth client, with redirect `http://localhost:8000/auth/google/callback` (plus an Android client for the APK).
- In Testing status, Google allows only listed test users, up to 100. Add the student emails, or use the "Internal" type if UCLM is on Google Workspace.
- Never share the production client.

**Images:** the `images.yml` action builds and pushes `evacuai-api` and `evacuai-mobile-web` to GHCR on every merge to `main`, tagged with a version and `latest`. Developers add `compose.dev.yml` to mount source and get hot reload.

---

## 6. Testing plan

| Level | Tool | What it covers |
|---|---|---|
| Backend feature/unit | **Pest** (+ `Event::fake`, `Notification::fake`, `Queue::fake`, `Http::fake`) | Auth flows, Google callback (mocked Socialite), domain allowlist, policies (a student cannot broadcast, change roles, or read others' SOS/locations), rate limits, 3-report clustering (distinct users only), broadcast → Reverb event + push job, feed parsing from fixtures, retention purge |
| Static analysis / style | **Larastan** (PHPStan), **Pint**; `tsc` + ESLint | Type errors and formatting in CI |
| Routing | **Vitest + fast-check** (property tests) | Never uses blocked edges. Always ends at a hazard-safe node. Re-route avoids a newly blocked edge. Returns "no safe route" instead of crashing. Under 100 ms on the full graph. Plus `validate` on `campus-data` |
| Mobile components | **jest-expo + React Native Testing Library** | Forms, validation, alert rendering, offline banner, Google button visibility |
| Admin browser tests | **Pest browser testing** (Playwright-based) | Filament: verify cluster → broadcast → toggle path → Safety Monitor update |
| Mobile E2E | **Maestro** (APK on emulator) + **Playwright** against `mobile-web` | Register → read the email via the Mailpit API → verify → report → receive alert → route → check in. SOS chat. Offline route |
| Docker smoke | GitHub Action: `docker compose up --wait` from published images + smoke tests | The student stack starts clean on every release |
| Load | **k6** (HTTP + WebSocket) | 500 concurrent users (manuscript NFR) with open Reverb connections. Alert delivery p95 under 10 s. Report bursts |
| Devices | Low-end Android 8–9 (2 GB RAM), mid-range, tablet | Startup, route render, battery over a 30-minute drill |
| Accessibility | TalkBack, font scaling, contrast | Large SOS button, readable under stress |
| Security | OWASP ASVS/MASVS checklists, `composer audit`, `pnpm audit`, secrets scan | No secrets in the APK. HTTPS only in production. CSRF on admin, Sanctum on API |
| Student round | Scripted scenarios in `docs/TESTING.md`, bugs filed through a GitHub Issue template | |
| Field test | Live drill with the UCLM Civil Security Unit | Alert-to-device time, check-in %, route correctness, SOS response time |
| Evaluation | Google Forms, ISO/IEC 25010 + 5-point Likert, weighted mean (Ch. III) | The 8 quality characteristics |

CI gate on every PR: Pest, Larastan, Pint, Vitest, jest, tsc/ESLint. Nightly: Maestro, Playwright, Pest browser tests, and the Docker smoke run.

---

## 7. Deployment (VPS or UCLM server, same compose)

**Server:**
- Ubuntu LTS with 2 vCPU and 2–4 GB RAM, e.g. Hetzner or DigitalOcean, about $5–12/mo.
- Or a UCLM VM.
- Install Docker Engine + the compose plugin.
- `ufw` firewall: allow 22 (SSH key only, password login off), 80 and 443.
- Turn on `unattended-upgrades`.

**Configuration:**
- `compose.yml` + a production `.env`: `APP_ENV=production`, `APP_DEBUG=false`, a real `APP_KEY`, the domain name, SMTP (UCLM mail, or Brevo/Resend free tier), production Google OAuth, Sentry DSN, and `ALLOWED_EMAIL_DOMAINS`.
- No Mailpit in production. Demo seeding is off (`SEED_DEMO=false`).
- FrankenPHP/Caddy fetches TLS certificates automatically for the domain.
- Caddy serves Reverb as `wss://` through the same domain, so only ports 80 and 443 are open.

**Deploy:** the GitHub Actions `deploy.yml` job runs on a release tag. It connects over SSH, then runs `docker compose pull && docker compose up -d`. The entrypoint runs `php artisan migrate --force` and the `optimize` cache commands. Rollback = re-deploy the previous image tag.

**Backups:**
- A nightly `pg_dump` (scheduler or cron container), compressed and copied off-site (Backblaze B2, Cloudflare R2, or UCLM storage), with a retention period.
- Weekly VPS snapshots.
- A restore test documented in `RUNBOOK.md`.

**Monitoring:** Laravel Pulse at `/pulse` (admin only), Sentry, and UptimeRobot on `/up` (Laravel's built-in health route).

**Self-hosting on a UCLM server:**
- Data stays on campus.
- Realtime alerts keep working over campus Wi-Fi even during an ISP outage, as long as power and the LAN are up.
- Push notifications still need internet, because they go through Expo/FCM.
- Phones off campus need a public domain or a tunnel (e.g. Cloudflare Tunnel) to reach the server.

**Mobile:**
- EAS profiles: `development`, `preview` (APK for students and pilot), `production` (AAB).
- **EAS Update** pushes over-the-air JS fixes.
- Google Play: the account costs $25 once. New personal accounts must run a closed test with 12+ testers for 14 days before production access. An organization account avoids this.
- iOS later: Apple Developer ($99/yr) → `eas build -p ios` → TestFlight.

**Rough cost:** VPS ~$5–12/mo (or $0 on a UCLM server), a domain ~$10–15/yr, Google Play $25 once. Expo EAS, Sentry and UptimeRobot are on free tiers. Local Docker testing costs nothing.

---

## 8. Verification (end-to-end acceptance)

1. CI is green: Pest, Larastan, Vitest, jest, browser/E2E tests, and the Docker smoke run.
2. On a clean machine with only Docker Desktop, run `docker compose up`. Then:
   - `localhost:8000/admin` (Filament) works.
   - `localhost:8081` (app) works.
   - The demo accounts log in.
3. Register a new account with email + password, verify it via Mailpit, and log in. Sign in with Google using the testing client. The same email resolves to the same user. A student account is refused at `/admin`.
4. Three users report a fire on the same floor. The admin sees the cluster and broadcasts. All open clients show the alert in seconds, and the APK gets a push.
5. Set the origin by QR (APK) or picker (web). The route avoids the corridor the admin blocked. Toggle an edge on the route: it re-routes live.
6. Go offline and reload. The cached route still works.
7. Send an SOS: the admin sees the location, two-way chat works, and the admin acknowledges.
8. Check in at an assembly point. The Safety Monitor updates, and users without a check-in show as Unknown.
9. k6 at 500 users with WebSockets: alert p95 stays under 10 s.
10. On a staging VPS, a tag deploy runs `migrate --force` and HTTPS + `wss://` work. Restore a backup into a scratch DB successfully.

---

## After approval

1. Save this plan as `docs/PLAN.md` in the repo.
2. Start slice 1: Laravel 13 + Filament scaffold, migrations from the corrected data dictionary, Expo + routing skeletons, Dockerfile + compose, CI.
3. Confirm `docker compose up` works on this machine before moving on.
