# Testers' report, Part 1: bugs and the Command Center — design

## Context

The student testers' report (`Evacuai-Reports-And-Bugs.docx`) lists 4 bugs, an SOS design question, 8 changes and 4
additions. We split it into four parts, each with its own design, plan and build:

1. **Bugs and the Command Center** (this plan).
2. **SOS location and check-in:** location confirm, check-in history, safe zones and capacity.
3. **Hazard report verification:** mandatory in-app photo, duplicate photos, threshold, officer review, AI check.
4. **Maps:** Basic Ed posters, 3D labels and hazards, computed congestion.

The user chose Part 1 first: fix what testers hit today.

**Decisions (user):**
- **Badges:** count items this officer hasn't seen, remembered on the server per officer.
- **SOS:** the first officer to reply owns the case. Any officer may take over, after a confirm.

**Root causes found:**
- **Admin 403 and "simultaneous login":** `/command` and `/admin` share one session cookie.
  `Command/SessionController::store` logs in the `web` guard. An officer signed into the Command Center therefore makes
  `/admin` see a non-admin, and `canAccessPanel` (`api/app/Models/User.php:56`) returns 403. Signing in or out of either
  app also replaces the other's session in that browser. No code limits an account to one session.
- **Phone login:** the server ports are open on the network (`docker/compose.yml`), and the app uses bearer tokens, so
  CORS and Sanctum stateful settings are not involved. Likely causes:
  - the address left at `localhost`, or typed without `http://` or `:8000`. `setServerUrl` (`mobile/src/lib/api.ts:6`)
    adds neither;
  - Windows Firewall blocking port 8000;
  - an unverified email, whose code went to Mailpit, which opens only on the PC.
- **Badges:** only `/sos` renders one (`command/src/Shell.tsx:82`). `pending_reports` is already computed
  (`api/app/Support/CampusStats.php:26`) but ignored. `.report.submitted` doesn't refresh `['overview']`
  (`command/src/realtime.ts:10`). Feedback has no realtime event.
- **Chat times:** the API sends `created_at` per message (`api/app/Http/Controllers/Api/SosController.php:87-103`).
  The phone doesn't show it (`mobile/src/app/sos.tsx:93-98`). The Command Center shows time only, with no date
  (`command/src/screens/Sos.tsx:13`).
- **Safety tab:**
  - "Needs help" is a check-in status, separate from SOS (`api/app/Support/SafetyBoard.php:84-87`).
  - The counter boxes and the filter buttons count differently (`SafetyBoard::counts()` vs per-person status).
- **SOS owner:** `sos_alerts.acknowledged_by` is set by the first reply (`Officer/SosController.php:62`). After that,
  any officer can still reply, on both routes.

## Design

### 1. Separate sign-ins for `/admin` and `/command` (bug 3 + "simultaneous login")
- **The admin panel uses its own auth guard `admin`** (`config/auth.php`, `->authGuard('admin')` in
  `AdminPanelProvider`), in the same session as the Command Center's `web` guard.
- **Changed while planning:** a separate admin session cookie would break Filament. Its Livewire requests post to one
  global `/livewire/update` route outside `/admin`, which would carry the Command Center's cookie.
- **Effect:**
  - an admin and an officer can be signed in side by side in one browser;
  - `/admin` shows its login page instead of 403 when only the Command Center is signed in;
  - Filament's login already refuses non-admins.
- **Sign-out:**
  - the Command Center's sign-out (`SessionController::destroy`) logs out the `web` guard only and no longer
    invalidates the session, so `/admin` stays signed in;
  - **limit:** Filament's own sign-out invalidates the whole session, so signing out of `/admin` also signs out the
    Command Center in that browser.
- **Simultaneous login across devices** already works. A test pins it: two token logins for the same officer, both
  stay valid.

### 2. Phone sign-in (bug 4)
- **`setServerUrl` normalises the address:** adds `http://` when the scheme is missing and `:8000` when there is no port.
  It rejects `:8081` and `:8080` with a hint ("That's the web app / live-updates port; use 8000").
- **`ServerSetting` gets a "Test connection" button:** calls `GET /api/client-config` and shows "Connected" or the
  exact reason (unreachable, timed out, not EvacuAI).
- **Unreachable-server error** on the login screen names the address it tried and suggests the firewall check.
- **SETUP-GUIDE:**
  - a "Use the app on your phone" section: find the PC's Wi-Fi IP, open the Windows Firewall port 8000 (and 8080)
    for Private networks, type `http://<IP>:8000`;
  - where to read verification codes (Mailpit at `http://localhost:8025` on the PC).

### 3. Live badges for unseen items (bug 1)
- **Storage:** a new `users.tabs_seen_at` json column (tab → timestamp).
- **New endpoint `POST /api/officer/seen/{tab}`** (tab in `sos|reports|feedback`) stamps the time. The Command Center
  calls it when a tab opens, and again on refetch while the tab is open.
