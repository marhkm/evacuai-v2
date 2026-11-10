# Testers' report, Part 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- the SOS always ends up with a location: from the schedule (confirmed), picked, or scanned;
- every check-in is kept and is only replaced after the user confirms;
- "I need help" is gone;
- safe zones show live counts against an admin-set capacity, and suggest another zone when one is full.

**Architecture:**
- **API:**
  - two migrations;
  - a `SafeZones` support class (replacing `SafetyBoard::occupancy`);
  - stricter check-in and SOS endpoints;
  - a Filament page for capacity.
- **App:** a shared `loadEstimate`, with the SOS and Check-in screens reworked.
- **Command Center:** only the occupancy bars change.

**Tech Stack:**
- Laravel 13 + Filament 5 + Pest;
- Expo SDK 57 + Jest;
- React + Vitest;
- Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-testers-report-part2-design.md`

## Global Constraints

- **Copy:**
  - "We sent your class room: {place}. Are you there?" with buttons "Yes" / "No, change";
  - "Location unknown. Pick your room or scan a sticker so officers can find you.";
  - "You already checked in at {place} at {time}. Update your status?" with "Update" / "Keep";
  - zone rows: "{name} · {count} of {capacity}", or "{name} · {count} here" without a capacity, plus "Full";
  - "{zone} is full. {other} has space.";
  - buttons "Scan safe zone QR" and "I'm safe (not at a safe zone)".
- **Zone names:** "Open ground" (BE Field) and "Off-campus assembly area" (unchanged).
- **Times:** shown in Asia/Manila (reuse `timeLabel` from `mobile/src/lib/chatTime.ts`).
- **Privacy:** location still goes to the server only during an alert (`updateWhereabouts` rules unchanged). Check-in
  history only during an alert.
- **Docker:** the user asks before Docker starts. API Pest runs with Herd PHP against Docker Postgres. Write Pest tests
  first, and run them in one Docker pass when the user allows.
- **Commits:** only when the user asks, with no AI attribution. `docs/manuscript/` is never staged.

## Review Focus

1. **The schedule estimate is stale** (a class ended 2 h ago, or a manual pick made since). The SOS must not claim the
   class room. `loadEstimate` keeps the estimator's existing rules, and the banner shows only when
   `location_source === 'schedule'` (Task 5).
2. **A student scans a non-safe-zone sticker on Check-in.** They are refused with the existing message, and nothing is
   written (Task 4).
3. **Two quick taps on a zone** must not create two history rows plus a 409 loop. The second tap gets 409 and the
   prompt (Task 3 API; Task 4 disables buttons while busy).
4. **A capacity of 0, or blank.** 0 means full immediately; blank means no limit and no "Full" (Task 1).
5. **`PATCH /api/sos/{id}/location` from another student, or on a resolved SOS** → 404/422, no change (Task 2).

---

### Task 1: Safe zones, capacity, and the Open ground name (API + data)

**Files:**
- Create:
  - `api/database/migrations/2026_10_29_100000_add_capacity_to_assembly_points.php`;
  - `api/app/Support/SafeZones.php`;
  - `api/app/Filament/Pages/SafeZones.php` (+ its blade view if the existing Filament pages use one: copy
    `QrStickers`' pattern).
- Modify:
  - `api/app/Support/SafetyBoard.php` (delete `occupancy`; callers use `SafeZones`);
  - `api/app/Http/Controllers/Officer/SafetyController.php`;
  - `api/app/Http/Controllers/Api/CampusSnapshotController.php` (assembly nodes' capacity/occupancy);
  - `campus-data/uclm/BE/floor-1.json` (`AP_Field` gets `"name": "Open ground"`);
  - regenerate snapshots with `npm run snapshots`.
- Test: create `api/tests/Feature/Safety/SafeZonesTest.php`.

**Interfaces:** Produces:
- `SafeZones::forAlert(?int $alertId): list<array{node_id: string, name: string, count: int, capacity: ?int, full: bool}>`,
  in `assembly_points.id` order, with names via `Places::label(null, null, $node)`;
- `SafeZones::suggest(?int $alertId, string $except): ?array`, the first non-full zone other than `$except`;
- the officer safety JSON's `occupancy` items gain `capacity` and `full`;
- the snapshot node fields `capacity` and `occupancy` for assembly nodes come from `SafeZones` when
  `assembly_points.capacity` is set.

- [ ] **Step 1: Write the failing tests:**
  - **counts, capacity, full:** capacity 2 with 2 safe check-ins → `full: true`; capacity null → `full: false`;
    capacity 0 → `full: true`.
  - **suggest:** with Open ground full, `suggest` returns the off-campus zone.
  - **a re-seed keeps capacity:** set capacity 300, run `CampusSeeder` again → still 300.
  - **the snapshot:** capacity 300 with 1 check-in → the Field node has `capacity 300, occupancy 1`.
  - **the admin page:** an admin sees Open ground and saves capacity 300 (Livewire test, guard `admin`), and it is
    logged with `Activity`. A safety officer is forbidden.
  - **the officer API:** `GET /api/officer/safety` occupancy items include `capacity` and `full`.
- [ ] **Step 2:** Implement. The page lists zones with a numeric input (min 0, nullable) per row and one Save button.
- [ ] **Step 3:** Run `npm run snapshots`, then check that `campus-data/uclm.snapshot.json` has "Open ground".
  - Expected: `npx vitest run packages` passes (snapshot tests).

### Task 2: SOS location API

**Files:**
- Create: `api/database/migrations/2026_10_29_100100_add_room_and_source_to_sos_alerts.php`.
- Modify:
  - `api/app/Http/Controllers/Api/SosController.php` (`store`, a new `location`, `payload`);
  - `api/app/Models/SosAlert.php` (`@property`);
  - `api/routes/api.php`.
- Test: `api/tests/Feature/Safety/SosAndCheckInTest.php`.

**Interfaces:** Produces:
- `POST /api/sos {node_id?, room_id?, location_source?, message?}`. When only `room_id` is given, the building and level
  come from the room;
- `PATCH /api/sos/{sos}/location {node_id? | room_id?, location_source: qr|manual|schedule}` → `{sos}`. The sender
  only (404 otherwise), the SOS must be open (422 "This SOS is closed.");
- `payload()` adds `location_source`, and `place` includes the room.

- [ ] **Step 1: Write the failing tests:**
  - a room pick without a node keeps the room: place "R201", `location_source` "manual";
  - PATCH by the sender moves the place and dispatches `SosUpdated`;
  - PATCH by another student → 404;
  - PATCH on a resolved SOS → 422;
  - confirming (same node, source manual) changes `location_source` from schedule to manual.
- [ ] **Step 2:** Implement, and run the API checks in the Docker pass.

### Task 3: Check-in history API, with no needs_help

**Files:**
- Create: `api/database/migrations/2026_10_29_100200_create_check_ins_table.php`.
- Modify: `api/app/Http/Controllers/Api/SafetyController.php`.
- Test: `api/tests/Feature/Safety/SosAndCheckInTest.php`.

**Interfaces:** Produces:
- `POST /api/check-in {node_id?, source: qr|list|gps|none, replace?: bool}`:
  - 409 `{error: 'already_checked_in', place: ?string, checked_in_at: string, message}` when a current check-in exists
    and `replace` is not true;
  - 422 for `status: needs_help`;
  - on success: `{check_in, zones, suggest: ?zone}`.
- `GET /api/check-in` → `{check_in}`, where `check_in` gains `history: list<{place: ?string, at: string}>` (newest
  first) and `zones`.
- The `CheckInUpdated` broadcast is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - first check-in → 200 and one `check_ins` row;
  - a second without replace → 409 with `place` "Open ground", and still one row;
  - a second with `replace: true` → 200, two rows, and the current status updated;
  - `needs_help` → 422;
  - a non-zone node → 422 (the existing message);
  - a full zone → `suggest.name` is "Off-campus assembly area";
  - `GET` → history newest first.
- [ ] **Step 2:** Implement. The current status row and the history row are written in one DB transaction. Run in the
  Docker pass.

### Task 4: Check-in screen (phone)

**Files:**
- Modify: `mobile/src/app/checkin.tsx`.
- Test: `mobile/src/__tests__/safety.test.tsx`.

**Interfaces:** Consumes Task 3 (`zones`, `history`, 409, `suggest`, `replace`) and the `confirm` from
`@/lib/confirm`.

- [ ] **Step 1: Write the failing tests (jest):**
  - no "I need help" button;
  - zone rows read "Open ground · 2 of 300" and "Off-campus assembly area · 0 here";
  - pressing a zone posts `{node_id, source: 'list'}`;
  - a scan posts `source: 'qr'`;
  - a 409 → `confirm` called with "You already checked in at Open ground at 2:41 PM. Update your status?". Confirm →
    re-post with `replace: true`; Keep → no re-post;
  - a response with `suggest` → "Open ground is full. Off-campus assembly area has space.";
  - history lists earlier check-ins.
- [ ] **Step 2: Implement.** Buttons are disabled while busy. The existing GPS suggestion stays, with `source: 'gps'`.
- [ ] **Step 3:** Run `cd mobile && npx jest --runInBand safety`, then `npx tsc --noEmit`, then `npx eslint src`.
  Expected: all pass.

### Task 5: SOS location on the phone

**Files:**
- Modify:
  - `mobile/src/lib/whereabouts.ts` (add `loadEstimate`);
  - `mobile/src/app/route.tsx` (use it);
  - `mobile/src/app/sos.tsx`.
- Test: `mobile/src/__tests__/safety.test.tsx`, `mobile/src/__tests__/route.test.tsx` (stays green).

**Interfaces:**
- **Produces:** `loadEstimate(token: string | null, alertActive: boolean): Promise<Estimate | null>`. It restores
  today's saved location, fetches `/api/me/schedule/now`, and applies the class exactly as `route.tsx` does today.
- **Consumes:** Task 2 (`room_id`, `location_source`, PATCH).

- [ ] **Step 1: Write the failing tests (jest):**
  - **a class in session:** with no pick, sending posts `location_source: 'schedule'` and the class room. The sent
    screen shows the banner. Yes → PATCH with `location_source: 'manual'`. No, change → the chooser; pick R201 →
    PATCH `room_id`.
  - **no class and no pick:** the SOS is still sent (`node_id`/`room_id` null), the sent screen shows "Location
    unknown…" with the chooser, and a pick → PATCH.
  - **a picked room without a node** posts `room_id`.
- [ ] **Step 2:** Implement. The pre-send screen still shows "Your location: …", and also "(from your class
  schedule)" when the source is the schedule.
- [ ] **Step 3:** Run `cd mobile && npx jest --runInBand`, then `npx tsc --noEmit`, then `npx eslint src`. Expected:
  all pass.

### Task 6: Command Center occupancy bars

**Files:**
- Modify: `command/src/screens/Safety.tsx`.
- Test: `command/src/screens/Safety.test.tsx`.

- [ ] **Step 1:** Write the failing test: occupancy
  `[{name: 'Open ground', count: 300, capacity: 300, full: true}, {name: 'Off-campus assembly area', count: 4, capacity: null, full: false}]`
  shows "300 / 300", "Full", and "4".
- [ ] **Step 2:** Implement, then run `npm test -w command` and `npx tsc --noEmit -p command`. Expected: all pass.

### Task 7: Docs, browser test, full run (ask before Docker)

**Files:**
- Modify:
  - `docs/WALKTHROUGH.md` (the check-in and SOS steps: the banner, zones, the update prompt; the admin Safe zones
    page);
  - `e2e/app.spec.ts`.
- Then run `npm run manual`.

- [ ] **Step 1: Write `e2e/app.spec.ts` › `check in at a safe zone, then asked before updating`.**
  - The demo drill must be active. Skip with a clear message if `GET /api/alerts` has none.
  - Sign in as the student, open Check in, press "Open ground · …" → "You checked in safe at Open ground"; press it
    again → the browser dialog (web `confirm` uses `window.confirm`) contains "Update your status?".
- [ ] **Step 2:** Ask the user to open Docker. Then run:
  1. `docker compose -f docker/compose.yml up -d --build`;
  2. Pest via Herd (`php artisan test`), PHPStan, Pint;
  3. `npm test -w command`;
  4. mobile jest;
  5. root vitest;
  6. `E2E_CHANNEL=msedge npm run e2e`.

  Expected: all pass.
- [ ] **Step 3:** Final review (a fresh reviewer), fixes, report. Commit and push only when the user asks.
