# Testers' report, Part 3: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hazard reports need a fresh in-app photo. Duplicates, location and a local AI check give officers signals;
reports auto-verify only under strict rules; repeat false reporters stop counting.

**Architecture:**
- **API:**
  - new `hazard_reports` columns, a dHash in `ReportPhoto`, a queued `CheckReportPhoto` job (Ollama native API);
  - a `ReportVerification` support class (independent reports, flagged users, auto-verify), and
    `ReportActions::rejectFalse`;
  - `CampusChanged` on verified changes;
  - two Filament touches: a Report rules page, and "Often false" with Clear on Users.
- **App:** the report screen is camera-only, with the photo required.
- **Command Center:** report signals and the new buttons.
- **Server:** the setup script enables Ollama.

**Tech Stack:**
- Laravel 13 + Filament 5 + Pest (`Http::fake`, `Queue::fake`/sync);
- Expo SDK 57 + `expo-image-picker` + Jest;
- React + Vitest;
- Playwright;
- Ollama `moondream`.

**Spec:** `docs/superpowers/specs/2026-11-10-testers-report-part3-design.md`

## Global Constraints

- **AI advises, never decides alone.** Auto-verify also needs ≥ threshold independent reports.
- **Photos never leave the server.** Ollama is reached only on the internal Docker network (`http://ollama:11434`).
- **Copy:**
  - "Photo (required)" and "Take photo";
  - "Take a new photo of the hazard (photos older than 10 minutes are not accepted).";
  - AI chips: "AI: looks like {hazard}", "AI: doesn't look like {hazard}", "AI: unclear", "AI: not available";
  - "Same photo as #{id}";
  - "Location matches", "Reporter was elsewhere ({place})", "Location unknown";
  - "Often false", "Auto-verified";
  - buttons "Verify", "Reject as false", "Dismiss", "Resolve";
  - confirm: "Count this as a false report by {name}?".
- **Numbers:**
  - photo age ≤ 10 min (≤ 1 min in the future);
  - dHash distance ≤ 6 within 24 h;
  - flag at ≥ 3 false rejections in 30 days;
  - AI timeout 60 s, `tries = 2`;
  - Ollama `mem_limit: 3g`.
- **Usage:** check the 5-hour limit (`get_usage`) before each task, and stop at 95% at a safe point.
- **Docker:** ask the user before starting Docker.
- **Commits:** only when asked, with no AI attribution. `docs/manuscript/` is never staged.

## Review Focus

1. **Two reports from the same student with different photos** count as ONE independent report (distinct
   reporters).
2. **A photo that is the same image recompressed or slightly cropped** must still be caught as a duplicate (distance
   ≤ 6). A genuinely different photo of the same corridor must not be.
3. **The AI job fails or times out:** the report stays pending with `unavailable`, and nothing loops.
4. **An officer rejects an auto-verified report:** the hazard leaves the maps (`CampusChanged`), and the reporter's
   false count rises only for "Reject as false".
5. **An old app version without `taken_at`** gets a clear 422, not a 500.

---

### Task 1: Schema, photo fingerprint, required fresh photo

**Files:**
- Create: `api/database/migrations/2026_11_10_000000_add_verification_to_hazard_reports.php`.
  - `hazard_reports` gains:
    - `photo_taken_at` timestamp nullable;
    - `photo_hash` char(16) nullable, indexed;
    - `duplicate_of` FK hazard_reports nullable;
    - `reporter_place` string(10) nullable;
    - `reporter_place_label` string nullable;
    - `ai_verdict` string(12) nullable;
    - `ai_note` string(200) nullable;
    - `auto_verified` boolean default false;
    - `dismiss_reason` string(10) nullable.
  - `users` gains `false_reports_cleared_at` timestamp nullable.
- Modify:
  - `api/app/Support/ReportPhoto.php` (store returns `{path, hash}`);
  - `api/app/Http/Controllers/Api/HazardReportController.php`;
  - `api/app/Models/HazardReport.php` (casts, `@property`).
- Test: `api/tests/Feature/Reports/ReportVerificationTest.php`, plus a fixture
  `api/tests/Fixtures/hazard.jpg` (generate with GD in the test: a few shapes).

**Interfaces:** Produces:
- `ReportPhoto::store(UploadedFile): array{path: string, hash: string}`;
- `ReportPhoto::dhash(\GdImage): string` (16 hex);
- `ReportPhoto::distance(string $a, string $b): int` (popcount of XOR);
- `POST /api/hazard-reports`:
  - requires `photo` and `taken_at`;
  - optional `at_building` and `at_level`;
  - sets `photo_taken_at`, `photo_hash`, `duplicate_of`, `reporter_place` and `reporter_place_label`.

