# Testers' report, Part 3: hazard report verification — design

## Context

Part 3 of the student testers' report, covering "To Change" item 6 and "To Add" item 4. Parts 1 and 2 shipped in
`f9429d6` and `b6209df`. The shared test server runs at https://evacuai.tech.

The report asks for:
- a mandatory photo, preferably taken in the app;
- AI checking whether the photo shows the selected hazard;
- duplicate-image detection, so one fake photo sent by several students counts once;
- a metadata and location check;
- a corroboration threshold before "Verified";
- officer approval or rejection;
- penalties for repeat false reporters.

AI must assist, never decide.

**Decisions (user):**
- **AI runs as a local vision model on the server** (Moondream via Ollama). Photos never leave the server: they can
  show faces, and personal data must not go to free cloud AI.
- **Auto-verify, with strict rules.** Officers can still reject.
- **False reports:** flag the student, then stop counting their reports toward auto-verify. An admin can clear the
  flag.

**Found in the code:**
- **Photo:**
  - optional on the server (`HazardReportController::store`, `photo` nullable) and in the app (`report.tsx`: Take or
    Choose photo, "Photo (optional)");
  - `ReportPhoto::store` re-encodes to JPEG, dropping EXIF after rotation.
- **Clustering:** `ReportClusters` counts distinct verified, active reporters per hazard, building and floor in
  `report_cluster_minutes` (10), against `report_cluster_threshold` (3). `evaluate()` raises an unverified alert at
  the threshold.
- **Officer review:** `ReportActions` verify, dismiss and resolve. There is no "false" distinction.
- **No map refresh:** verifying does not broadcast `CampusChanged`, so phones do not refetch the hazard rooms (gap
  noted in Part 1).
- **Ollama:** an optional `ollama` service exists in compose (profile `ai-local`). `config/services.php` has
  `ollama.url` and `model` for text.

## Design

### 1. Mandatory in-app photo
- **Server:** `photo` becomes `required`.
  - The new field `taken_at` (ISO time from the app) must be no older than 10 minutes, and not more than 1 minute in
    the future.
  - Error message: "Take a new photo of the hazard (photos older than 10 minutes are not accepted)."
- **App:**
  - the section reads "Photo (required)";
  - **camera only** (no "Choose photo");
  - Send is disabled until a photo is taken, and sends `taken_at` = the capture time.
  - On web, the camera opens through the browser (`launchCameraAsync`). HTTPS makes this work on the test server.
- **Stored:** `hazard_reports.photo_taken_at`.

### 2. Duplicate photos
- **Fingerprint:** `ReportPhoto::store` also computes a 64-bit **dHash**: grayscale, 9×8, compare neighbours. It is
  stored as `hazard_reports.photo_hash`, 16 hex characters.
- **Duplicate:** a report whose hash is within **Hamming distance ≤ 6** of a report from the last 24 h gets
  `duplicate_of = that report's id` (the oldest match).
- **Duplicates never count** toward corroboration or auto-verify.

### 3. Location hint (never blocks)
- `hazard_reports.reporter_place`: `match | elsewhere | unknown`, plus `reporter_place_label`.
- It compares the report's building and floor with the reporter's last `location_events` row for the active alert,
  or the app's `whereabouts` sent with the report (`at_building`, `at_level`; the app already knows them).

### 4. AI photo check (advice only)
- **The job** `CheckReportPhoto` is queued after a report is stored. It calls Ollama's native
  `POST {OLLAMA_URL}/api/generate`:
  - `model = OLLAMA_VISION_MODEL` (default `moondream`);
  - `images` = the stored JPEG in base64;
  - `stream: false`;
  - prompt: "Does this photo show {hazard words}? Answer yes, no, or unclear, then one short reason."
- **Result:** `hazard_reports.ai_verdict` is `match | no_match | unclear | unavailable`, plus `ai_note` (max 200
  characters).
  - No `OLLAMA_URL`, a timeout (60 s) or an error gives `unavailable`. Never retried in a loop: `tries = 2`.
- **After the check,** the job re-runs the auto-verify check (§5).
- **Text features unchanged:** the AI text features (translate, summarize) keep using `OLLAMA_MODEL` and are
  unchanged.

### 5. Verified
- **Auto-verify (`ReportVerification::evaluate`)** marks every pending report in the cluster `verified` with
  `verified_by = null` and `auto_verified = true` when all of these hold in the window:
  - ≥ threshold **independent reports**: distinct reporters, `duplicate_of` null, reporter not flagged;
  - the same hazard, building and floor;
  - at least one with `ai_verdict = match`.
- **When it runs:** it is evaluated on submit and after each AI check.
- **The existing unverified-alert rule is unchanged.** It still triggers on reporter count, but counts only
  independent reports.
- **Officers** can still verify any pending report, or reject or dismiss any open one, including auto-verified ones.
- **Live update:** any change to verified status broadcasts `CampusChanged`, so maps and routes update live. This
  also fixes Part 1's gap.
- **Settings:**
  - `report_cluster_threshold` (3) and `report_cluster_minutes` (10) stay in config;
  - the admin panel gets a **Report rules** page to change them, stored in `system_configurations`, with config as
    the fallback.

### 6. False reports
- **Reject as false:** `ReportActions::rejectFalse` sets status `dismissed` and `dismiss_reason = 'false'`.
  - The plain **Dismiss** sets `dismiss_reason = 'other'`.
  - New column `hazard_reports.dismiss_reason` (nullable).
- **Flag:** a user with ≥ 3 `false` rejections in 30 days is **flagged**, computed by `ReportVerification::flagged`.
  - An admin can clear it: `users.false_reports_cleared_at`. Only rejections after that time count.
- **What it means:** flagged users' reports still go to officers, but don't count toward auto-verify or the alert
  rule. The Command Center shows "Often false".
- **Admin:** the Users page shows "Often false" and a **Clear** action.

### 7. Command Center Reports
- **Each row shows:**
  - the photo thumbnail;
  - the AI chip;
  - "Same photo as #12";
  - the location hint;
  - "Often false";
  - the independent-report count;
  - "Auto-verified".
- **Buttons:** Verify, Reject as false (confirm: "Count this as a false report by {name}?"), Dismiss, Resolve.

### 8. Server
- **`setup-test-server.sh`:**
  - enables the `ai-local` profile (`COMPOSE_PROFILES=https,ai-local`);
  - sets `OLLAMA_URL=http://ollama:11434` and `OLLAMA_VISION_MODEL=moondream`;
  - pulls the model once (`docker compose exec ollama ollama pull moondream`).
- **The ollama service gets a memory limit of 3 GB** (`mem_limit`), so the API keeps memory on an 8 GB VPS.

## Testing
- **Pest:**
  - photo required, and age limits;
  - dHash identical, near and different, plus `duplicate_of`;
  - auto-verify:
    - verifies at 3 independent reports with one AI match;
    - not with duplicates, a flagged reporter, no AI match, or only 2;
    - broadcasts `CampusChanged`;
  - reject as false → flag at 3 → cleared by the admin;
  - the AI job with `Http::fake` (match, no, unclear, timeout → unavailable);
  - the Report rules page.
- **Jest:** the report screen needs a photo (no Choose, Send disabled) and sends `taken_at`.
- **Vitest:** the Reports row signals and the Reject-as-false confirm.
- **Playwright:** officer Reports shows the AI and duplicate chips for seeded reports (no real AI in tests).

## Out of scope
- Face blurring of stored photos.
- Training or fine-tuning a model.
- Per-building rules.
