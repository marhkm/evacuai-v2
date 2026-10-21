# Phase 3: Command Center (officer web app)

Part of the approved plan: Command Center, Responder mode, real floor plans, Signage redesign and the docs split. Today safety officers work in the Filament admin panel at `/admin`. That confused the user, and it looks like an admin tool. This phase builds the officers' own web app at `/command`. It runs on the officer API from Phase 1 and draws maps with the floor-plan and 3D code from Phase 2.

## Goals

1. **A dark control-room web app at `/command`**, for active safety officers and admins only, with:
   - **Live Ops:** map plus live feeds;
   - **Alerts:** broadcast and manage;
   - **Reports:** hazard report desk;
   - **Paths:** set path status on the floor plan;
   - **SOS:** inbox and chat;
   - **Safety:** who is safe, who needs help, who is unknown, and the drill CSV;
   - **Replay:** 3D drill replay;
   - **Feedback.**
2. **Live updates:** changes from the private `officers` channel appear within seconds without a reload. Alerts and paths come from the public channels.
3. **Signage design system** (`packages/design`): the first consumer of the shared tokens that Phases 5 and 6 reuse.
4. **No change for students:** one `docker compose up` still runs everything. `/command` is built inside the app image.

## Non-goals

- Removing the officer pages from `/admin`: that is Phase 6.
- Responder mode in the phone app: that is Phase 4.
- Restyling the mobile app: that is Phase 5.

## Sign-in and security

- **Same-origin session, not a token:**
  - The SPA is served by Laravel at `http://<host>:8000/command`, the same origin as the API.
  - `bootstrap/app.php` turns on `$middleware->statefulApi()`, so requests from the app's own origin are authenticated by the web session cookie. Bearer tokens from the mobile app keep working.
  - `SANCTUM_STATEFUL_DOMAINS` defaults already cover `localhost:8000`. Production adds the real host through `.env`.
- **Sign-in endpoints** (web middleware group, CSRF-protected; the SPA fetches `/sanctum/csrf-cookie` first):
  - `POST /command/session` `{email, password}`:
    - signs in only active `safety_officer` and `admin` accounts;
    - wrong credentials return 422 with a generic message ("Those details don't match an officer account"), so the response never reveals which accounts exist;
    - throttled at 5 attempts per minute per email + IP, the same as the app;
    - logs `Activity::log('login', ['method' => 'command'])`.
  - `DELETE /command/session`: signs out and invalidates the session.
  - `GET /api/officer/me`: the signed-in officer `{id, name, role}`, or 401/404 through the existing officer middleware.
- **Officers already signed in to `/admin`** share the same web session, so `/command` opens straight away.
- **Realtime auth:** Echo authorizes private channels against `/api/broadcasting/auth` with the session cookie and the `X-XSRF-TOKEN` header.
- **Content-Security-Policy:** `/command` responses send `default-src 'self'`, plus `connect-src 'self' ws: wss:` for Reverb, `img-src 'self' data: blob:` and `style-src 'self' 'unsafe-inline'`. Inline styles are needed by the 3D canvas helpers.

## Serving and build

- **Workspace:** a new `command/` workspace (Vite + React 19 + TypeScript), added to the root `workspaces`.
- **Build output:** `vite build` writes to `api/public/command/` with `base: '/command/'`. This output is **not committed**: it is built in the Docker image, and `.gitignore` adds `/api/public/command/`.
- **Docker:** `docker/Dockerfile` gains a `node:26-alpine` stage that runs `npm ci --workspaces` and `npm run build -w command`, then copies `api/public/command` into the app stage. Students still run one `docker compose up --build`.
- **Laravel route:** `Route::get('/command/{any?}', ...)->where('any', '.*')` returns `public/command/index.html`, so client-side routing works on reload. Static files are served directly by FrankenPHP.
- **Developing locally:** `npm run dev -w command` starts the Vite dev server on `:5173`, which proxies `/api`, `/sanctum`, `/command/session` and `/broadcasting` to `:8000`. `localhost:5173` is added to the stateful domains in local `.env` only.

## Libraries (new dependencies, `command/` only)

| Package | Why |
|---|---|
| `react-router` 7 | Screens and deep links (`/command/sos/12`) |
| `@tanstack/react-query` 5 | Fetching and caching; realtime events invalidate queries instead of patching state |
| `laravel-echo` + `pusher-js` | Already used by the mobile app (same versions) |
| `@vitejs/plugin-react` | The Vite React plugin |
| `@fontsource/inter`, `@fontsource/barlow-condensed` | Self-hosted fonts |
| `@testing-library/react` + `jsdom` (dev) | Component tests in Vitest |

No UI component framework: screens use the design-system CSS.

## Design system: `packages/design`

