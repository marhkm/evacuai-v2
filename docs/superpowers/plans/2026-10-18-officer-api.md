# Officer API and Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every safety-officer action becomes a JSON endpoint under `/api/officer/*`, open only to officers and admins. Officers also get live events and push notifications.

**Architecture:**
- The logic moves out of the Filament closures into small `App\Support\*` service classes.
- New thin controllers in `App\Http\Controllers\Officer\*` call those services behind an `officer` middleware.
- The Filament pages are rewired to the same services, so there is one behavior.
- Realtime adds a private `officers` channel and two events. A queued job pushes SOS and unverified alerts to officers' phones.

**Tech Stack:**
- Laravel 13, Sanctum, Reverb broadcasting, Filament 5 (existing pages only);
- tests: Pest, PHPStan, Pint;
- runtime: Herd PHP 8.5 in PowerShell for local runs; Postgres from `docker compose -f docker/compose.yml up -d postgres`.

**Spec:** `docs/superpowers/specs/2026-10-18-officer-api-design.md`

## Global Constraints

- **Access:** non-officers (student, faculty, staff, or any inactive account) get **404**; unauthenticated callers get **401**.
- **Throttles:**
  - mutating officer endpoints: `throttle:60,1,officer`;
  - SOS chat: `throttle:30,1,sos-chat`.
- **No behavior changes:** same statuses, `Activity::log` types, CSV output and rate limits as today.
- **No migrations.**
- **Broadcast payloads carry no reporter names.**
- **Phone numbers** appear only in the officer safety board.
- **LLM endpoints:**
  - **404** when `Llm::enabled()` is false;
  - **503** `{message: 'No AI provider answered'}` when every provider fails.
- **Errors:**
  - validation: 422 in Laravel's `{message, errors}` format;
  - an action that doesn't apply to the record's current state: 422 `{message}`.
- **Commits:** no AI attribution lines. Commit only when the user asks; the commit steps below are local checkpoints for the executor to batch.

## Review Focus

1. **Alert action that doesn't apply to its state** (resolving a resolved alert, publishing a non-draft) must return 422 and change nothing. Tests are in Task 2.
2. **Broadcast with fewer than 3 matching reports and no `confirm`** returns `needs_confirmation` and creates **no** alert. Test in Task 2.
3. **Drill alerts must not verify matching reports** (`is_drill` path in `CreateAlert`). Test in Task 2.
4. **Inactive officer token** must get 404 on every officer route, including the `officers` channel auth. Tests in Tasks 1 and 8.
5. **Path PATCH with an invalid status, or the same status,** must return 422, or 200 without creating a duplicate `CampusChanged`. Test in Task 4.

---

### Task 1: `officer` middleware, route group, overview

**Files:**
- Create: `app/Http/Middleware/EnsureOfficer.php`
- Create: `app/Http/Controllers/Officer/OverviewController.php`
- Modify: `bootstrap/app.php` (`withMiddleware`: `$middleware->alias(['officer' => EnsureOfficer::class])`)
- Modify: `routes/api.php`: new group `Route::prefix('officer')->middleware(['auth:sanctum', 'officer'])->group(...)`
- Test: `tests/Feature/Officer/OfficerAccessTest.php`

**Interfaces:**
- Produces:
  - the alias `officer` and the route group;
  - helper `officerUser(Role $role = Role::SafetyOfficer, bool $active = true): User` in `tests/Pest.php`, reused by every officer test.
