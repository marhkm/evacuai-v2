# Testers' round 3: design

Source: `EvacuAI_Bugs_and_Changes_Round3.docx` (7 items). Items 3 (officer broadcast prompt) and 7 ("What is
happening?" heading) are done.

## Decisions (user, 2026-11-27)

- **AI check at submission:**
  - Wait up to **20 s**.
  - No answer in time: the report is kept **pending for a safety officer**, and the AI result is added later.
- **AI says the photo doesn't show the hazard:** the student is asked to retake it, or can tap **Send anyway for a
  safety officer to check**. Nothing is broadcast.
- **AI confirms the hazard:** an **UNVERIFIED** alert is broadcast at once. Officers can Confirm or Retract it.
- **Flood:** no AI photo check. A flood report is verified by the report count (enough different students for the
  same place) or by an officer. The photo is still required and shown to officers.

## Item 1. Flood logic

- **Where a flood can be reported:**
  - any floor (as today);
  - each safe zone and open ground: Open Ground 1 · Old Building, Open Ground 2 · Basic Ed, Nature's Spring.

  The report form gets an **Outdoor area** choice next to the buildings.
- **Unsafe places:**
  - A verified flood marks that floor of that building, or that outdoor area, unsafe for flood.
  - The snapshot gains `hazardNodeIds` (verified hazard places that aren't rooms), next to `hazardRoomIds`.
  - `findRoute` never ends in, or passes through, an unsafe place. Today's per-floor flood-safe floors still apply.
- **Route to the nearest safe place:** routes stop always going up. The route finder already takes the cheapest place
  that is safe for the hazard: an upper floor, another building through a link, or a safe zone outside (Nature's
  Spring). With unsafe places removed, it picks the nearest one that is still safe.
- **Why this route:** the route screen shows, for example, "Flood reported at Basic Ed · Ground. Going to Second floor
  (nearest safe place)." or "…Going to Nature's Spring (off campus)". The map marks the flooded floor or area.

## Item 2. AI photo check at submission

- **Sending:** `POST /api/hazard-reports` runs the photo check before answering (20 s limit; PHP's request limit is
  30 s).
- **Results:**
  - **match:** the report is accepted, and an UNVERIFIED alert goes out at once. If one is already active for that
    place, the report joins it.
  - **no_match:** 422 `photo_rejected` with the AI's reason; nothing is saved. Sending again with `send_anyway=1`
    saves it as pending (no broadcast, marked "AI: doesn't look like …").
  - **timeout or AI off:** saved as pending (no broadcast). The background check adds the result later.
- **Flood:** skips the check and follows the Item 1 rules.
- **Phone:**
  - "Checking photo…" while it waits.
  - On rejection: "The photo doesn't seem to show fire. Take a new photo, or send it anyway for a safety officer to
    check." with **Retake** and **Send anyway** buttons.
- **Unchanged:** auto-verify on the maps keeps the strict Part 3 rules. Only the UNVERIFIED alert is automatic.
- **Evaluation:**
  - `php artisan evacuai:evaluate-photos <folder>`, where the folder holds one subfolder per hazard (fire, smoke,
    flood, structural_damage, earthquake) plus `none`.
  - It runs the same check and prints a table per hazard type: true and false positives, false negatives, precision,
    recall and **F1**.
  - **mAP doesn't apply:** it measures object detection with boxes and confidence scores, and this check answers
    yes/no. The table says so, for the paper.
  - The user supplies the labelled photos (at least 30 per hazard is suggested).

## Item 3. Officer broadcast prompt: done

Removed the "not enough reports" check and prompt for officer broadcasts.

## Item 4. 3D room labels

- Room names show only when zoomed in (camera distance below a threshold), and only on the chosen floor or building.
- Short labels: the room code (e.g. "A-61") instead of the full name.
- Exits, stairs and hazard rooms always show.
- Overlapping labels are hidden, nearest to the camera first (a simple screen-space check each frame, throttled).

## Item 5. SOS chat notifications

- **Officers:**
  - Each SOS shows **New · n**: messages from the student since this officer last opened it. This uses a per-officer,
    per-SOS "seen up to" message id.
  - The mark clears when the officer opens the chat. The SOS badge in the menu counts unseen messages too.
  - Resolved and cancelled SOS never count.
- **Student:**
  - An officer reply sends a push notification ("Safety officer replied: …"). Tapping it opens the chat.
  - In the app, a banner shows on any screen and opens the chat.
- **After Resolve:** no more notifications. A new message or SOS from the same student is a new case. (Messages to a
  closed SOS are already refused.)

## Item 6. Earthquake alerts from external data

- **Today:** `Feeds::poll` reads USGS and PHIVOLCS every 5 minutes and creates **draft** alerts for officers.
  `FEEDS_ENABLED` is off by default.
- **Change:**
  - Poll every minute.
  - An earthquake at or above the magnitude within the radius (`FEEDS_QUAKE_MIN_MAGNITUDE` 4.5,
    `FEEDS_QUAKE_RADIUS_KM` 100) is **broadcast at once** as an official alert: source "feed", verified, so push and
    in-app banner. Rain and typhoon stay drafts.
  - One alert per quake (existing de-duplication).
- **Experiment:**
  - `php artisan evacuai:quake-latency` logs, per alert: quake time, when the agency published it (if known), when
    EvacuAI created the alert, and when the push was accepted by Expo.
  - `FEEDS_QUAKE_MIN_MAGNITUDE=2.5` for a test run picks up small local quakes.
  - The results table goes to `docs/quake-latency.md`.
- Turned on in the test server's setup (`FEEDS_ENABLED=true`).

## Testing

Each item gets tests that fail first:
- **Pest:** flood places and verification, the submission check (match, no_match, send anyway, timeout), unread SOS
  counts, the feed broadcast.
- **Jest:** Checking photo…, the retake and send-anyway flow, flood outdoor areas, the route reason, the reply
  banner.
- **Vitest:** New · n on SOS.
- **Three.js label rules:** tested as pure functions.
- **Walkthrough:** updated per item.