- [ ] **Step 1: Write the failing tests:**
  - no photo → 422;
  - no `taken_at` → 422 (field `taken_at`);
  - `taken_at` 11 minutes ago → 422 with the copy;
  - the same image re-sent (re-encoded at JPEG quality 60) by another student → `duplicate_of` = the first id;
  - a different generated image → null;
  - `distance()` of identical hashes = 0;
  - reporter place:
    - `match` when the last location event is the same building and floor;
    - `elsewhere` with a label;
    - `unknown` with none.
- [ ] **Step 2:** Implement. The duplicate search covers reports created in the last 24 h with a non-null hash,
  comparing in PHP (small set). Pick the oldest within distance ≤ 6.
- [ ] **Step 3:** Run `php artisan test --filter=ReportVerification` (Docker pass). Expected: pass.

### Task 2: AI photo check job (local Ollama)

**Files:**
- Create: `api/app/Jobs/CheckReportPhoto.php`.
- Modify:
  - `api/config/services.php` (`ollama.vision_model` = `env('OLLAMA_VISION_MODEL', 'moondream')`, `ollama.base` =
    `OLLAMA_URL`);
  - `HazardReportController::store` (dispatch after save).
- Test: `ReportVerificationTest.php`.

**Interfaces:**
- **Produces:** the job `CheckReportPhoto(HazardReport $report)`. It reads the photo from the local disk and POSTs
  `{base}/api/generate` with `{model, prompt, images: [base64], stream: false}` and a 60 s timeout. It parses the
  first word of `response` (`yes`/`no`/else) into `match`/`no_match`/`unclear`, stores `ai_note`, then calls
  `ReportVerification::evaluate($report)` (Task 3).
- **Consumes:** Task 1 columns.

- [ ] **Step 1: Write the failing tests** (`Http::fake`):
  - "Yes, flames…" → `match` with the note;
  - "No…" → `no_match`;
  - "Maybe" → `unclear`;
  - a connection exception or no `OLLAMA_URL` → `unavailable`, with no exception thrown;
  - the prompt contains the hazard words ("fire or smoke" for fire, "flooding or standing water" for flood,
    "structural damage like cracks or collapse" for `structural_damage`, "a hazard" for other).
- [ ] **Step 2:** Implement with `$tries = 2` and `$timeout = 90`.

### Task 3: Independent reports, auto-verify, false reports, live map update

**Files:**
- Create: `api/app/Support/ReportVerification.php`.
- Modify:
  - `api/app/Support/ReportClusters.php` (counts use independent reports only);
  - `api/app/Support/ReportActions.php` (`rejectFalse`, `dismiss` with reason `other`);
  - `api/app/Models/HazardReport.php` (saved hook: when `status` changes into or out of `verified`, dispatch
    `CampusChanged`);
  - `api/app/Http/Controllers/Officer/ReportController.php` and `routes/api.php`
    (`POST reports/{report}/reject-false`);
  - the report list payload adds `ai_verdict`, `ai_note`, `duplicate_of`, `reporter_place`, `reporter_place_label`,
    `auto_verified`, `reporter_flagged` and `independent`.
- Test: `ReportVerificationTest.php`, `api/tests/Feature/Officer/OfficerReportsTest.php`.

**Interfaces:** Produces:
- `ReportVerification::threshold(): int` and `minutes(): int`: `system_configurations` keys
  `report_cluster_threshold` and `report_cluster_minutes`, falling back to config;
- `ReportVerification::flagged(User|int $user): bool` (≥ 3 `dismiss_reason = 'false'` in 30 days after
  `false_reports_cleared_at`);
- `ReportVerification::independent(string $hazard, string $building, int $level): Builder<HazardReport>`: pending or
  verified, in the window, no `duplicate_of`, an active and verified reporter, not flagged, one per reporter;
- `ReportVerification::evaluate(HazardReport $r): bool`: auto-verifies the cluster when the count ≥ threshold and
  any `ai_verdict = match`, and returns whether it did.

- [ ] **Step 1: Write the failing tests:**
  - three students, different photos, one AI match → all three verified, `auto_verified = true`, and
    `CampusChanged` dispatched;
  - two students → still pending;
  - three, but one is a duplicate → pending;
  - three, one flagged → pending;
  - three with no AI match → pending;
  - the same student twice plus two others → counts as 3 only with 3 distinct reporters;
  - `rejectFalse` ×3 → `flagged`; an admin sets `false_reports_cleared_at` → not flagged;
  - an officer rejects an auto-verified report → `CampusChanged`;
  - `dismiss` does not count as false;
  - the officer list JSON includes the new fields.
