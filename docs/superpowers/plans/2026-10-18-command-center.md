# Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose Native execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an officer-only dark web app at `/command`, running on the Phase 1 officer API and drawing maps with the Phase 2 floor-plan and 3D code.

**Architecture:**
- **App:** `command/` is a Vite + React 19 SPA built into `api/public/command` inside the Docker image.
- **Serving and sign-in:** Laravel serves the SPA and authenticates it with the same-origin web session (Sanctum stateful API).
- **Data:** TanStack Query caches the officer API; Echo events invalidate queries.
- **Design:** `packages/design` holds the Signage tokens.

**Tech Stack:** React 19, react-router 7, @tanstack/react-query 5, laravel-echo 2 + pusher-js 8, Vite, Vitest + @testing-library/react + jsdom, @fontsource fonts, Laravel 13 + Sanctum, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-command-center-design.md`

## Global Constraints

- **Access:** only active `safety_officer` / `admin` accounts get in. A failed sign-in returns 422 with "Those details don't match an officer account", and is throttled at 5 per minute per email + IP.
- **Not committed:** `api/public/command/` (built in Docker).
- **No inline scripts.** CSP on `/command`: `default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'`.
- **Dark theme only for the Command Center.**
- **Accessibility:** contrast at least 4.5:1 for text and at least 3:1 for large status text; every action button has an accessible name; keyboard reachable.
- **Realtime fallback:** refetch every 15 s while the socket is down.
- **Commits:** no AI attribution; commit only when the user asks.

## Review Focus

1. **Expired session mid-use:** any 401 from the API returns to the sign-in page, and never shows a blank screen. Test in Task 3.
2. **Officer demoted while signed in:** the officer API returns 404, so the app shows "Your account no longer has officer access" and signs out. Test in Task 3.
3. **Socket never connects** (Reverb down): the screens still update by polling, and the top bar shows RECONNECTING. Test in Task 3.
4. **Two officers acting on the same item:** the API answers 422 (invalid state), so the app shows the server message and refetches, never crashing. Test in Task 5.
5. **Large lists:** reports and SOS are paginated (API `meta`), and the UI offers "Load more". Test in Task 6.

---

### Task 1: `packages/design` tokens

**Files:**
- `packages/design/package.json` (`@evacuai/design`)
- `src/tokens.ts`, `src/css.ts`, `src/contrast.ts`, `src/index.ts`
- `test/design.test.ts`

**Interfaces:**
- Produces:
  - `tokens.color.{danger,safe,warning,info,ink,surface,surface2,surface3,line,muted}[mode]`;
  - `contrast(a: string, b: string): number`;
  - `cssVariables(mode: 'light'|'dark'): string` (`--evac-<name>: <hex>;` lines).

- [ ] **Failing tests:**
  - `contrast('#000000', '#ffffff') === 21`;
  - in dark mode, ink on surface, surface2 and surface3 are each at least 4.5;
  - muted on surface is at least 4.5;
  - danger, safe, warning and info on surface are at least 3;
  - `cssVariables('dark')` contains `--evac-danger: #FF4D5E;`.
- [ ] Implement; `npx vitest run packages/design` passes.

### Task 2: Laravel session sign-in, `me`, SPA route, CSP

**Files:**
- `api/bootstrap/app.php` (`statefulApi()`)
- `api/app/Http/Controllers/Command/SessionController.php`
- `api/routes/web.php` (`/command/session` POST/DELETE and `/command/{any?}`)
- `api/app/Http/Controllers/Officer/MeController.php` + `api/routes/api.php` (`GET me`)
- `api/app/Http/Middleware/CommandCsp.php`
- `.gitignore` (`/api/public/command/`)
- Test: `api/tests/Feature/Officer/CommandSessionTest.php`

**Interfaces:**
- `POST /command/session` returns 204 and sets the session.
- `DELETE /command/session` returns 204.
- `GET /api/officer/me` returns `{id, name, role}`.
- `GET /command/...` returns the HTML of `public/command/index.html`, or a 503 plain message "Command Center not built: run npm run build -w command" when it is missing.

- [ ] **Failing tests:**
  - an officer signs in, then `getJson('/api/officer/me')` on the same session returns 200 `{role: 'safety_officer'}`;
  - a student or a wrong password gets 422 with the generic message and is not authenticated;
  - the 6th attempt in a minute gets 429;
  - signing out makes `me` return 401;
  - `GET /command/sos/5` returns 200 with a `Content-Security-Policy` header containing `default-src 'self'` (the test writes a temporary `public/command/index.html`);
  - an activity row `login` with `{method: command}` is written.
- [ ] Implement; the officer tests and the full suite pass.

### Task 3: `command/` scaffold: API client, auth gate, shell, realtime

