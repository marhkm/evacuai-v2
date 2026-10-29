# Testers' report, Part 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fix the four bugs the student testers reported (admin 403, phone sign-in, badges only on SOS, no chat times),
give each SOS one owner with take-over, and merge "Needs help" into SOS on the safety boards.

**Architecture:** Laravel API changes:
- an admin auth guard;
- per-officer "seen" stamps;
- the SOS owner rules;
- one Safety status rule.

The two clients consume them: the React Command Center and the Expo app (student chat, Responder mode, sign-in). No
new packages.

**Tech Stack:**
- Laravel 13 + Filament 5 + Pest;
- React 19 + TanStack Query + Vitest (`command/`);
- Expo SDK 57 + Jest (`mobile/`);
- Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-10-29-testers-report-part1-design.md`

## Global Constraints

- **Times:** Asia/Manila (`config('evacuai.timezone')` on the API; `timeZone: 'Asia/Manila'` with locale `en-PH` in the
  clients).
- **Tabs with unseen badges:** exactly `sos`, `reports`, `feedback`.
- **Copy:**
  - "Handled by {name}";
  - "Take over";
  - confirm: "{name} is handling this. Take over?";
  - chat line: "Officer {name} has taken over from {previous}." (without a previous owner: "Officer {name} has taken
    over.");
  - day separators: "Today", "Yesterday", else e.g. "Mon, Oct 27".
- **Never weaken auth:** non-admins never reach `/admin`; non-officers still get 404 on `/api/officer/*`.
- **Commits:** commit only when the user asks, with no AI attribution lines. `docs/manuscript/` is never staged.
- **Run commands:**
  - API tests in Docker: `docker compose -f docker/compose.yml exec app php artisan test --filter=<Name>`. Or Herd PHP
    via PowerShell if the stack is down.
  - Command Center: `npm test -w command`.
  - Mobile: `cd mobile && npx jest --runInBand <file>`.

## Spec change found while planning

A separate admin cookie (spec §1) would break Filament. Livewire posts to one global `/livewire/update` route outside
`/admin`, which would carry the Command Center's cookie.

**Instead,** the panel uses its own guard `admin` in the same session:
- both apps can be signed in at once, and `/admin` shows its login page, not 403, when only the Command Center is
  signed in;
- **limit:** Filament's sign-out invalidates the whole session, so signing out of `/admin` also signs out the Command
  Center in that browser. The Command Center's sign-out no longer touches `/admin`.

Task 1 updates the spec to say so.

## Review Focus

1. **Two officers reply to a pending SOS at nearly the same time.** Exactly one becomes owner; the other gets 409, not a
   second owner. Task 4 claims with an atomic conditional update and pins it.
2. **The student replying to their own SOS** must never get 409, whoever owns it (Task 4).
3. **A server address that is a domain or https** (`https://evac.example.com`) must not get `:8000` added. Only
   scheme-less IP or `localhost` addresses do (Task 8).
4. **A message sent after midnight Manila time but before midnight UTC** (e.g. `2026-10-28T17:30:00Z` = Oct 29 01:30
   Manila) is labelled with the Manila day (Tasks 5 and 6).
5. **Take over on a resolved or cancelled SOS** returns 422 and posts no chat line (Task 4).

---

### Task 1: Admin panel on its own guard (bug 3, simultaneous sign-in)

**Files:**
- Modify:
  - `api/config/auth.php` (add guard `admin`: driver `session`, provider `users`);
  - `api/app/Providers/Filament/AdminPanelProvider.php` (`->authGuard('admin')`);
  - `api/app/Http/Controllers/Command/SessionController.php` (`destroy`).
- Test: `api/tests/Feature/AdminPanelAccessTest.php`, `api/tests/Feature/Officer/CommandSessionTest.php`.
- Docs: `docs/superpowers/specs/2026-10-29-testers-report-part1-design.md` §1 (replace the cookie design with the
  guard design and its sign-out limit, as stated above).

**Interfaces:** Produces: guard name `admin`. Every `actingAs($user)` for `/admin` routes becomes `actingAs($user, 'admin')`.

- [ ] **Step 1: Write the failing tests** in `AdminPanelAccessTest.php`. Change the existing `actingAs(...)` calls on
  `/admin` to the `admin` guard, then add:

```php
it('shows the admin login, not 403, when only the Command Center is signed in', function () use ($make) {
    $this->actingAs($make(Role::SafetyOfficer), 'web')->get('/admin')->assertRedirect('/admin/login');
});

it('lets an admin and an officer be signed in side by side', function () use ($make) {
    $this->actingAs($make(Role::Admin), 'admin')->actingAs($make(Role::SafetyOfficer), 'web');
    $this->get('/admin')->assertOk();
    $this->getJson('/api/officer/me')->assertOk();
});
```

  In `CommandSessionTest.php`:
  - `signing out of the Command Center keeps the admin panel signed in`: actingAs admin on `admin` and officer on
    `web`, then `deleteJson` the Command sign-out route. Assert `/admin` is still `assertOk()`.
  - `an officer can be signed in on two phones at once`: two `POST /api/auth/login` calls for the same officer give
    tokens A and B; both `GET /api/officer/me` with their bearer token return 200.

- [ ] **Step 2:** Run `php artisan test --filter="AdminPanelAccess|CommandSession"`. Expected: the new tests fail (a
  web session still gets 403 on `/admin`).
- [ ] **Step 3: Implement.**
  - Add the guard and `->authGuard('admin')`.
  - In `SessionController::destroy`, keep `Auth::guard('web')->logout()` and `regenerateToken()`, and drop
    `invalidate()`, so the admin guard survives.
- [ ] **Step 4:** Run the full API suite (`php artisan test`). Expected: all pass.
- [ ] **Step 5:** Update spec §1 as stated above.

### Task 2: Unseen counts API (bug 1, server side)

**Files:**
- Create:
  - `api/database/migrations/2026_10_29_000000_add_tabs_seen_at_to_users.php` (`json('tabs_seen_at')->nullable()`);
  - `api/app/Support/Unseen.php`;
  - `api/app/Http/Controllers/Officer/SeenController.php`;
  - `api/app/Events/FeedbackSubmitted.php`.
- Modify:
  - `api/app/Models/User.php` (cast `tabs_seen_at` → `array`; not mass-assignable);
  - `api/app/Http/Controllers/Officer/OverviewController.php`;
  - `api/app/Support/CampusStats.php` (add `unowned_sos`);
  - `api/app/Http/Controllers/Api/FeedbackController.php`;
  - `api/routes/api.php`.
- Test: create `api/tests/Feature/Officer/OfficerUnseenTest.php`.

**Interfaces:** Produces:
- **`Unseen`:**
  - `Unseen::TABS = ['sos', 'reports', 'feedback']`;
  - `Unseen::counts(User $u): array{sos: int, reports: int, feedback: int}` counts SOS, hazard reports and feedback
    created after the tab's stamp, or since the start of today (Manila) if there is no stamp;
  - `Unseen::mark(User $u, string $tab): void`.
- **Route** `POST /api/officer/seen/{tab}` (`tab` constrained to `sos|reports|feedback`) → 204. It sits in the officer
  group outside the 60/min throttle group.
- **`GET /api/officer/overview`** gains `unseen: {sos, reports, feedback}`, and `stats.unowned_sos` (open SOS with
  `acknowledged_by` null).
- **Event `FeedbackSubmitted`:** `ShouldBroadcastNow`, `PrivateChannel('officers')`, `broadcastAs` `feedback.submitted`
  (copy the shape of `ReportSubmitted`). Dispatched in `FeedbackController::store`.

- [ ] **Step 1: Write the failing tests** (`OfficerUnseenTest.php`):
  - `counts items created since the officer last opened each tab`: create 2 reports, mark `reports`, travel 1 minute
    (`$this->travel(1)->minutes()`), create 1 report and 1 feedback. Expect overview
    `unseen === ['sos' => 0, 'reports' => 1, 'feedback' => 1]`.
  - `counts everything from today when a tab was never opened`: a report from yesterday and one today →
    `unseen.reports === 1`.
  - `keeps stamps per officer`: officer A marks `reports`; officer B still sees the count.
  - `rejects unknown tabs`: `POST /api/officer/seen/alerts` → 404. A student → 404.
  - `reports open SOS that nobody owns`: one pending and one acknowledged-with-owner →
    `stats.unowned_sos === 1`.
  - `broadcasts new feedback to officers`: `Event::fake([FeedbackSubmitted::class])`, then a student posts feedback →
    dispatched once.
- [ ] **Step 2:** Run `php artisan test --filter=OfficerUnseen`. Expected: FAIL (route and keys missing).
- [ ] **Step 3: Implement** the files above; `OverviewController::__invoke(Request $request)` adds
  `'unseen' => Unseen::counts($request->user())`.
- [ ] **Step 4:** Run `php artisan test`. Expected: all pass, including the PHPStan/Pint checks if the suite runs them
  (`composer lint` if present).

### Task 3: Command Center badges (bug 1, client side)

**Files:**
- Modify: `command/src/Shell.tsx`, `command/src/realtime.ts`.
- Test: `command/src/Shell.test.tsx`.

**Interfaces:**
- **Consumes (Task 2):** `overview.unseen`, `overview.stats.unowned_sos`, `POST /api/officer/seen/{tab}`, event
  `.feedback.submitted`.
- **Produces:**
  - `Overview` type gains `unseen: { sos: number; reports: number; feedback: number }` and
    `stats.unowned_sos: number`;
  - badge rules:
    - `/reports` shows `unseen.reports`;
    - `/feedback` shows `unseen.feedback`;
    - `/sos` shows `Math.max(unseen.sos, stats.unowned_sos)`;
    - hidden when 0, `aria-label="{n} new"`.

- [ ] **Step 1: Write the failing tests** (`Shell.test.tsx`, existing fetch-mock pattern):
  - `shows unseen counts on SOS, Reports and Feedback`: overview `unseen {sos:1, reports:3, feedback:2}`,
    `unowned_sos 0` → badges "1", "3", "2". No badge on Alerts.
  - `keeps the SOS badge while an SOS has no owner`: `unseen.sos 0`, `unowned_sos 2` → SOS badge "2".
  - `marks a tab seen when it is opened, only when it has unseen items`: render at `/reports` with `unseen.reports 3`
    → one `POST /api/officer/seen/reports`. With `unseen.reports 0` → none.
  - `refreshes the badges when a report or feedback arrives`: the realtime table maps `.report.submitted` and
    `.feedback.submitted` to keys that include `['overview']`. Assert via the exported table, or whatever the existing
    realtime test does.
- [ ] **Step 2:** Run `npm test -w command -- Shell`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `Shell`, an effect keyed on `[pathname, unseen?.[tab]]`: when the current path's tab has `unseen > 0`, POST
    the seen route, then invalidate `['overview']`. Posting only when > 0 prevents a loop; the SOS badge's
    `unowned_sos` part is not cleared by looking.
  - `realtime.ts`: add `['overview']` to `.report.submitted`, and a row
    `['officers', '.feedback.submitted', [['feedback'], ['overview']], true]`.
- [ ] **Step 4:** Run `npm test -w command` and `npx tsc --noEmit -p command`. Expected: all pass, no type errors.

### Task 4: SOS owner, reply rule and take over (the report's question)

**Files:**
- Modify:
  - `api/app/Models/SosAlert.php`;
  - `api/app/Http/Controllers/Officer/SosController.php`;
  - `api/app/Http/Controllers/Api/SosController.php` (`message`, `payload`);
  - `api/routes/api.php`.
- Test: `api/tests/Feature/Officer/OfficerSosTest.php`.

**Interfaces:** Produces:
- **`SosAlert::claimFor(User $officer): ?User`.** Returns null when `$officer` now owns the case, else the other owner.
  - If there is no owner, it claims atomically: `whereKey($id)->whereNull('acknowledged_by')->update([...])`, setting
    `acknowledged_by`, `status = acknowledged` and `acknowledged_at` (if null), then refreshes.
  - The update must still fire the existing broadcast. Call `$this->refresh()` and dispatch `SosUpdated` if the raw
    update skips model events.
- **409 response:** `{error: 'handled_by', name: string, message: 'Handled by {name}.'}` when an officer who isn't the
  owner replies. It applies on both message routes when the replier is not the SOS sender.
- **`payload()` gains `can_reply: bool`:** open && (viewer is the sender || no owner || owner is viewer).
- **Route `POST /api/officer/sos/{sos}/take-over`** (in the 60/min throttle group) →
  `SosController::takeOver(Request, SosAlert): JsonResponse`, returning the same `sos` JSON as `show`.
  - 422 via `InvalidState` if the SOS is not open ("This SOS is closed.") or the caller already owns it ("You're already
    handling this.").
  - On success: set the owner, post the chat line from the new owner (copy in Global Constraints), and
    `Activity::log('sos_taken_over', ['sos_id', 'from', 'to'])`.

- [ ] **Step 1: Write the failing tests** (`OfficerSosTest.php`):
  - `the first officer to reply owns the SOS`: officer A replies to a pending SOS → `acknowledged_by` = A, status
    acknowledged.
  - `another officer cannot reply to a case someone else handles`: B replies → 409 `{error: 'handled_by', name: A}`,
    and no message is stored.
  - `only one officer wins a pending SOS`: call `claimFor(A)` then `claimFor(B)` on two separately loaded copies of the
    same SOS → A returns null, B returns A, and the DB owner is A.
  - `the student can always reply to their own SOS`: owner A; the sender posts via `POST /api/sos/{id}/messages` → 201.
  - `an officer on the student route follows the same rule`: B on `/api/sos/{id}/messages` → 409.
  - `take over moves the case and tells everyone`: B takes over → owner B, last message body
    `"Officer {B} has taken over from {A}."` with sender B. `payload.can_reply` is true for B and false for A.
  - `take over refuses closed cases and own cases`: a resolved SOS → 422 with no new message; the owner taking over →
    422.
- [ ] **Step 2:** Run `php artisan test --filter=OfficerSos`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `Officer\SosController::message`: call `claimFor`, return 409 if it returns a user, else store the message.
  - `Api\SosController::message`: when the replier is an officer and not the sender, apply the same rule.
  - Add `takeOver`, the route, and `can_reply`.
- [ ] **Step 4:** Run `php artisan test`. Expected: all pass.

### Task 5: Command Center SOS: "Handled by", Take over, chat times with day separators (bug 2)

**Files:**
- Create: `command/src/chatTime.ts`, `command/src/chatTime.test.ts`.
- Modify: `command/src/screens/Sos.tsx`.
- Test: `command/src/screens/Sos.test.tsx`.

**Interfaces:**
- **Consumes (Task 4):** `can_reply`, `responder`, `POST /api/officer/sos/{id}/take-over`, the 409 `message`.
- **Produces:**
  - `timeLabel(iso: string): string`, e.g. "2:41 PM" (en-PH, Asia/Manila, `hour: 'numeric', minute: '2-digit'`);
  - `dayLabel(iso: string, now?: Date): string`: "Today" | "Yesterday" | "Mon, Oct 27", comparing Manila calendar days.

- [ ] **Step 1: Write the failing tests:**
  - `chatTime.test.ts`, with now `2026-10-29T04:00:00Z` (12:00 Manila):
    - `dayLabel('2026-10-29T01:00:00Z')` → "Today";
    - `dayLabel('2026-10-28T03:00:00Z')` → "Yesterday";
    - `dayLabel('2026-10-27T03:00:00Z')` → "Tue, Oct 27";
    - `dayLabel('2026-10-28T17:30:00Z')` → "Today" (Oct 29 01:30 Manila);
    - `timeLabel('2026-10-29T06:41:00Z')` → "2:41 PM".
  - `Sos.test.tsx`:
    - `shows a day separator before the first message of each day`: two messages yesterday and one today →
      separators "Yesterday", "Today" in order (`role="separator"`), and each message shows its `timeLabel`.
    - `offers Take over instead of the reply box when someone else handles the case`: `can_reply: false`,
      `responder: 'Officer Cruz'` → text "Handled by Officer Cruz", no Message textbox, a "Take over" button.
      `window.confirm` mocked to true → `POST .../take-over`; the confirm text is
      "Officer Cruz is handling this. Take over?".
    - `the list shows who handles each SOS`: an item with `acknowledged_by: 'Officer Cruz'` shows
      "Handled by Officer Cruz".
- [ ] **Step 2:** Run `npm test -w command -- chatTime Sos`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use the helpers in the chat (separator `<li role="separator">` when `dayLabel` changes) and
  in the header ("Sent {dayLabel} {timeLabel}" and "Handled by {responder}"). Replace the local `time` helper with them.
- [ ] **Step 4:** Run `npm test -w command`. Expected: all pass.

### Task 6: Phone chat times, separators, Responder take over (bug 2)

**Files:**
- Create: `mobile/src/lib/chatTime.ts` (the same two functions and behaviour as Task 5; copy, no shared package).
- Modify:
  - `mobile/src/app/sos.tsx` (student chat);
  - `mobile/src/app/responder/sos/[id].tsx`;
  - `mobile/src/app/responder/sos/index.tsx` (`clock` may re-export `timeLabel`).
- Test: create `mobile/src/__tests__/chatTime.test.ts`; extend `mobile/src/__tests__/responder.test.tsx` and
  `mobile/src/__tests__/safety.test.tsx` (or wherever the student SOS chat is tested; grep `Chat with safety officers`).

**Interfaces:** Consumes Task 4 (`can_reply`, take-over route, 409 message) and Task 5's helper behaviour.

- [ ] **Step 1: Write the failing tests:**
  - `chatTime.test.ts`: the same five cases as Task 5.
  - Student SOS: messages from yesterday and today show the "Yesterday" and "Today" separators, and each bubble shows
    its time (e.g. "2:41 PM").
  - Responder:
    - `can_reply: false` with responder "Officer Cruz" → "Handled by Officer Cruz", no Message field, a "Take over"
      button.
    - Pressing it calls `Alert.alert` with "Officer Cruz is handling this. Take over?". The test presses the confirm
      button via `jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b[1].onPress())`, then
      `POST /api/officer/sos/{id}/take-over`.
- [ ] **Step 2:** Run `cd mobile && npx jest --runInBand chatTime responder safety`. Expected: FAIL.
- [ ] **Step 3: Implement** the separator as a `Text` with `accessibilityRole="header"` and the label as its content.
- [ ] **Step 4:** Run `cd mobile && npx jest --runInBand && npx tsc --noEmit && npx eslint src`. Expected: all pass.

### Task 7: One SOS category on the safety boards (change 7)

**Files:**
- Modify:
  - `api/app/Support/SafetyBoard.php` (`counts`, `status`);
  - `command/src/screens/Safety.tsx`;
  - `command/src/screens/LiveOps.tsx` (its counters);
  - `mobile/src/app/responder/missing.tsx`.
- Test:
  - `api/tests/Feature/Officer/OfficerSafetyTest.php`;
  - `command/src/screens/Safety.test.tsx`;
  - `command/src/screens/LiveOps.test.tsx`;
  - `mobile/src/__tests__/responder.test.tsx`.

**Interfaces:** Produces:
- `counts(int $alertId): array{total: int, safe: int, unknown: int, sos: int}`, with `needs_help` removed from the
  response;
- `status()` returns `'SOS'` when `open_sos > 0` or `check_status === 'needs_help'`;
- `counts` is one aggregate query using the same CASE expression as `sort()`, over `DrillStats::people()`. No
  per-person load: `OfficerScaleTest` must stay fast.

  `DrillStats` and the CSV drill report keep `needs_help` (out of scope; Part 2 removes the status).

- [ ] **Step 1: Write the failing tests:**
  - `OfficerSafetyTest`, `counts needing help as SOS, and counters match the list`: people with an open SOS, with a
    `needs_help` check-in, with both, safe, and unknown.
    - `counts === ['total' => 5, 'safe' => 1, 'unknown' => 1, 'sos' => 3]`;
    - the response has no `needs_help` key;
    - the people statuses are `SOS` ×3, `safe`, `unknown`;
    - an open SOS of someone outside the alert's people is not counted.
  - Command `Safety.test.tsx` and `LiveOps.test.tsx`: no "Needs help" counter or filter; filters are All, SOS,
    Unknown, Safe.
  - Mobile `responder.test.tsx`: the missing list summary reads "{sos} SOS · {unknown} unknown · {safe} safe".
- [ ] **Step 2:** Run the three test commands. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the `Counts`/`Board` types in all three clients.
- [ ] **Step 4:** Run `php artisan test`, `npm test -w command`, and `cd mobile && npx jest --runInBand`. Expected: all
  pass.

### Task 8: Phone sign-in help (bug 4)

**Files:**
- Modify:
  - `mobile/src/lib/api.ts` (`setServerUrl`, plus a new `normalizeServerUrl`);
  - `mobile/src/components/ServerSetting.tsx`;
  - `mobile/src/lib/api.ts` unreachable message;
  - `docs/SETUP-GUIDE.md`.
- Test: `mobile/src/__tests__/api.test.ts`, `mobile/src/__tests__/authFlow.test.tsx`.

**Interfaces:** Produces:
- **`normalizeServerUrl(input: string): { url: string } | { error: string }`:**
  - trims, and drops trailing slashes and any path;
  - with no scheme: prepends `http://`, and appends `:8000` if the host is an IPv4 address or `localhost` with no port;
  - an explicit `https://` or a domain is kept as typed;
  - port `8081` → error "That's the web app's port. Use 8000.";
  - port `8080` → error "That's the live-updates port. Use 8000.".
- **`setServerUrl(url: string): void`** uses it. On error it keeps the old URL. `ServerSetting` shows the error and
  does not save.
- **`testServer(url: string): Promise<'ok' | 'unreachable' | 'timeout' | 'not-evacuai'>`:** `GET {url}/api/client-config`
  with a 5 s `AbortController` timeout. `not-evacuai` when the JSON lacks the expected key: read
  `ClientConfigController` for a key it always returns, e.g. `reverb`.

- [ ] **Step 1: Write the failing tests** (`api.test.ts`):
  - `normalizeServerUrl`:
    - `'192.168.1.5'` → `http://192.168.1.5:8000`;
    - `'192.168.1.5:8000/'` → `http://192.168.1.5:8000`;
    - `'http://10.0.0.2'` → `http://10.0.0.2`, because a scheme was typed (the user chose it);
    - `'https://evac.example.com'` → unchanged;
    - `'192.168.1.5:8081'` and `':8080'` → the two errors.
  - `testServer`: fetch resolving with the expected JSON → `'ok'`; fetch rejecting → `'unreachable'`.
  - `authFlow.test.tsx`: in Server setting, typing `192.168.1.5` and pressing "Test connection" shows "Connected", and
    "Save server" shows "Using http://192.168.1.5:8000".
  - The unreachable sign-in error contains the address and the words "Windows Firewall".
- [ ] **Step 2:** Run `cd mobile && npx jest --runInBand api authFlow`. Expected: FAIL.
- [ ] **Step 3: Implement.** The unreachable message is: "Cannot reach the server at {url}. Check that the phone is on
  the same Wi-Fi and that Windows Firewall allows port 8000 on the PC."
- [ ] **Step 4: Update `docs/SETUP-GUIDE.md`.** Add a "Use the app on your phone" section:
  - get the PC's Wi-Fi IPv4 with `ipconfig`;
  - allow TCP 8000 and 8080 for Private networks;
  - as a command for an admin PowerShell window:
    `New-NetFirewallRule -DisplayName "EvacuAI" -Direction Inbound -Protocol TCP -LocalPort 8000,8080 -Profile Private -Action Allow`;
  - type the address and press Test connection;
  - verification codes are at `http://localhost:8025` on the PC, or use the demo accounts.

  Then run `npm run manual` to rebuild the HTML guide.
- [ ] **Step 5:** Run `cd mobile && npx jest --runInBand && npx tsc --noEmit && npx eslint src`. Expected: all pass.

### Task 9: End-to-end check and screenshots

**Files:** Modify `e2e/admin.spec.ts` and `e2e/command.spec.ts`.

- [ ] **Step 1: Add `e2e/admin.spec.ts` › `an officer in the Command Center and an admin in the admin panel at once`.**
  In one browser context:
  - sign into `/command` as `safety_officer`;
  - open `/admin` → expect the admin login page, not 403;
  - sign in as `admin`;
  - expect the "Command Center" link;
  - reload `/command` → still signed in (Live Ops heading).

  It counts against Filament's 5 sign-ins a minute, so merge with the existing admin sign-in test if needed.
- [ ] **Step 2: Add `e2e/command.spec.ts` › `the Reports tab shows a badge for a new report`.** Seed or submit one
  report via the API, then expect the Reports nav link to contain a badge. Opening Reports clears it.
- [ ] **Step 3: Run it all.**
  1. `docker compose -f docker/compose.yml up -d --build`;
  2. `E2E_CHANNEL=msedge npm run e2e`. Expected: all pass;
  3. `npx vitest run` (root);
  4. `npm test -w command`;
  5. mobile jest;
  6. `php artisan test`. Expected: all pass.
- [ ] **Step 4:** If the screens changed visibly, run `node scripts/capture-screens.mjs` and `npm run manual`. The
  walkthrough's SOS screenshot should show times and "Handled by".
- [ ] **Step 5:** Report to the user. Commit and push only when they ask.