- [ ] **Step 2:** Implement. `evaluate()` also runs at the end of `store` (after the duplicate and place checks), so
  a cluster can verify without waiting if an earlier AI match exists.

### Task 4: Admin panel: Report rules page, Often false on Users

**Files:**
- Create: `api/app/Filament/Pages/ReportRules.php` + `resources/views/filament/pages/report-rules.blade.php`
  (copy the SafeZones page pattern).
- Modify: the Users table in `api/app/Filament/Resources/Users/...`: an "Often false" badge column and a "Clear false
  reports" action that sets `false_reports_cleared_at = now()` and is logged.
- Test: `api/tests/Feature/Admin/ReportRulesTest.php`.

- [ ] **Step 1:** Write the failing tests:
  - an admin saves threshold 4 and minutes 15 → `ReportVerification::threshold() === 4`;
  - the validation range is 2–10 and 5–60;
  - an officer is forbidden;
  - the Clear action clears the flag and is logged.
- [ ] **Step 2:** Implement.

### Task 5: App: camera-only, required photo

**Files:**
- Modify: `mobile/src/app/report.tsx`.
- Test: `mobile/src/__tests__/` (the existing report test file; grep "Photo (optional)").

- [ ] **Step 1:** Write the failing tests:
  - "Photo (required)";
  - no "Choose photo" button;
  - Send stays disabled until a photo is taken (mock `launchCameraAsync`);
  - the multipart body includes `taken_at` (ISO) and, when known, `at_building` and `at_level` (from
    `lastEstimate()`);
  - the server's `taken_at` 422 message is shown.
- [ ] **Step 2:** Implement. The web build also uses `launchCameraAsync`.
- [ ] **Step 3:** Run `cd mobile && npx jest --runInBand`, then `npx tsc --noEmit`, then `npx eslint src`. Expected:
  all pass.

### Task 6: Command Center Reports signals and actions

**Files:**
- Modify: `command/src/screens/Reports.tsx`.
- Test: `command/src/screens/Reports.test.tsx`.

- [ ] **Step 1:** Write the failing tests:
  - a row shows "AI: looks like fire", "Same photo as #12", "Reporter was elsewhere (Annex 1 · Ground)", "Often
    false" and "Auto-verified";
  - "Reject as false" asks with the confirm copy, then POSTs `/reject-false`;
  - Dismiss still POSTs `/dismiss`;
  - the independent count replaces "matching".
- [ ] **Step 2:** Implement. Update the explainer text to: "Reports verify themselves when {n} different people send
  different photos of the same hazard on the same floor within {m} minutes and the AI agrees with one; officers can
  always verify or reject."
- [ ] **Step 3:** Run `npm test -w command` and `npx tsc --noEmit -p command`. Expected: all pass.

### Task 7: Server, docs, full run (ask before Docker)

**Files:**
- Modify:
  - `docker/compose.yml` (ollama `mem_limit: 3g`);
  - `scripts/setup-test-server.sh` (`COMPOSE_PROFILES` adds `ai-local`; `OLLAMA_URL`, `OLLAMA_VISION_MODEL`; pull the
    model after `up`);
  - `docker/.env.example`;
  - `docs/WALKTHROUGH.md` (S5 report steps; O reports; admin Report rules);
  - `docs/SETUP-GUIDE.md`;
  - `e2e/command.spec.ts` (the reports signals test: seed through the API with a real photo, so AI is "not
    available" locally unless Ollama runs);
  - then run `npm run manual`.
- [ ] **Step 1:** Ask the user to open Docker. Then run:
  1. `docker compose -f docker/compose.yml up -d --build`;
  2. Pest via Herd, PHPStan, Pint;
  3. `npm test -w command`;
  4. mobile jest;
  5. root vitest;
  6. `E2E_CHANNEL=msedge npm run e2e`.

  Expected: all pass.
- [ ] **Step 2:** Try the AI locally once: `docker compose --profile ai-local up -d ollama` and
  `docker compose exec ollama ollama pull moondream`. Send a report with a fire photo, and check that
  `ai_verdict = match`. If the model answers poorly, ledger it and tune the prompt.
- [ ] **Step 3:** Final review (fresh reviewer), then fixes. Commit and push only when asked. Then redeploy with the
  setup script, and build a new APK.
