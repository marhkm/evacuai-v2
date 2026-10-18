# Phase 1: Officer API and realtime

Part of the approved plan: Command Center, Responder mode, real floor plans, Signage redesign and the docs split. This phase is backend only. It gives the web Command Center (Phase 3) and Responder mode (Phase 4) one API for everything a safety officer does. Today all of that exists only as Filament actions.

## Goals

- Every officer action is available as a JSON endpoint under `/api/officer/*`, open to Safety Officer and Admin roles only.
- The logic lives in one place. Filament (until Phase 6 removes the officer pages) and the API both call the same service methods.
- Officers get live updates for SOS, reports and check-ins, plus push notifications for a new SOS or an unverified alert.
- Behavior stays exactly as it is now: same rules, same rate limits, same activity log entries, same CSV.

## Non-goals

- No UI in this phase.
- No changes to the student API (`/api/*`) beyond broadcasting the extra events.
- Users, Activity log, Import Schedules and QR Stickers stay in Filament (admin-only, Phase 6).

## Access control

- Route group: `Route::prefix('officer')->middleware(['auth:sanctum', 'officer'])`.
- New middleware `EnsureOfficer` returns **404** unless `$request->user()->role->canManageIncidents()` and `is_active`. That matches the existing `SosController` pattern: unknown to non-officers, no 403 hint.
- Sanctum serves both callers:
  - **Command Center (Phase 3):** same-origin SPA cookie session. Add `/command` to Sanctum `stateful` domains, using the existing `sanctum.php`.
  - **Responder mode:** the existing bearer tokens.
- Mutating endpoints keep throttles (`throttle:60,1,officer`); messages use `throttle:30,1,sos-chat` as today.

## Service classes (`api/app/Support/`)

The logic moves out of the Filament closures. Each method is the single implementation, logs activity and fires the existing model and events.

| Class / method | Moved from | Behavior |
|---|---|---|
| `AlertActions::broadcast(User $by, array $data)` | `CreateAlert::handleRecordCreation` | Creates an active, verified alert. Marks matching recent reports (`ReportClusters::recentReports`) verified and linked. Runs `AlertDispatcher::dispatch`. |
| `AlertActions::publish(Alert, User, string $message)` | AlertsTable `publish` | Draft → active + verified + `issued_by`/`issued_at`, then dispatch. |
| `AlertActions::discard(Alert)` | `discard` | Draft → retracted. |
| `AlertActions::confirm / resolve / retract(Alert)` | `confirm` / `resolve` / `retract` | Same updates and re-broadcast as `$change`. |
| `ReportActions::verify / dismiss / resolve(HazardReport, User)` | HazardReportsTable | Same status changes and `verified_by`. |
| `ReportSummary::for` | existing | Unchanged. |
| `EvacEdge` status update | Paths resource | Unchanged model hooks (`updated_by`, `CampusChanged`). |
| `SosAlert::acknowledge()` / `resolve()`, `SosMessage` create | existing model, SosChat page | Unchanged. |
| `SafetyBoard::people(Alert)` / `counts(Alert)` | `SafetyMonitor` query and `counts()` | The same SQL, returned as plain arrays. |
| `Campus3dData::live / replay` | `Campus3dController` | Without the web-session `authorizePanel` check. |

Filament pages call these methods in this phase, so there is only one behavior.

## Endpoints

