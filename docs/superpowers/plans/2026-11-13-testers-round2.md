# Testers' Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students upload their own class schedule, SOS sends on one tap with location attached by itself, the Check-in
QR scanner closes properly, and every password field can be shown.

**Architecture:**
- **Server (Laravel):** owns schedule parsing (one `ScheduleImport` class), the class-now lookup (one `ClassNow`
  class), and GPS → building (one `BuildingLocator` class, point in polygon on admin-entered corners).
- **Phone (Expo):** sends the SOS first and adds location afterwards; it never waits.
- **UI-only changes:** the scanner fix and show-password stay inside the shared `LocationChooser` and `Field`
  components.

**Tech Stack:**
- Laravel 13, Filament 5, Pest, `openspout/openspout` (new, for .xlsx and .csv);
- Expo SDK 57, `expo-document-picker` (new), `expo-location`, Jest;
- React Command Center with Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-testers-round2-design.md`

## Global Constraints

- **Running tests:**
  - Pest runs with Herd PHP in PowerShell (`cd api; php artisan test`).
  - If port 5432 belongs to another project's DB, start a throwaway DB and set `$env:DB_PORT='5433'`:
    `docker run -d --rm --name evacuai-testdb -p 127.0.0.1:5433:5432 -e POSTGRES_USER=evacuai -e POSTGRES_PASSWORD=evacuai -e POSTGRES_DB=evacuai_test postgres:18-alpine`
- **Code checks:** Pint and PHPStan stay clean (`vendor\bin\pint app tests`,
  `vendor\bin\phpstan analyse --memory-limit=1G`). Command Center: `npx vitest run` and `npx tsc --noEmit -p .`.
  Mobile: `npx jest`, `npx tsc --noEmit`, `npx eslint .`.
- **Install mobile packages** with `npx expo install`.
- **Copy:** plain English; the button labels are exactly as written in this plan.
- **Privacy (RA 10173):** GPS coordinates are sent only for an open SOS and are never stored. Only the resulting
  building is saved.
- **Never block SOS:** no network call or GPS read happens before `POST /api/sos`.
- **Commits:** commit only when the user asks. No AI attribution lines.

## Review Focus

1. **Excel times:** a schedule typed in Excel stores times as day fractions (0.375 = 09:00), and an Excel export
   sometimes makes them "9:00 AM". Both must import (Task 1 test).
2. **Accuracy edge:** a GPS fix right on a building's edge with poor accuracy must not pick the building next door.
   Over 40 m is ignored, and inside means the point is in the polygon (Task 2 test).
3. **Leftover estimate:** a last-known estimate with only building and floor (after a barometer floor change) must
   still reach officers as approximate, not be dropped (Task 2 test).
4. **Double tap:** tapping SOS twice quickly must not create two alerts. The server returns the open one, and the
   phone ignores taps while sending (Task 3 test).
5. **Scanner mid-scan:** leaving the Check-in screen while the camera is open must release the camera (Task 5 test).

---

### Task 1: Student schedule upload (API) and removing the admin import

**Files:**
- Create: `api/app/Support/ScheduleImport.php`
- Create: `api/app/Support/ClassNow.php`
- Modify: `api/app/Http/Controllers/Api/ScheduleController.php` (`now()` uses `ClassNow`; add `index`, `upload`,
  `clear`, `templateLink`, `template`)
- Modify: `api/routes/api.php`
- Delete: `api/app/Filament/Pages/ImportSchedules.php`, its blade view and its test (find them with
  `grep -rl ImportSchedules api`)
- Test: `api/tests/Feature/Schedule/StudentScheduleTest.php`

**Interfaces:**
- **Produces:**
  - `ScheduleImport::parse(string $path, string $extension): array{rows: list<array{subject: string, room_id: string, days: string, time_start: string, time_end: string}>, problems: list<string>}`
    - Reads with OpenSpout (`Reader\XLSX\Reader` or `Reader\CSV\Reader`), first sheet, first row = header.
    - Keeps the old room-code key and `ClassDays::valid` rules.
    - Times: accepts `H:MM`, `HH:MM`, `h:mm AM/PM`, a `DateTimeInterface` cell, or a numeric day fraction; outputs
      `HH:MM`.
    - Problems read "Row N: unknown room code X" / "invalid days X" / "invalid time range". The header problem
      reads "The first row must be: subject, room_code, days, time_start, time_end".
    - More than 60 rows gives "Too many rows (60 at most)."
  - `ClassNow::for(int $userId): ?object` (subject, days, time_start, time_end, room_id, building, level, room_name):
    the query moved out of `ScheduleController::now`.
- **Routes** (auth:sanctum):
  - `GET /api/me/schedule` returns `{classes: [...]}`;
  - `POST /api/me/schedule` returns 200 `{classes}` or 422 `{message, errors: {file: [problems…]}}`;
  - `DELETE /api/me/schedule` returns 204;
  - `GET /api/me/schedule/template-link` returns `{url}` (5-minute signed URL).
- **Signed route** (no token): `GET /api/schedule-template` (name `schedule.template`, middleware `signed`) streams
  `evacuai-schedule-template.xlsx`. It has a **Schedule** sheet (header plus the example row
  `Physics 1, A-61, MWF, 09:00, 10:30`) and a **Rooms** sheet (`room_code, room, building, floor`) for every room
  with a code.

- [ ] **Step 1: Write the failing tests** in `StudentScheduleTest.php`, each building its file with OpenSpout's
  writer into a temp path:
  - `it('uploads an xlsx and replaces the old schedule')`: an old row exists; the upload has 2 valid rows →
    200, `classes` has 2 entries, and the old one is gone;
  - `it('reads a csv the same way')`;
  - `it('reads Excel times stored as numbers or with AM/PM')`: `0.375` and `"1:30 PM"` → `09:00` and `13:30`;
  - `it('rejects the whole file when one row is bad, saving nothing')`: 422 with `errors.file` containing
    `"Row 3: unknown room code ZZ-9"`, and the schedules count is unchanged;
  - `it('refuses more than 60 rows and other file types')`: 61 rows → 422; a `.pdf` → 422;
  - `it('never touches another user's classes')`;
  - `it('clears the schedule')`;
  - `it('gives a signed template link with both sheets')`: follow the URL → 200, and reading it back gives sheet
    names `['Schedule', 'Rooms']`; the same URL without its signature → 403;
  - `it('no longer has the admin import page')`: `get('/admin/import-schedules')` as an admin → 404.

- [ ] **Step 2: Run** `php artisan test tests/Feature/Schedule/StudentScheduleTest.php`. Expected: FAIL (routes
  missing).
- [ ] **Step 3:** `composer require openspout/openspout`; implement `ScheduleImport`, `ClassNow`, the controller
  methods and routes; delete the admin page, its view and its test.
- [ ] **Step 4: Run** the file, then the full Pest suite. Expected: all pass, including the existing
  `PathsAndScheduleTest` for `/api/me/schedule/now`.

### Task 2: SOS location on the server (class first, GPS building, approximate last known)

**Files:**
- Create: `api/database/migrations/2026_11_13_000000_add_gps_corners_to_buildings.php` (`buildings.gps_corners`
  json, nullable)
- Create: `api/app/Support/BuildingLocator.php`
- Create: `api/app/Filament/Pages/BuildingGps.php`, `api/resources/views/filament/pages/building-gps.blade.php`
- Modify: `api/app/Http/Controllers/Api/SosController.php` (`store`, `location`, `PLACE_RULES`, `place`)
- Modify: `api/database/seeders/CampusSeeder.php` only if its upsert would overwrite `gps_corners` (it must not:
  leave the column out of the update list)
- Test: `api/tests/Feature/Sos/SosLocationTest.php`, `api/tests/Feature/Admin/BuildingGpsTest.php`

**Interfaces:**
- **Consumes:** `ClassNow::for(int $userId)` (Task 1).
- **Produces:**
  - `BuildingLocator::at(float $lat, float $lng, float $accuracy): ?string`, the building id:
    - null when accuracy > 40;
    - otherwise the first building whose `gps_corners` polygon contains the point (ray casting on lng/lat);
    - buildings without corners are skipped.
  - `location_source` values: `qr | manual | schedule | gps | estimate`. `estimate` is the spec's
    "approximate (last known)".
  - `PLACE_RULES` adds:
    - `building_id` (nullable, exists:buildings,id) and `level` (nullable integer), used only when there is no
      node or room;
    - `lat`, `lng`, `accuracy` (nullable numeric; lat between -90 and 90, lng between -180 and 180, accuracy ≥ 0).
- **`store` order:**
  1. `qr`/`manual` as sent;
  2. else `ClassNow::for($user->id)` → that room, source `schedule`;
  3. else the sent estimate (node, room, or building plus level), source `estimate`;
  4. else no place.
- **`location`:** with `lat/lng/accuracy` and no node/room, a building found by `BuildingLocator` replaces the
  place only if the current source is null or `estimate`. It sets building only (`level` null), source `gps`.
  The coordinates are never saved. Without coordinates it behaves as today.
- **Admin page "Building GPS"** (navigation group like Report rules): one textarea per building,
  "GPS corners, one `lat, lng` per line (3 to 8)", with the hint "In Google Maps, right-click each corner of the
  building and click the coordinates to copy them."
  - Saving validates the count and the ranges.
  - Activity `building_gps_changed`.

- [ ] **Step 1: Write the failing tests** in `SosLocationTest.php`:
  - `it('uses the class in session when the student sends no exact place')`: schedule row now →
    `location_source` `schedule`, and `room_id` is the class room;
  - `it('keeps a scanned or picked place over the class')`;
  - `it('sends an approximate last known place, even building and floor only')`: body
    `{building_id: 'DEMO', level: 2, location_source: 'estimate'}` → saved with source `estimate`;
  - `it('sets the building from GPS when there is no class')`: corners around (10.3270, 123.9500); PATCH with
    accuracy 15 → `building_id` `DEMO`, `level` null, source `gps`, and no lat/lng column exists on
    `sos_alerts`;
  - `it('ignores GPS worse than 40 m, outside every building, or when a better place is known')`: three cases,
    the place unchanged each time;
  - `it('sends the SOS with no location at all')`: 201, `place` null.

  In `BuildingGpsTest.php`:
  - `it('saves corners and refuses fewer than 3 or bad numbers')`;
  - `it('keeps the corners when the campus is seeded again')`.

- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3:** implement the migration, `BuildingLocator`, the controller changes and the page.
- [ ] **Step 4: Run** both files and the full Pest suite, Pint and PHPStan. Expected: green.

### Task 3: One-tap SOS on the phone

**Files:**
- Create: `mobile/src/lib/sendSos.ts`
- Modify: `mobile/src/app/index.tsx` (the SOS button sends, then `router.push('/sos')`)
- Modify: `mobile/src/app/sos.tsx` (remove the pre-send form when there's no open SOS; show the 10-second cancel;
  keep the chat, the location confirm and changing the place)
- Test: `mobile/src/__tests__/sos.test.tsx` (extend), `mobile/src/__tests__/home.test.tsx` (or wherever the home
  screen is tested: `grep -l "EVACUATE" mobile/src/__tests__`)

**Interfaces:**
- **Consumes:** `lastEstimate()` and `loadEstimate()` from `@/lib/whereabouts`; server rules from Task 2.
- **Produces:**
  - `sendSos(token: string): Promise<Sos>`:
    - builds the body from `lastEstimate()` with no awaits before the POST;
    - `location_source` is `qr`/`manual` only when the estimate's confidence is `exact`, otherwise `estimate`;
    - sends `node_id`, `room_id`, `building_id`, `level`;
    - after the POST resolves, if the returned `location_source` is not `qr`/`manual`/`schedule`, it fires a
      background GPS read (`getCurrentPositionAsync`, accuracy Balanced, raced against a 3-second timeout, skipped
      without permission) and PATCHes `/api/sos/{id}/location` with `{lat, lng, accuracy}`;
    - errors in the GPS step are swallowed.
  - **Home screen:**
    - the SOS button shows busy while sending and ignores taps while busy;
    - on failure it shows the Message "Couldn't send. Tap to retry";
    - on success it calls `success()` haptics and navigates.
  - **SOS screen:** while `now - created_at < 10 s` and the status is `pending`, it shows the button
    **Cancel (sent by mistake)**, which calls the existing cancel endpoint. After 10 s, the existing
    "Cancel SOS (I'm safe now)" stays.

- [ ] **Step 1: Write the failing tests:**
  - `it('sends the SOS on one tap and opens the chat')`: one `POST /api/sos` call before any location call;
    router pushed `/sos`;
  - `it('ignores a second tap while sending')`;
  - `it('shows retry when sending fails')`;
  - `it('sends a GPS fix after the SOS when there is no class')`: the PATCH body has lat/lng/accuracy;
  - `it('offers Cancel (sent by mistake) for 10 seconds only')` (jest fake timers).
- [ ] **Step 2: Run** `npx jest sos home`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4: Run** the full jest suite, tsc and eslint. Expected: green.

### Task 4: Class schedule on the Profile page

**Files:**
- Modify: `mobile/src/app/profile.tsx` (new section, students and staff only: hide it for `safety_officer` and
  `admin` roles)
- Create: `mobile/src/components/ScheduleSection.tsx`
- Test: `mobile/src/__tests__/schedule.test.tsx`

**Interfaces:**
- **Consumes:** the Task 1 routes.
- **Produces:** `<ScheduleSection token={string} />` with:
  - a list of `subject · room_code days time_start–time_end`, or "No schedule uploaded";
  - **Download template**: fetches `template-link`, then `Linking.openURL(url)`;
  - **Upload schedule**: `DocumentPicker.getDocumentAsync({ type: [xlsx mime, 'text/csv', 'text/comma-separated-values'] })`
    → multipart `file`; on 422 it lists each problem;
  - **Remove schedule**: confirm "Remove your class schedule?", then DELETE.

- [ ] **Step 1:** `npx expo install expo-document-picker`.
- [ ] **Step 2: Write the failing tests:**
  - `it('lists classes or says none uploaded')`;
  - `it('uploads a picked file and shows the new list')`;
  - `it('shows each row problem from the server')`;
  - `it('opens the signed template link')`;
  - `it('removes the schedule after confirming')`.
- [ ] **Step 3: Run**, see FAIL; implement; run the full jest suite, tsc and eslint. Expected: green.

### Task 5: QR scanner closes

**Files:**
- Modify: `mobile/src/components/LocationChooser.tsx`
- Test: `mobile/src/__tests__/safety.test.tsx` (extend)

**Interfaces:**
- **Produces:**
  - the scan button label is `Close scanner` while `mode === 'scan'`, and pressing it sets `mode` to `'none'`;
  - a **Close** button sits over the camera;
  - `useFocusEffect(useCallback(() => () => setMode('none'), []))` closes it on blur or leaving;
  - a successful scan already closes it.

- [ ] **Step 1: Write the failing tests:**
  - `it('toggles the camera with the scan button')`;
  - `it('closes the camera with Close')`;
  - `it('closes the camera when leaving the screen')` (unmount → no `CameraView` rendered on remount).
- [ ] **Step 2: Run**, see FAIL; implement; run jest. Expected: green.

### Task 6: Show password (phone and Command Center) and the SOS source for officers

**Files:**
- Modify: `mobile/src/components/ui.tsx` (`Field`)
- Modify: `command/src/screens/SignIn.tsx`
- Modify: `command/src/screens/Sos.tsx` (source text next to the place)
- Test: `mobile/src/__tests__/ui.test.tsx` (create if missing), `command/src/screens/SignIn.test.tsx` (create),
  `command/src/screens/Sos.test.tsx` (extend)

**Interfaces:**
- **Produces:**
  - **Phone `Field`:** when `secureTextEntry` is set, it renders a **Show** / **Hide** text button inside the
    field (`accessibilityLabel` "Show password" / "Hide password") that switches `secureTextEntry`.
  - **Command Center:** the same on the password input (`type` password ↔ text).
  - **`sourceLabel(source: string | null): string | null`** in `command/src/screens/Sos.tsx`:
    - `schedule` → "from class schedule"
    - `gps` → "from GPS"
    - `estimate` → "approximate (last known)"
    - `qr` → "scanned sticker"
    - `manual` → "picked by student"
    - `null` → null

    It's shown after the place as "{place} · {label}".
  - **Admin:** Filament already reveals passwords (`arePasswordsRevealable` defaults to true). No change; Step 1
    checks it.

- [ ] **Step 1: Write the failing tests:**
  - `it('shows and hides the password')` (phone and Command Center);
  - `it('says where the SOS location came from')`;
  - **Pest:** `it('lets admins reveal the password on sign-in')`: `filament()->getPanel('admin')->arePasswordsRevealable()`
    is true.
- [ ] **Step 2: Run**, see FAIL (the Pest one should pass straight away: it pins the default); implement; run
  vitest, tsc, jest and eslint. Expected: green.

### Task 7: Docs and the whole-stack check

**Files:**
- Modify: `docs/WALKTHROUGH.md`:
  - **S-section:** upload a schedule; one-tap SOS with Cancel; scanner closes; show password;
  - **A-section:** remove the schedule-import step and add **Building GPS**;
  - update the results table.
- Modify: `docs/SETUP-GUIDE.md` if it mentions the admin import.
- Rebuild: `npm run manual`.
- Modify: `e2e/app.spec.ts` (the SOS flow: one tap now; show password).

- [ ] **Step 1:** update the docs and run `npm run manual`.
- [ ] **Step 2:** update the e2e specs. When the user has the EvacuAI Docker stack running, run
  `E2E_CHANNEL=msedge npx playwright test`. Expected: all pass. If the stack is down, say so rather than skipping
  silently.
- [ ] **Step 3:** run every suite (Pest, PHPStan, Pint, vitest + tsc, jest + tsc + eslint) and record the counts in
  `.superpowers/sdd/2026-11-13-testers-round2/progress.md`.
- [ ] **Step 4:** ask the user to commit and push, then to redeploy (the server update also adds the Building GPS
  page), then build a new APK.