**Files:**
- `command/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- `src/main.tsx`, `src/api.ts`, `src/auth.tsx`, `src/realtime.ts`, `src/Shell.tsx`, `src/theme.css`, `src/routes.tsx`
- `src/screens/SignIn.tsx`
- Root `package.json` (workspace `command`; scripts `build:command`)
- Tests: `src/auth.test.tsx`, `src/Shell.test.tsx`

**Interfaces:**
- `api<T>(path: string, init?: { method?; body?; }): Promise<T>`:
  - uses `credentials: 'same-origin'` and sends `X-XSRF-TOKEN` from the cookie;
  - throws `ApiError {status, message, errors}`;
  - on a 401 it emits `session-expired`.
- `useMe()` (react-query `['me']`).
- `<RequireOfficer>` redirects to `/command/sign-in`; a 404 from `me` shows "no longer has officer access" and signs out.
- `useRealtime()` returns `{connected: boolean}` and wires the invalidation table from the spec.

- [ ] **Failing tests** (fetch mocked):
  - sign-in shows the server error for a student;
  - a successful sign-in navigates to Live Ops;
  - a 401 on any query shows the sign-in page;
  - a 404 on `me` shows the demoted message;
  - the shell shows LIVE when the mocked Echo says connected and RECONNECTING otherwise;
  - queries use `refetchInterval` 15000 while disconnected;
  - a `.sos.updated` event invalidates `['sos']`.
- [ ] Implement; `npx vitest run command` and `npx tsc --noEmit -p command` pass.

### Task 4: Live Ops with PlanView and 3D toggle

**Files:**
- `command/src/components/PlanView.tsx` (React DOM SVG, built from `toPlanShapes` plus live edges, hazard rooms, people-count badges and SOS pins)
- `command/src/components/View3D.tsx` (mounts `@evacuai/campus-3d` `mount`)
- `command/src/screens/LiveOps.tsx`
- Test: `command/src/screens/LiveOps.test.tsx`

- [ ] **Failing tests** (with the UCLM snapshot fixture):
  - the counters show safe / needs help / unknown from `/api/officer/safety`;
  - the open SOS list shows a person and place, and clicking navigates to `/command/sos/:id`;
  - PlanView renders "Blocked path" for a blocked edge and a "3 people" badge for a room count;
  - the building and floor picker changes the plan.
- [ ] Implement; tests pass.

### Task 5: Alerts screen

**Files:** `command/src/screens/Alerts.tsx`, plus a test.

- [ ] **Failing tests:**
  - the broadcast form posts; a `needs_confirmation` answer opens a dialog with the reporter count, and Confirm re-posts with `confirm: true`;
  - the draft row's Publish posts the edited message;
  - Resolve asks for confirmation and posts;
  - a 422 invalid-state answer shows the server message and refetches;
  - Translate fills the Cebuano and Filipino fields.
- [ ] Implement; tests pass.

### Task 6: Reports and SOS screens

**Files:** `command/src/screens/Reports.tsx`, `command/src/screens/Sos.tsx`, plus tests.

- [ ] **Failing tests:**
  - **Reports:**
    - the matching badge turns red at 3 or more;
    - Verify posts;
    - the photo opens in a lightbox;
    - Summarize shows the text;
    - Load more requests `?page=2` when `meta.last_page > 1`.
  - **SOS:**
    - the list is filtered to open;
    - opening shows the messages;
    - sending posts the body and clears the box;
    - Acknowledge and Resolve post.
- [ ] Implement; tests pass.

### Task 7: Paths, Safety, Replay, Feedback

**Files:** `command/src/screens/{Paths,Safety,Replay,Feedback}.tsx`, plus tests.

- [ ] **Failing tests:**
  - **Paths:** clicking a path on the plan opens a panel; Blocked sends PATCH with the URL-encoded id.
  - **Safety:** the filter "Needs help" shows only those rows; the CSV link points at `/api/officer/alerts/:id/report.csv`.
  - **Replay:** the slider changes the time label.
  - **Feedback:** shows the average.
- [ ] Implement; tests pass.

### Task 8: Docker, e2e, docs

**Files:**
- `docker/Dockerfile` (Node stage building `command`, copied into the app stage)
- `.dockerignore` if needed
- `e2e/command.spec.ts`
- `.github/workflows/ci.yml` (`npm run build -w command` in core; typecheck `command`)
- `docs/USER-MANUAL.md` + `docs/TESTING.md` (Command Center note) + `npm run manual`

- [ ] **Docker:** `docker compose -f docker/compose.yml up -d --build`. Sign in at http://localhost:8000/command as `safety_officer@evacuai.test` and walk through every screen in the browser pane.
- [ ] **E2E:** `npm run e2e` (the new command spec is included).
- [ ] **Final review:** a fresh reviewer (opus).