All responses are JSON. Lists are newest first and paginated (`?page=`) where they can grow. Person-level data is limited to what the screen needs.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /officer/overview` | Dashboard numbers | Same as the `CampusOverview` widget, plus the active alert. |
| `GET /officer/alerts?status=` | Alerts list | Includes drafts, `verified`, `source`, `is_drill` and `translations`. |
| `POST /officer/alerts` | Broadcast | Validation as in `AlertForm`. Returns `needs_confirmation` with the reporter count when there are fewer than 3 matching reports, unless `confirm: true`. |
| `POST /officer/alerts/{alert}/publish` | Publish a draft | `{message}` |
| `POST /officer/alerts/{alert}/{discard|confirm|resolve|retract}` | Change status | 422 when the action doesn't apply to the current status. |
| `POST /officer/alerts/translate` | AI translation | `{message}` → `{ceb, fil, provider}`. 404 when no LLM is configured. |
| `GET /officer/alerts/{alert}/report.csv` | Drill report | Reuses `DrillReportController`. |
| `GET /officer/reports?status=` | Hazard reports | Adds `matching` (same-floor reporters in 10 min), place label and a `photo_url`. |
| `POST /officer/reports/{report}/{verify|dismiss|resolve}` | Review | |
| `POST /officer/reports/{report}/summary` | AI summary | 404 without an LLM. |
| `GET /officer/reports/{report}/photo` | Photo | Streams the private file (moved from the web route). |
| `GET /officer/paths?building=&level=` | Paths | Type, place label, status, `updated_by` name. |
| `PATCH /officer/paths/{edge}` | Set status | `{status: open|congested|blocked}` |
| `GET /officer/sos?open=1` | SOS list | Person name, place label, message, status, times. |
| `GET /officer/sos/{sos}` | One SOS with its messages | |
| `POST /officer/sos/{sos}/{acknowledge|resolve}` | | |
| `POST /officer/sos/{sos}/messages` | Chat | `{body}` |
| `GET /officer/safety?alert=` | Safety board | `{alert, counts:{safe,needs_help,unknown}, people:[{name, role, status, place, source, updated_at, phone}]}`. Phone is officer-only, as in today's monitor. |
| `GET /officer/feedback` | Feedback list and average | |
| `GET /officer/live?alert=` / `GET /officer/replay?alert=` | 3D data | Moved from `/admin/campus-3d/*`. The old web routes stay until Phase 6. |

## Realtime

**New private channel `officers`** in `routes/channels.php`: `fn (User $u) => $u->role->canManageIncidents() && $u->is_active`.

| Event (broadcastAs) | When | Payload |
|---|---|---|
| `SosUpdated` (`.sos.updated`) | already fires on SOS save **and on every new chat message** (`SosMessage::booted`) | Add `officers` to `broadcastOn()` beside `sos.{id}`. The payload stays `{id, status}`, and clients refetch the SOS. No new message event is needed. |
| `ReportSubmitted` (`.report.submitted`) | new hazard report | id, hazard, place, matching count. No reporter name in the broadcast. |
| `CheckInUpdated` (`.checkin.updated`) | check-in create or update | `{alert_id, counts}` only: clients refetch the board. |
| `AlertBroadcast`, `CampusChanged` | existing | Unchanged. Officers already receive them. |

**Broadcast auth:** the existing `/api/broadcasting/auth` (Sanctum) serves both clients.

## Push notifications to officers

- **New SOS:** a queued Expo push to the officers' `device_tokens` (`SendOfficerPush`, reusing the HTTP call in `SendAlertPush`):
  - title: "SOS: {place}";
  - body: the first 80 characters of the message;
  - data: `{sos_id}`.
- **Unverified alert (3-report rule):** a push titled "Unverified alert: {hazard} at {place}", with data `{alert_id}`.
- **Who gets it:** active officers with registered devices.
- **The existing in-dashboard notifications** (`SosRaised`, `UnverifiedAlertRaised`) stay as they are.

## Error handling

- **Validation:** 422 with field errors, the same format the app already reads in `ApiError.fieldError`.
- **Action not valid in the current state** (for example resolving a resolved alert): 422 with `{message}`.
- **Missing record, or a non-officer caller:** 404.
- **LLM endpoints:** return 503 `{message: 'No AI provider answered'}` when every provider fails.

## Testing (Pest, `tests/Feature/Officer/`)

- **Access:**
  - every route returns 404 for student, faculty, staff and an inactive officer, and 401 when unauthenticated;
  - officer and admin succeed.
- **Alerts:**
  - broadcast with and without `confirm`, and the reporter-count gate;
  - publish/discard a draft; confirm, resolve and retract;
  - `AlertBroadcast` dispatched and `SendAlertPush` queued (`Event::fake`, `Bus::fake`);
  - activity rows written.
- **Reports:** list `matching`, verify/dismiss/resolve, the photo stream, and summary 404 without an LLM.
- **Paths:** PATCH sets status and `updated_by`, and `CampusChanged` is fired.
- **SOS:**
  - list and show, acknowledge/resolve, chat message;
  - `SosUpdated` broadcast on both channels;
  - officer push queued on a new SOS (`Bus::fake([SendOfficerPush::class])`).
- **Safety board:** counts and people match `DrillStats::for` for the sample drill (`DemoDrillSeeder`).
- **Channels:** `officers` authorizes officer and admin, and refuses a student (same approach as the existing broadcast-auth test).
- **Unchanged behavior:** the existing Filament tests (`IncidentAdminTest`, `ExtrasTest`, `SosAndCheckInTest`) still pass, now going through the services.

## Rollout

- No database migration in this phase.
- The old Filament officer pages keep working, calling the services, until Phase 6.
- Docs are updated in Phase 7. An endpoint table goes into `api/README.md`, replacing the stock Laravel README.