- **`/api/officer/overview` adds `unseen: {sos, reports, feedback}`:** counts of items created after this officer's
  stamp (null stamp = all of today).
  - **SOS:** new SOS. The SOS badge **also stays on while any open SOS has no owner**, so an unanswered emergency never
    looks handled just because someone opened the tab.
- **Command Center:**
  - `Shell.tsx` renders the badge for every tab in `unseen`;
  - `realtime.ts` adds `overview` to `.report.submitted`;
  - a new `FeedbackSubmitted` event (officers channel) invalidates `feedback` and `overview`.
- **Not badged:** Alerts, Paths and Safety. They change because officers act, and a badge there would be noise.

### 4. Chat timestamps with day separators (bug 2)
- **Both chats** show a time under each bubble ("2:41 PM", Asia/Manila), plus a separator before the first message of
  each day: "Today", "Yesterday", otherwise "Mon, Oct 27".
- **Two small helpers, one per app** (no shared package exists for UI text):
  - `mobile/src/lib/chatTime.ts`;
  - `command/src/chatTime.ts`.

  Each has `dayLabel(iso, now)` and `timeLabel(iso)`.

### 5. SOS: one owner, others watch, take over with confirm (the report's question)
- **Owner:** `acknowledged_by`. The first officer reply (or Acknowledge) claims it. Other officers can still read
  everything.
- **Officers reply only when they own the case,** or when it has no owner (which then claims it). A non-owner gets 409
  `{error: 'handled_by', name}`. Applies on both routes, `Officer/SosController::message` and
  `Api/SosController::message`.
- **New endpoint `POST /api/officer/sos/{id}/take-over`:**
  - sets the owner to the caller;
  - posts a chat line from the new owner: "Officer {name} has taken over from {previous}.";
  - logs `Activity`;
  - broadcasts `SosUpdated`.
- **Command Center:**
  - the SOS list and the detail page show "Handled by {name}";
  - for non-owners the reply box is replaced by "Handled by {name}" and a **Take over** button with a confirm dialog
    ("{name} is handling this. Take over?").
- **Phone:** the officer Responder chat gets the same rule and button. The student already sees "Handled by {name}".

### 6. Safety tab: one SOS category (change 7)
- **`SafetyBoard` per-person status:**
  - `sos` if the person has an open SOS **or** a `needs_help` check-in;
  - otherwise `safe` or `unknown`.
- **`counts()` is derived from the same per-person list,** so the counter boxes and the filter buttons always match.
- **The "Needs help" filter and counter box are removed.**
- Removing "I need help" from the phone is Part 2. Old rows still count as SOS.

## Critical files
- **API:**
  - `app/Providers/Filament/AdminPanelProvider.php`;
  - new `app/Http/Middleware/UseAdminSessionCookie.php`;
  - `app/Support/CampusStats.php`;
  - `app/Support/SafetyBoard.php`;
  - `Http/Controllers/Officer/{SosController,OverviewController}.php`;
  - `Api/SosController.php`;
  - new `Events/FeedbackSubmitted.php`;
  - `Api/FeedbackController.php`;
  - `routes/api.php`;
  - a migration adding `tabs_seen_at`;
  - Pest tests alongside the existing ones.
- **Command Center:** `src/Shell.tsx`, `src/realtime.ts`, `src/screens/{Sos,Safety}.tsx`, new `src/chatTime.ts`, plus
  tests.
- **Mobile:**
  - `src/lib/api.ts` (`setServerUrl`);
  - `src/components/ServerSetting.tsx`;
  - `src/app/login.tsx`;
  - `src/app/sos.tsx`;
  - the Responder SOS screen (`src/app/responder/sos/[id].tsx`);
  - new `src/lib/chatTime.ts`;
  - jest tests.
- **Docs:** `docs/SETUP-GUIDE.md` (the phone section), then rebuild the HTML with `npm run manual`.

## Verification
- **Pest:**
  - `/admin` with a Command Center session shows the admin login, not 403;
  - signing out of one app leaves the other signed in;
  - two officer tokens both stay valid;
  - `unseen` counts and stamps;
  - a non-owner reply returns 409, and take-over moves the owner and posts the line;
  - Safety counts match the per-person list, with needs_help counted as SOS.
- **Vitest (Command Center):**
  - badges render from `unseen` and refresh on events;
  - the reply box shows Take over for non-owners;
  - `chatTime` labels Today, Yesterday and dates.
- **Jest (mobile):**
  - the server URL is normalised and the bad ports are refused;
  - Test connection works;
  - chat times and separators show;
  - officer take-over works.
- **Playwright** (`E2E_CHANNEL=msedge`): officer in `/command` and admin in `/admin` signed in side by side in one
  context; existing specs stay green.
- **By hand:**
  - phone on the same Wi-Fi signs in using `http://<PC-IP>:8000` after the firewall step;
  - two officers open one SOS: the second sees "Handled by", takes over, and the student sees the line.
- **Then:** spec to `docs/superpowers/specs/2026-10-29-testers-report-part1-design.md`, implementation plan via
  writing-plans, build test-first, and commit and push only when asked.
