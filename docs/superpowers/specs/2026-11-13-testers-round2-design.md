# Testers' round 2: schedule upload, instant SOS, QR scanner, show password

Requested 2026-11-13, after the Part 3 review fixes. Four changes, built and tested together; Part 4 (maps) stays
next in line.

## Decisions (user)

- **SOS:** sends on the first tap, with a **Cancel (sent by mistake)** button for 10 seconds afterwards.
- **GPS:** the admin enters each building's GPS corners. Until then, GPS is skipped.
- **Schedule upload:** accepts `.xlsx` and `.csv`. The template is `.xlsx`. Each upload replaces the student's whole
  schedule.
- **Show password:** everywhere a password is typed: the phone/web app, Command Center sign-in and Admin sign-in.

## 1. Class schedule: students upload their own

**Admin**
- Remove the **Import Class Schedule** page (`api/app/Filament/Pages/ImportSchedules.php` and its view and test).
- Move the shared parsing and validation into a new `App\Support\ScheduleImport`. Its rules are the current ones:
  - room codes match ignoring spaces, dashes and case;
  - days are valid per `ClassDays`;
  - start is before end, in `HH:MM`.

**API**
- `GET /api/me/schedule`: the student's classes.
- `POST /api/me/schedule` (multipart `file`):
  - accepts `.xlsx` or `.csv`, 1 MB at most, 60 rows at most;
  - columns: `subject, room_code, days, time_start, time_end` (no email: it's always their own);
  - it's all or nothing: any bad row rejects the whole file with one error per row ("Row 4: unknown room code A-99"),
    and nothing is saved;
  - on success it replaces the student's classes and returns them.
- `DELETE /api/me/schedule`: clears the schedule.
- `GET /api/me/schedule/template`: an `.xlsx` with a **Schedule** sheet (header row plus one example row) and a
  **Rooms** sheet listing every room code and its name, so students can copy valid codes.
- Library: `openspout/openspout`, which reads and writes `.xlsx` with no extensions needed. Time cells that Excel
  stores as day fractions are converted to `HH:MM`.

**Phone (Profile page)**
- New **Class schedule** section:
  - this week's classes as a short list, or "No schedule uploaded";
  - **Download template**: opens the template URL (it downloads on Android and on the web);
  - **Upload schedule**: a file picker (`expo-document-picker`) for `.xlsx` or `.csv`; errors show per row;
  - **Remove schedule**, with a confirm.
- Students and staff only. Officers and admins don't see the section.

## 2. SOS: one tap sends, location follows by itself

**Phone**
- Tapping **SOS** on the home screen calls `POST /api/sos` immediately, then opens the SOS screen (the chat).
- No confirm step. A failed send shows **Couldn't send. Tap to retry**. If an SOS is already open, the tap just
  opens it (the server already returns the open one).
- For 10 seconds after sending, the SOS screen shows **Cancel (sent by mistake)**, which uses the existing
  `POST /api/sos/{id}/cancel`.

**Location, in order.** Sending never waits for any of these steps:

1. **Class now:** the server looks up the student's class in session itself, and the place is that room (source
   `schedule`).
2. **GPS:** if there's no class, the phone asks for one GPS fix (3-second limit, in the background) after sending.
   It sends `PATCH /api/sos/{id}/location` with `lat, lng, accuracy`.
   - The server checks which building's corners contain the point, allowing for the accuracy (GPS fixes worse than
     40 m are ignored).
   - It sets the building only (source `gps`); the floor and room are still unknown.
   - A GPS reading never replaces a class room, a sticker scan or a room pick.
3. **Last known:** if GPS fails or is outside every building, the phone's saved location is sent with the SOS,
   marked **approximate** (source `last_known`).
4. **Nothing:** **Location unknown**, and officers ask in the chat. This is the existing behaviour.

A sticker scan or room pick made in the last 10 minutes is more exact than the schedule, so it still wins. This is the
one change from your order, because the student was just standing there.

Officers see the source next to the place:
- "Annex 1, Room 61 · from class schedule"
- "Annex 1 · from GPS"
- "Basic Ed, 2nd floor · approximate (last known)"

The student can still correct the place in the chat, as today.

**GPS data**
- New `buildings.gps_corners` (json, a list of `[lat, lng]`, 3 to 8 points).
- Admin → **Buildings**: a field "GPS corners, one `lat, lng` per line" with a hint (right-click each corner in Google
  Maps, then copy).
- Point-in-polygon runs on the server: the corners are campus data and never go to phones.
- GPS coordinates are sent only with an open SOS, and only the building is kept, not the coordinates (RA 10173).

## 3. Bug: the Check-in QR scanner won't close

In `LocationChooser`, the scanner closes:
- when its button is tapped again (the button reads **Close scanner** while open);
- after a successful scan (already done);
- on a new **Close** button over the camera;
- when the user leaves the screen (`useFocusEffect` cleanup) or goes back.

The same fix applies to the Route and SOS screens, which use the same component.

## 4. Show password

- **Phone:** the shared `Field` component gets a **Show** / **Hide** button whenever `secureTextEntry` is set, with
  `accessibilityLabel` "Show password" / "Hide password". That covers sign in, sign up, reset, change password and
  delete account in one place.
- **Command Center:** the same Show/Hide button on the sign-in password field.
- **Admin:** Filament's `revealablePasswords()` (check that it's on; turn it on if not).

## Testing

**Pest**
- Upload: xlsx and csv accepted; a bad row rejects the whole file with row errors; replace and clear work; the
  template has both sheets; another user's schedule is never touched; the old admin page is gone.
- SOS: the class room is used when a class is in session; a GPS point inside a building's corners sets the building;
  accuracy over 40 m is ignored; GPS never overrides schedule, QR or manual; last-known is marked approximate; the SOS
  is created with no location at all.

**Jest (mobile)**
- One tap sends and opens the chat; retry on failure; Cancel only for 10 seconds; the GPS fix is sent after the SOS.
- The QR button toggles the camera; Close and leaving the screen close it.
- Show/Hide switches the password field.
- The Profile schedule section: list, upload errors, remove.

**Vitest**
- Command Center Show/Hide; the SOS place shows its source.

**Walkthrough**
- New student steps (S-section): upload a schedule and send SOS with one tap.
- New admin step: GPS corners.
- The A-section import step is removed.
