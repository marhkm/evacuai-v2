# Testers' report, Part 2: SOS location, check-in history, safe zones — design

## Context

Part 2 of the student testers' report (`Evacuai-Reports-And-Bugs.docx`, "To Change" items 2–5 and "To Add" item 2).
Part 1 (bugs and the Command Center) shipped in `f9429d6`. The report asks for:
- an SOS location that is filled in automatically with a confirmation, or picked or scanned;
- every check-in kept as history, with a new one replacing the last only after the user confirms;
- "I need help" removed from Check-in;
- "I'm Safe" at safe zones, picked from a list or scanned by QR, with each zone's capacity shown and another zone
  suggested when one is full.

**Decisions (user):**
- **Unknown location:** the SOS is sent right away, marked "Location unknown", and the phone then asks for the room or
  a QR scan.
- **Safe zones:** the Basic Ed "Field" assembly point becomes **"Open ground"**. Nature's Spring is the existing
  off-campus area, which keeps its generic name **"Off-campus assembly area"** (no new place).
- **Capacity:** the office has not decided how to set it, so an admin enters it per zone. Blank = no limit shown.

**Found in the code:**
- **SOS:**
  - `mobile/src/app/sos.tsx` never loads the class schedule; only the Route screen does (`route.tsx:55-66`).
  - A picked room without a map node is dropped: `node_id` becomes null.
  - `sos_alerts` has no `room_id`.
- **Check-in:**
  - it overwrites (`EvacuationLog::updateOrCreate`, unique `user_id + alert_id`);
  - "I need help" is a check-in status (`needs_help`).
- **Capacity:** the campus seeder rewrites `evac_nodes.capacity` from the JSON on every deploy, so an admin's value
  cannot live there.
- **Counts:** the live count per zone already exists (`SafetyBoard::occupancy`). Routing already avoids a full zone
  when a node has `capacity`/`occupancy` (`packages/routing/src/route.ts:22-23`).

## Design

### 1. SOS location
- **The SOS screen loads where the student is.** It loads the saved place and the class in session itself. A new
  `loadEstimate(token, alertActive)` in `mobile/src/lib/whereabouts.ts` is extracted from `route.tsx` and used by both
  screens.
- **The SOS is sent at once**, with whatever is known.
- **`POST /api/sos` accepts:**
  - `node_id` or `room_id`, so a picked room without a node is kept;
  - `location_source`: `qr | manual | schedule | null`.
- **New columns on `sos_alerts`:** `room_id` (nullable FK rooms) and `location_source` (nullable string).
  `Places::label` gets the room.
- **When the place came from the schedule,** the sent screen shows a banner: *"We sent your class room: {place}. Are
  you there?"* with **Yes** and **No, change**.
  - **Yes:** confirms it, setting `location_source = manual`.
  - **No, change:** opens Pick my room / Scan QR.
- **When there is no place,** the sent screen shows *"Location unknown. Pick your room or scan a sticker so officers
  can find you."* with the chooser open.
- **New endpoint `PATCH /api/sos/{id}/location`** `{node_id | room_id, location_source}`:
  - the sender only, and only while the SOS is open;
  - updates the place, which broadcasts `SosUpdated` (model save), so officers see it live.
- **`payload()` adds `location_source`.**

### 2. Check-in history and "update your status?"
- **New table `check_ins`:** `id`, `user_id`, `alert_id`, `assembly_node_id` (nullable: "not at a safe zone"),
  `source` (`qr | list | gps | none`), `created_at`. One row per check-in, never updated.
- **`evacuation_logs` stays the current status** that the boards read.
- **`POST /api/check-in`** takes `{node_id?, source, replace?}`:
  - the status is always `safe`; `status: needs_help` is refused with 422;
  - **an existing check-in without `replace: true`** returns 409 `{error: 'already_checked_in', place, checked_in_at}`
    and nothing is written;
  - otherwise it writes the current status **and** a history row.
- **The app** asks *"You already checked in at {place} at {time}. Update your status?"* with **Update** and **Keep**.
  Update resends with `replace: true`.
- **`GET /api/check-in`** adds `history`: the user's check-ins for this alert, newest first, as `{place, at}`. The
  screen lists "Earlier: …".
- **"I need help" is removed** from Check-in, along with its "Send SOS" follow-up. The red SOS button elsewhere stays
  the only emergency path. The DB enum keeps `needs_help` for old rows, and Part 1's boards count those as SOS.

### 3. Safe zones and capacity
- **New column `assembly_points.capacity`** (nullable unsigned int). The campus seeder does not touch it, so an admin's
  value survives a deploy.
- **`App\Support\SafeZones::forAlert(?int $alertId)`** returns a list of `{node_id, name, count, capacity, full}`.
  - `count` is the safe check-ins at that zone in the current status table.
  - `full` is `capacity !== null && count >= capacity`.
  - It replaces `SafetyBoard::occupancy()`; the Command Center's occupancy bars use it.
- **The campus snapshot** sends each assembly node's `capacity` and `occupancy` from `SafeZones` for the active
  alert, so routing's full-zone penalty uses live numbers.
- **`GET /api/check-in` adds `zones`** (the same list). `POST` returns it too, with `suggest` (a zone with space) when
  the zone just used is full.
- **Check-in screen:**
  - **"I'm safe at a safe zone"** lists each zone as *"Open ground · 42 of 300"* (or *"· 42 here"* without a
    capacity), with *"Full"* in danger colour when full, and **Scan safe zone QR**;
  - picking a full zone still checks in (they are there), then shows *"{zone} is full. {other} has space."*;
  - **"I'm safe (not at a safe zone)"** stays.
- **Admin panel:** a new **Safe zones** page lists the zones with an editable Capacity field and a Save button. Saving
  is logged.
- **Data:** the Basic Ed Field node gets `"name": "Open ground"` in `campus-data/uclm/BE/floor-1.json`, and the
  snapshots are regenerated.
- **Command Center Safety:** the occupancy bars show "42 / 300" and "Full".

## Testing
- **Pest:**
  - SOS with `room_id` and `location_source`;
  - PATCH location by the sender only, open only, broadcasting;
  - check-in: the 409 shape, `replace` writes the current status plus a history row, `needs_help` gives 422, and the
    history list;
  - `SafeZones` counts, capacity and `full`;
  - the snapshot's capacity and occupancy;
  - the admin capacity page saves, and a re-seed keeps the value.
- **Jest:**
  - SOS: the schedule banner, Yes/No, unknown location then pick → PATCH;
  - Check-in: the zone list text, the full suggestion, the 409 prompt → replace, no "I need help".
- **Vitest:** the Safety occupancy shows "x / y" and Full.
- **Playwright:** the app check-in flow during the demo drill (pick a zone → checked in; again → the update prompt).

## Out of scope
- How capacity is determined (the office decides; admins type it in).
- Officers viewing a person's check-in history (it is stored; viewing can come later).
- Part 3 (hazard verification) and Part 4 (maps).