- `OverviewController::__invoke(): JsonResponse` returns `{stats: {...}, active_alert: ?array}`. The stats use the same numbers as `CampusOverview::getStats` (people, pending reports, open SOS, blocked and congested paths, average SOS response over 30 days, feedback average, and the latest alert's safe / needs_help / unknown and median minutes, via `DrillStats`).

- [ ] **Step 1: Write the failing tests**
  - `it('hides officer routes from non-officers')`, with a dataset of student, faculty, staff and an inactive officer: `getJson('/api/officer/overview')` returns 404.
  - `it('requires sign-in')` returns 401.
  - `it('shows the overview to officers and admins')` returns 200, and `stats.open_sos` equals the open SOS count.
  - Seed with `CampusSeeder` (`evacuai.campus_dataset = 'demo'`), as in `SosAndCheckInTest`.
- [ ] **Step 2: Run** `php artisan test tests/Feature/Officer/OfficerAccessTest.php`. Expected: FAIL (404 for officers; route missing).
- [ ] **Step 3: Implement.**
  - `EnsureOfficer::handle`: `abort_unless($u && $u->is_active && $u->role->canManageIncidents(), 404)`.
  - Extract the stat queries from `app/Filament/Widgets/CampusOverview.php` into `App\Support\CampusStats::overview(): array`. The widget renders from it, and the controller returns it.
- [ ] **Step 4: Run** the test, plus `tests/Feature/Reports/ReportsTest.php` (dashboard widget). Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer route group and overview`.

### Task 2: Alerts (service + endpoints + Filament rewire)

**Files:**
- Create: `app/Support/AlertActions.php`
- Create: `app/Http/Controllers/Officer/AlertController.php`
- Modify: `app/Filament/Resources/Alerts/Pages/CreateAlert.php` (`handleRecordCreation` → `AlertActions::broadcast`)
- Modify: `app/Filament/Resources/Alerts/Tables/AlertsTable.php` (actions → service)
- Modify: `routes/api.php`
- Test: `tests/Feature/Officer/OfficerAlertsTest.php`

**Interfaces** (`AlertActions`):
- `broadcast(User $by, array $data): Alert` (the current `CreateAlert::handleRecordCreation` body, with `auth()->id()` replaced by `$by->id`);
- `publish(Alert $a, User $by, string $message): Alert` (draft only);
- `discard(Alert $a): Alert` (draft only);
- `confirm(Alert $a): Alert` (active and unverified);
- `resolve(Alert $a): Alert` and `retract(Alert $a): Alert` (active only).

Each throws `App\Exceptions\InvalidState` (new, rendered as 422 `{message}`) when the state doesn't fit. Each re-runs the same dispatch / `$change` side effects as today.

**Routes:**
- `GET alerts?status=`
- `POST alerts`, with fields as in `AlertForm` (`hazard_type`, `severity_level`, `building_id?`, `message` max 500, `is_drill`, `translations.ceb|fil?`, `confirm?`)
- `POST alerts/{alert}/{publish|discard|confirm|resolve|retract}`
- `POST alerts/translate` (`{message}` → `AlertTranslator::translate`)
- `GET alerts/{alert}/report.csv` (reuse the `DrillReportController` stream body, extracted to `App\Support\DrillReport::stream(Alert)`; the web controller calls it too)

- [ ] **Step 1: Write the failing tests:**
  - `it('broadcasts, verifies matching reports, dispatches push')`:
    - 3 pending fire reports in DEMO/1;
    - POST returns 201 and `verified=true`;
    - the reports are `verified` with `alert_id` set;
    - `Event::assertDispatched(AlertBroadcast::class)`;
    - `Bus::assertDispatched(SendAlertPush::class)`.
  - `it('asks for confirmation below 3 reports')`: 1 report and no `confirm` returns 200 `{needs_confirmation: true, reporters: 1}`, and `Alert::count() === 0`. With `confirm: true` it returns 201.
  - `it('does not verify reports for drills')`: `is_drill: true` leaves the reports `pending`.
  - `it('publishes and discards drafts')`: uses `Feeds` fixture drafts, as in `ExtrasTest`.
  - `it('confirms, resolves, retracts and rejects invalid transitions')`: resolving twice returns 422, and the status is unchanged.
  - `it('translates only when an LLM is configured')`: 404 without keys; with an `Http::fake` Groq reply it returns `{ceb, fil, provider}`.
  - `it('streams the drill report csv')`: 200, `text/csv`, and the first row contains `Alert`.
  - Plus activity rows: `alert_issued`, `alert_updated`.
- [ ] **Step 2: Run** them. Expected: FAIL (routes missing).
- [ ] **Step 3: Implement** `AlertActions`, `InvalidState`, the controller and the routes. Rewire `CreateAlert` and the `AlertsTable` actions to the service.
- [ ] **Step 4: Run** `OfficerAlertsTest`, `tests/Feature/Admin/IncidentAdminTest.php` and `tests/Feature/Extras/ExtrasTest.php`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer alert endpoints on a shared AlertActions service`.

### Task 3: Hazard reports

**Files:**
- Create: `app/Support/ReportActions.php`
- Create: `app/Http/Controllers/Officer/ReportController.php`
- Modify: `app/Filament/Resources/HazardReports/Tables/HazardReportsTable.php`
- Modify: `app/Http/Controllers/Admin/HazardReportPhotoController.php` (streaming body extracted to `App\Support\ReportPhoto::response(HazardReport)`, which already exists for storage, so add a `response` method)
- Test: `tests/Feature/Officer/OfficerReportsTest.php`

**Interfaces:**
- `ReportActions::verify(HazardReport, User): HazardReport` (pending only);
- `dismiss(HazardReport, User)` (pending or verified);
- `resolve(HazardReport)` (verified only).

**Routes:**
- `GET reports?status=`: each item has `{id, hazard_type, place (Places::label), description, status, created_at, matching (ReportClusters::reporterCount), photo_url}`. `reporter` is the name only.
- `POST reports/{report}/{verify|dismiss|resolve}`
- `POST reports/{report}/summary` (`ReportSummary::for`; 404 without an LLM, 503 on failure)
- `GET reports/{report}/photo`

- [ ] **Step 1: Write the failing tests:**
  - the list includes `matching` = 2 for two same-floor reporters;
  - verify, dismiss and resolve, with invalid transitions returning 422;
  - the photo streams for an officer and returns 404 for a student;
  - summary 404 without an LLM;
  - summary 200 with a faked Groq reply, and the prompt contains no reporter name (reuse the assertion from `ExtrasTest`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and rewire the Filament actions.
- [ ] **Step 4: Run** `OfficerReportsTest`, `IncidentAdminTest`, `ReportPhotoTest` and `ExtrasTest`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer hazard report endpoints`.

### Task 4: Paths

**Files:**
- Create: `app/Http/Controllers/Officer/PathController.php`
- Test: `tests/Feature/Officer/OfficerPathsTest.php`

**Routes:**
- `GET paths?building=&level=`: `{id, type, building_id, level (from the from-node), from, to, place, status, updated_by (name), updated_at}`.
- `PATCH paths/{edge}` with `{status: in:open,congested,blocked}`. A save with the same status returns 200 unchanged and fires no event. The existing `EvacEdge` hooks set `updated_by` and fire `CampusChanged`; log `path_status_changed`, as the Filament page does today.

- [ ] **Step 1: Write the failing tests:**
  - the filter by building and level returns only those edges;
  - PATCH to `blocked` sets `updated_by` and dispatches `CampusChanged` once;
  - a repeated PATCH dispatches nothing (`Event::assertDispatchedTimes(CampusChanged::class, 1)`);
  - `status: 'closed'` returns 422.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `OfficerPathsTest` and `tests/Feature/Admin/PathsAndScheduleTest.php`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer path status endpoints`.

### Task 5: SOS desk

**Files:**
- Create: `app/Http/Controllers/Officer/SosController.php`
- Test: `tests/Feature/Officer/OfficerSosTest.php`

**Routes:**
- `GET sos?open=1`: `{id, person, place, message, status, created_at, acknowledged_by, acknowledged_at}`, where `open=1` means `SosAlert::OPEN`.
- `GET sos/{sos}`: plus `messages: [{id, body, sender, mine, created_at}]`, reusing the payload shape of `Api\SosController::payload`.
- `POST sos/{sos}/acknowledge` (pending only) and `POST sos/{sos}/resolve` (open only), via `SosAlert::acknowledge()` / `resolve()`; 422 otherwise.
- `POST sos/{sos}/messages` `{body: required|max:500}`; 422 when resolved or cancelled.

- [ ] **Step 1: Write the failing tests:**
  - list and show;
  - acknowledge sets `acknowledged_by` to the officer;
  - resolve;
  - acknowledging a resolved SOS returns 422;
  - posting a message creates `SosMessage` and fires `SosUpdated`;
  - activity `sos_acknowledged` is written.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `OfficerSosTest` and `tests/Feature/Safety/SosAndCheckInTest.php`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer SOS desk endpoints`.

### Task 6: Safety board and feedback

**Files:**
- Create: `app/Support/SafetyBoard.php`
- Create: `app/Http/Controllers/Officer/SafetyController.php`
- Create: `app/Http/Controllers/Officer/FeedbackController.php`
- Modify: `app/Filament/Pages/SafetyMonitor.php`: `counts()`, `occupancy()` and the table query call `SafetyBoard`.
- Test: `tests/Feature/Officer/OfficerSafetyTest.php`

**Interfaces** (`SafetyBoard`, with the queries moved verbatim from `SafetyMonitor`):
- `alerts(): array` (the `alertOptions` data);
- `counts(int $alertId): array{total:int,safe:int,needs_help:int,unknown:int,sos:int}`;
- `occupancy(int $alertId): list<array{name:string,count:int}>`;
- `query(int $alertId): Builder` (the people query with `check_status`, last location and `open_sos`, with the same default sort).

**Routes:**
- `GET safety?alert=`: the alert defaults to `Alert::current()`. Returns `{alert, alerts, counts, occupancy, people: [{name, role, status (SOS|safe|needs_help|unknown), place, source, updated_at, phone}]}`.
- `GET feedback`: `{average, count, items: [{rating, comments, created_at, name}]}`.

- [ ] **Step 1: Write the failing tests:**
  - with `DemoDrillSeeder`, the `counts` match `DrillStats::for($alert)` (safe, needs_help, unknown);
  - a person with an open SOS shows status `SOS` and sorts first;
  - the feedback average.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and rewire `SafetyMonitor`.
- [ ] **Step 4: Run** `OfficerSafetyTest`, `SosAndCheckInTest` (Safety Monitor Livewire test) and `DemoSeederTest`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer safety board and feedback endpoints`.

### Task 7: 3D live and replay

**Files:**
- Create: `app/Support/Campus3dData.php`
- Create: `app/Http/Controllers/Officer/Campus3dController.php`
- Modify: `app/Http/Controllers/Admin/Campus3dController.php` (delegates to `Campus3dData`, keeping `authorizePanel`)
- Test: `tests/Feature/Officer/OfficerCampus3dTest.php`

**Interfaces:**
- `Campus3dData::live(?Alert $alert): array`
- `Campus3dData::replay(Alert $alert): array`

Same output as the current `live` and `replay` methods.

**Routes:** `GET live?alert=`, `GET replay?alert=` (replay requires `alert`, otherwise 422).

- [ ] **Step 1: Write the failing tests:** the officer `live` response equals the admin web `live` response (JSON) for the sample drill; replay without `alert` returns 422.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `OfficerCampus3dTest` and `tests/Feature/Admin/Campus3dTest.php`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officer 3D live and replay endpoints`.

### Task 8: Realtime `officers` channel and events

**Files:**
- Modify: `routes/channels.php`: `Broadcast::channel('officers', fn (User $u) => $u->is_active && $u->role->canManageIncidents())`.
- Modify: `app/Events/SosUpdated.php`: `broadcastOn()` returns `[new PrivateChannel("sos.{$id}"), new PrivateChannel('officers')]`.
- Create: `app/Events/ReportSubmitted.php` (`broadcastAs` `report.submitted`, payload `{id, hazard_type, place, matching}`), dispatched in `Api\HazardReportController::store` after save.
- Create: `app/Events/CheckInUpdated.php` (`broadcastAs` `checkin.updated`, payload `{alert_id}`), dispatched in `Api\SafetyController::checkIn` after `updateOrCreate`.
- Test: `tests/Feature/Officer/OfficerRealtimeTest.php`

- [ ] **Step 1: Write the failing tests:**
  - channel auth for `private-officers`, following the existing broadcast-auth test (re-require the channels and `app('auth')->forgetGuards()` between tokens): officer and admin return 200; student and inactive officer return 403.
  - `SosUpdated::broadcastOn()` includes `private-officers`.
  - Submitting a report dispatches `ReportSubmitted` with no `reporter` key in `broadcastWith()`.
  - A check-in dispatches `CheckInUpdated`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `OfficerRealtimeTest`, `tests/Feature/Reports` and `tests/Feature/Safety`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): officers realtime channel, report and check-in events`.

### Task 9: Push to officers

**Files:**
- Create: `app/Jobs/SendOfficerPush.php`
- Modify: `app/Jobs/SendAlertPush.php`: extract the Expo POST and dead-token cleanup into `App\Support\ExpoPush::send(Collection $tokens, string $title, string $body, array $data): array`, which returns the tickets. `SendAlertPush` keeps its `alert_notifications` logging.
- Modify: `app/Http/Controllers/Api/SosController.php` (after the `SosRaised` notify), `app/Console/Commands/Simulate.php` (both SOS spots) and `app/Support/ReportClusters.php` (after `UnverifiedAlertRaised`): dispatch the job.
- Test: `tests/Feature/Officer/OfficerPushTest.php`

**Interfaces:**
- `new SendOfficerPush(string $title, string $body, array $data)`. Recipients: the device tokens of active users with role `safety_officer` or `admin`.
- **New SOS:**
  - title: "SOS: {place}" (place from `Places::label`, or "location not shared");
  - body: the first 80 characters of the message, or "Needs help";
  - data: `{sos_id}`.
- **Unverified alert:**
  - title: "Unverified alert: {Hazard} at {building}";
  - body: the alert message;
  - data: `{alert_id}`.

- [ ] **Step 1: Write the failing tests:**
  - a student's SOS queues `SendOfficerPush` with `data.sos_id` (`Bus::fake`);
  - running the job with `Http::fake('exp.host/*')` posts only to officer and admin tokens, not student tokens;
  - the 3rd matching report queues it with `alert_id`;
  - `SendAlertPush` tests (`AlertDeliveryTest`) still pass.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `OfficerPushTest`, `tests/Feature/Incidents/AlertDeliveryTest.php` and `SimulateTest`. Expected: PASS.
- [ ] **Step 5: Checkpoint commit:** `feat(api): push new SOS and unverified alerts to officers`.

### Task 10: API README and full verification

**Files:**
- Modify: `api/README.md`: replace the stock Laravel README with a short description of the EvacuAI API, how to run the tests, and the officer endpoint table (method, path, purpose) copied from the spec.

- [ ] **Step 1: Run the full suite:** `php artisan test`. Expected: all pass (count higher than the previous 115).
- [ ] **Step 2: Run** `vendor\bin\phpstan analyse --memory-limit=1G --no-progress` (expect `[OK] No errors`) and `vendor\bin\pint --test` (expect pass; otherwise run `vendor\bin\pint` and re-test).
- [ ] **Step 3: Smoke-test on the Docker stack:**
  1. `docker compose -f docker/compose.yml up -d --build app`
  2. Sign in through `POST /api/auth/login` as `safety_officer@evacuai.test` and call `GET /api/officer/sos?open=1` with the token. Expected: 200 with SOS #4 if it is still open.
  3. Do the same as `student@evacuai.test`. Expected: 404.
- [ ] **Step 4: Checkpoint commit:** `docs(api): officer endpoint reference`.
