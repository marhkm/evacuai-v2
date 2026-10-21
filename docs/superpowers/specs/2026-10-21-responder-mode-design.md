# Phase 4: Responder mode (officers on the phone app)

Part of the approved plan (Command Center, Responder mode, real floor plans, Signage redesign, docs split). Today an
officer who signs in to the phone app sees the student home and nothing of their job. That is the confusion the user
hit. This phase gives safety officers and admins a **Responder** home in the same app, on the Phase 1 officer API.

## Goals

1. **Who sees it:** when `user.role` is `safety_officer` or `admin`, the app opens on the Responder home (`/responder`).
   - "Student view" opens the normal home (`/?student=1`), so officers can still evacuate, report and check in.
   - The student home shows "Responder mode" to officers.
   - Everyone else who opens a `/responder` URL is sent to the normal home (and the API answers 404 anyway).
2. **Four tools:**
   - **SOS inbox and chat** (`/responder/sos`, `/responder/sos/[id]`): open requests, newest first. The chat shows the
     conversation, Acknowledge, Resolve (asks first) and a message box.
   - **Who's missing** (`/responder/missing`): for the active alert, counts and a list of people with an SOS, who need
     help or are unknown, with their last known place.
   - **Paths** (`/responder/paths`): pick a building and floor, see the poster plan with current path status, and set each
     path to Open / Congested / Blocked from a list. A list is used instead of tapping lines, because thin lines are hard
     to hit on a phone.
   - **Alerts** (`/responder/alerts`): broadcast (hazard, severity, building, message, drill). Without 3 matching
     reports, the officer must confirm they checked the incident directly. Also publish/discard drafts and
     confirm/resolve/retract active alerts, each asking first.
3. **Live:** screens refresh on the private `officers` channel (SOS, reports, check-ins) and the public `alerts` channel,
   and poll every 15 s as a fallback.
4. **Push:** tapping an officer push with `sos_id` opens that SOS. Tapping an alert push opens the route for students,
   and Alerts for officers.

## Privacy

- Names and places of missing people are held in memory only: never written to storage, the snapshot cache or logs.
- Phone numbers from the safety board are shown as a call link and not stored.

## Not in this phase

- Restyling (Phase 5).
- Report verification on the phone: that stays in the Command Center.

## Confirmation dialogs

`confirm(title, message)` in `lib/confirm.ts` uses `Alert.alert` with Cancel/OK on phones and `window.confirm` on the
web build. react-native-web's `Alert` ignores buttons, and testers use the web build.

## Testing (jest + Expo Router testing library)

- An officer lands on the Responder home; a student who opens `/responder` lands on the normal home.
- SOS: the inbox lists open requests; opening shows messages; Acknowledge, Send and Resolve post. An officer-channel
  event refreshes the inbox.
- Paths: choosing Blocked sends `PATCH /api/officer/paths/<encoded id>` with `{status: 'blocked'}`.
- Alerts: broadcast with `needs_confirmation` asks, then re-posts with `confirm: true`; Resolve asks first.
- Missing: shows only SOS, needs help and unknown, and nothing about people is written to storage.
- Push tap: `sos_id` opens the SOS; officers' alert taps open Alerts.