- **`tokens.ts`:** the Signage palette. Each color has a light and a dark value; the Command Center uses dark.
  - danger `#D7263D` / `#FF4D5E`
  - safe `#0E9F6E` / `#2BD48F`
  - warning `#F2A900` / `#FFC23D`
  - info `#1F6FEB` / `#4C8DFF`
  - ink `#0B1220` / `#E6EAF2`
  - surface `#FFFFFF`, `#F4F6FA` / `#0B1220`, `#131B2B`, `#1B2538`
  - line `#D5DBE5` / `#2A3650`
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32. **Radius:** 6 / 12 / 999. **Fonts:** `display: 'Barlow Condensed'`, `body: 'Inter'`.
- **`css.ts`:** `cssVariables(mode)` turns the tokens into `--evac-*` custom properties for the web.
- **Fonts:** Inter and Barlow Condensed from the `@fontsource/inter` and `@fontsource/barlow-condensed` npm packages (SIL Open Font License). Vite bundles the woff2 files into `/command/assets`. No external font requests, so it works offline on a campus server.
- **`contrast.ts`:** WCAG contrast ratio. A test checks that every text-on-surface pair used is at least 4.5:1, and that large status text on its status color is at least 3:1.

## Screens

**Shell, on every screen:**
- **Top bar:** "EVACUAI COMMAND", a pulsing LIVE dot while the socket is connected (amber "RECONNECTING" otherwise), the campus clock, the active alert pill (hazard, severity, drill stripe), and the officer's name with Sign out.
- **Left rail** (icon + label): Live Ops, Alerts, Reports, Paths, SOS (with an open-count badge), Safety, Replay, Feedback.
- **Keyboard shortcuts:** `g l` / `g a` / `g s` to move between screens.

**Screens:**

1. **Live Ops** (`/command`):
   - **Centre:** a building and floor picker over the floor plan. The plan is drawn by a React DOM `PlanView` using `toPlanShapes`, with blocked and congested paths, hazard rooms, SOS pins and people-count badges per room from `/api/officer/live`. A 2D / 3D toggle mounts `packages/campus-3d` (`mount()`) for 3D.
   - **Left:** the open SOS feed (newest first, pulsing when new, click to open).
   - **Right:** Safe / Needs help / Unknown counters for the active alert, then the latest hazard reports with their matching counts.
2. **Alerts:** the list, filtered by status (draft / active / resolved / retracted).
   - **Broadcast form:** hazard, severity, building, message, drill, plus Cebuano / Filipino fields with "Translate with AI" when available. When the API answers `needs_confirmation`, a confirmation dialog shows the reporter count.
   - **Row actions:** publish draft (with message edit), discard, confirm, resolve, retract. Each asks for confirmation.
3. **Reports:** a table with matching-count badges (red at 3 or more), a photo viewer (lightbox), Verify / Dismiss / Resolve, and Summarize (AI, when available).
4. **Paths:** the floor plan with every path segment clickable. Clicking opens a small panel with Open / Congested / Blocked. A list view, filtered by building and floor, does the same.
5. **SOS:** a list with open / all filters. The chat panel shows the conversation, Acknowledge and Resolve, and a message box. Messages arrive live.
6. **Safety:** an alert picker, the counters, an assembly-point occupancy bar, and a people table (status chip, place, source, last update, phone) sorted SOS / needs-help first, with status filters. Includes the Drill report (CSV) download.
7. **Replay:** an alert picker, then 3D replay with play / pause / scrub, using `/api/officer/replay`.
8. **Feedback:** the average rating and a list.

**Behavior on every screen:**
- **Empty states** give the next step, for example "No open SOS. New requests appear here instantly."
- **Errors:** an inline banner with Retry. Expired sessions return to the sign-in page.

## Realtime

- **`useRealtime()`** connects Echo once.
- **What each channel invalidates:**

  | Channel | Event | Queries invalidated |
  |---|---|---|
  | `officers` | `.sos.updated` | SOS list, that SOS, live |
  | `officers` | `.report.submitted` | reports, live |
  | `officers` | `.checkin.updated` | safety, live |
  | `alerts` | `.alert.updated` | alerts, overview |
  | `campus` | `.campus.updated` (path changes) | paths, live |

- **Fallback:** if the socket fails, queries refetch every 15 seconds and the top bar shows RECONNECTING.

## Testing

- **Vitest + Testing Library** (jsdom), `command/src/**/*.test.tsx`, with the API mocked through an injected fetch:
  - the sign-in gate (a non-officer error is shown);
  - the shell's live indicator;
  - Live Ops counters;
  - the broadcast form's confirmation step;
  - report actions;
  - path status change;
  - SOS chat send;
  - safety filters;
  - realtime events invalidating the right queries.
- **`packages/design`:** token contrast tests.
- **API (Pest):**
  - `POST /command/session` signs in officers and refuses students (422, generic message), with throttling;
  - session sign-out;
  - `GET /api/officer/me`;
  - the `/command/*` route returns the SPA, with the CSP header;
  - a session-authenticated officer reaches `/api/officer/overview` (the stateful API).
- **Playwright e2e** (`e2e/command.spec.ts`, against the Docker stack):
  - an officer signs in and sees Live Ops;
  - a student is refused;
  - an officer broadcasts a drill alert and sees it listed;
  - an officer opens the SOS and sends a message;
  - an officer blocks a path and the plan shows it hatched, then reopens it.

## Rollout

- `docs/TESTING.md` and the manual get a short "Command Center" note now; the full walkthrough comes in Phase 7.
- `/admin` keeps working unchanged until Phase 6.
