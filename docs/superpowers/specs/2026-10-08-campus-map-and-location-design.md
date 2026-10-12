# Campus Map Views & Indoor Location — Design

**Date:** 2026-10-08
**Status:** Approved in brainstorming; pending written-spec review
**Parent plan:** [docs/PLAN.md](../../PLAN.md). This spec refines plan §1 (Floor plans, Indoor location), §3 (Routing) and build slices 3, 5 and 6.

## 1. Intent

**Goal:** EvacuAI must show users where they are and how to get out, on campus maps that every phone can render, while admins get a live 3D overview of the campus during incidents and drills.

**Decisions (from the user):**
- 3D is for **both** the admin web and the app. In the app it is an optional toggle; 2D stays the default.
- Location is **phone-only, permanently.** No beacons or other hardware. Paper QR stickers are the only campus installation.
- Admins see location **per event only**: at route start, floor change, SOS and check-in. There is no live streaming.
- Approach A: one campus data model, with all views generated from it, plus a layered location estimator that runs on the device.

**Constraints:**
- Android first, and phones with 2 GB RAM must work.
- Must work offline once data is cached.
- No paid SDKs.
- Philippine Data Privacy Act (RA 10173).
- Laravel 13 + Filament + Expo stack (parent plan).

**Success criteria:** see §7, Field acceptance.

**Non-goals:**
- Meter-accurate positioning.
- Continuous tracking.
- Background location.
- BLE, Wi-Fi fingerprinting or RTT.
- Commercial indoor SDKs (IndoorAtlas, Mappedin, Situm).
- Hand-authored 3D assets.

**Research basis:**
- Android throttles foreground Wi-Fi scans to 4 per 2 minutes, so RSSI fingerprinting is impractical.
- Wi-Fi RTT needs FTM-capable access points, which most installed APs are not.
- Phone barometers detect floor changes at about 98–100% accuracy in controlled studies. They lag a few seconds, and many budget phones lack the sensor.
- Studies of 2D vs 3D evacuation maps are mixed. A maze-escape study favored 2D for following a route.

## 2. Campus data model (single source of truth)

Versioned JSON in git. The Laravel seeder imports it into the DB, and the app receives it through `/api/campus-snapshot`.

```
campus-data/
  campus.json          campus origin {lat,lng}, buildings[], assembly_points[{id, lat, lng, radius_m, node_id}]
  <building>/
    building.json      {id, name, origin:{lat,lng}, rotation_deg, footprint:[[x,y]...],
                        floors:[{level, elevation_m, height_m}]}
    floor-<level>.json {rooms:[{id, name, type, polygon:[[x,y]...]}],
                        nodes:[{id, room_id?, type, x, y, safe_for:[hazard...], qr_id?}],
                        edges:[{from, to, type, distance_m?, bidirectional, flags:[...]}]}
```

- **Units:** each building has its own local frame in metres. Floors are placed vertically by `elevation_m`. Each building is placed on campus by `origin` + `rotation_deg`.
- **Global IDs:** `<building>/<level>/<local>`, e.g. `BE/G/Stairs_Left_G`. Cross-floor (stair) edges live in the upper floor's file and reference the lower floor's node by global ID.
- **Seed content:**
  - **Basic Ed (BE)** starts from the student prototype's floor SVGs and room IDs, copied read-only from github.com/Lexageda/evacuai.
  - **OLD, Annex 1 and Annex 2** are traced from the UCLM floor plans.
- **Defaults:** `distance_m` is computed from node coordinates unless overridden. `height_m` defaults to 3.5.
- **Calibration knobs** that stay in the JSON: `height_m` per floor (used by the barometer) and `radius_m` per assembly point (the GPS geofence).
- **Validation** (`pnpm --filter routing validate`, run in CI) fails when:
  - any reference doesn't resolve;
  - any polygon isn't closed;
  - any `qr_id` is duplicated;
  - a stair edge is missing its counterpart floor node;
  - any node cannot reach a `safe_for` node for each hazard (earthquake, fire, flood).

## 3. Map views

### 3.1 `packages/campus-view` (pure TS, no UI)
- `toFloorShapes(snapshot, buildingId, level)` returns room polygons and node and edge geometry with status styling: `open | blocked | congested | hazard`.
- `routeOverlay(route)` returns per-floor polyline segments plus floor-transition markers (e.g. "Stairs Left ↓ Ground").
- `routeSteps(route)` returns the text instructions ("Exit room → left corridor → Stairs Left down to Ground → Exit North").

All views consume these functions, so statuses render identically everywhere.

### 3.2 2D floor view (app default; offline)
- react-native-svg draws polygons, the route line, a "you are here" marker, and blocked edges in red with a hatch.
- Pinch-zoom and pan. Floor tabs auto-select the floor of the current route segment.
- Accessibility:
  - minimum label size;
  - status encoded by color and pattern, never color alone;
  - `routeSteps` text is always shown below the map.

### 3.3 2.5D stacked view (app)
The same SVG floors, rendered as skewed layers stacked by level. It uses one SVG transform per floor and no WebGL, so it works on every phone. It shows multi-floor routes at a glance.

### 3.4 3D view — `packages/campus-3d` (vanilla three.js)
- `buildScene(snapshot)` extrudes room polygons with `ExtrudeGeometry` at each floor's `elevation_m` and `height_m`. Walls are semi-transparent so the route stays visible through floors. Each room carries `userData.roomId`.
- `applyStatus(scene, statuses)` and `showRoute(scene, route)` mutate materials and the overlay in place, without rebuilding the scene.
- Budget: flat shading, no textures, no HDR environment, one merged mesh per floor plus an overlay. Under 50K triangles for the whole campus.
- **Admin:** a Filament custom page "Campus 3D" loads the package as a Vite bundle. Reverb events drive:
  - hazards and blocked paths;
  - crowd-per-floor/room heat;
  - SOS pins at the last-known zone;
  - drill replay, a time slider over `location_events`.
- **App:** an Expo DOM component (`'use dom'`) behind a "3D" toggle, lazy-loaded. The toggle is hidden when `expo-device` reports less than 3 GB RAM or WebGL is unavailable. The view defaults back to 2D whenever an alert becomes active. The bundle ships in the app, with no CDN, so it works offline.

## 4. Location estimator (on device)

### 4.1 Output
```ts
type Estimate = {
  nodeId?: string; roomId?: string; building?: string; floor?: number;
  source: 'qr' | 'manual' | 'schedule' | 'barometer' | 'gps';
  confidence: 'exact' | 'likely' | 'unknown';
  at: Date;
};
```
Routing origin rules:
- Use `nodeId` when set.
- Otherwise, if `roomId` is set, use the room's door node.
- Otherwise, prompt the user before routing.

### 4.2 Sources (highest priority first)

| Source | Trigger | Sets | Confidence |
|---|---|---|---|
| QR scan (`expo-camera`; payload `evacuai://n/<global node id>`) | User scans a sticker | node | `exact`, decays to `likely` after 10 min |
| Manual picker | building → floor → room, plus search | room | `exact`, decays to `likely` after 10 min |
| Class schedule (cached `schedules`) | A class is active now | room | `likely`. UI: "In BE203? Tap to confirm" |
| Barometer (`expo-sensors`, only if `Barometer.isAvailableAsync()`) | After a QR or manual anchor | floor ± n, clears room/node | Unchanged |
| GPS (`expo-location`, foreground only) | Outdoors | nearby building, or inside an assembly geofence | `likely`. Suggests check-in only |

Combination rule: a newer, higher-priority source replaces the estimate. Lower-priority sources only fill fields the current estimate is missing.

### 4.3 Floor-change detection (pure function in `packages/routing`)
`detectFloorChanges(samples, floorHeights)`:
1. Smooth pressure with a moving average over about 5 s.
2. Within a 30 s window, a sustained delta of at least `0.6 × floorDelta` counts as one floor per `floorDelta`, where `floorDelta = height_m × 0.12 hPa/m`. Falling pressure means going up.
3. Re-baseline after every detected change, so slow weather drift doesn't accumulate. This matters during typhoon conditions.
4. Fifteen minutes after the last anchor, stop tracking and set confidence to `unknown`.

### 4.4 Prompts
- When an alert starts, show a "Where are you?" sheet with the schedule guess, a QR scan button and the picker.
- If confidence is `unknown` when a route is requested, prompt the same way.
- **The SOS button is never blocked by location.** It sends whatever estimate exists, including `unknown`.

### 4.5 Upload (event-based only)
- `POST /api/location-events {node_id|room_id, building, floor, source, confidence, at}` is sent on route start, floor change, SOS and check-in.
- It is only sent while an alert or SOS is active.
- Events are queued offline and flushed on reconnect.
- No background location permission is requested, and there is no streaming.

### 4.6 Degradation

| Missing | Behaviour |
|---|---|
| Camera permission | Picker only |
| Barometer | No automatic floor tracking |
| GPS | No outdoor suggestions |
| All of the above | Picker alone still supports routing, SOS and check-in |

## 5. Server side (Laravel)

- **Table `location_events`:** `id, user_id, alert_id, node_id null, room_id null, building, floor, source, confidence, created_at`. Index `(alert_id, user_id, created_at)`.
  - It replaces the prototype's `evacuation_status`.
  - Retention: a scheduled purge after `LOCATION_RETENTION_DAYS`.
- **View `last_known_locations`:** the latest event per user for the active alert. It feeds the Safety Monitor, crowd counts and the "Unknown location" list.
- **Policy:**
  - Users create only their own events.
  - Admins and safety officers read them.
  - Students never read others' events.
  - `throttle:20,1` on the endpoint.
- **Broadcast:** `LocationUpdated` (zone and floor only) on the private channel `incident.{alertId}`, authorized for admins and safety officers.
- **Check-in:** `POST /api/check-ins` (assembly QR, or a confirmed GPS prompt) creates an `evacuation_logs` row plus a `location_event`, and increments the assembly occupancy in one transaction.
- **Snapshot:** `/api/campus-snapshot` returns geometry, nodes, edges with live status, and rule weights, with an ETag. The app refetches on the Reverb `EdgeStatusChanged` event and when it returns to the foreground.
- **QR sheet:** `php artisan campus:qr-sheet {building?}` builds a printable PDF with one QR per node that has a `qr_id`. Each sticker carries a human label (e.g. "BE · 2F · Stairs Left").
  - Placement: inside every room door, each stairwell landing on every floor, exits, and assembly points.
  - Stickers carry IDs only. A spoofed sticker can only mislead its own scanner. Admins can rotate `qr_id`s and reprint.

## 6. Units and interfaces

| Unit | Responsibility | Depends on |
|---|---|---|
| `campus-data/` | Geometry + graph JSON | — |
| `packages/routing` | validate, Dijkstra/A*, `detectFloorChanges` | campus-data types |
| `packages/campus-view` | shapes, route overlay, step text | routing types |
| `packages/campus-3d` | three.js scene build / status / route | campus-view |
| `mobile/` estimator module | Estimate state machine + sensor adapters | routing, Expo sensors |
| `mobile/` map screens | 2D, 2.5D, 3D (DOM component) | campus-view, campus-3d |
| `api/` | snapshot, location events, check-ins, QR sheet, broadcasts | DB, Reverb |
| Filament "Campus 3D" page | Live admin overview + replay | campus-3d bundle, Reverb |

## 7. Testing & acceptance

**Unit (Vitest):**
- validate: all failure cases from §2;
- `toFloorShapes` / `routeOverlay` (blocked styling, multi-floor split + stair markers);
- `buildScene` in jsdom: one mesh per floor, triangle budget, `roomId` mapping;
- estimator table tests: QR beats schedule; 10 min decay; route request without an anchor prompts; SOS sends `unknown`;
- `detectFloorChanges` against **recorded pressure traces** in fixtures: +1 floor, +2 floors, 1 hPa/h drift gives no change, elevator, noise gives no change.

  Students record the traces with a dev-only screen on 2–3 phone models in Basic Ed.

**Backend (Pest):**
- `location_events` policy and throttle;
- `LocationUpdated` broadcast only on the private channel;
- check-in transaction;
- `campus:qr-sheet` PDF contains N codes;
- snapshot ETag changes when an edge status changes.

**Mobile (jest-expo + RNTL):**
- the QR deep link sets an `exact` estimate;
- the picker flow;
- the 3D toggle is hidden below 3 GB (mocked `expo-device`);
- 2D renders offline from the cached snapshot.

**E2E:**
- **Maestro:** alert, then "Where are you?", then confirm the schedule guess, then the route, then the floor tab switches, then QR check-in (via deep-link injection).
- **Playwright:** on the admin Campus 3D page, an edge toggle turns red within 2 s.

**Field acceptance (Basic Ed first):**
- at least 95% of QR scans resolve to the correct node;
- floor correct after a stair change in at least 90% of 20 trials on barometer phones, across 3 models;
- under 3 s from location confirmation to route on screen on a 2 GB phone;
- the admin 3D page runs at 30 fps or more on a school lab PC;
- drill replay order matches marshals' observations.

## 8. Changes to the parent plan

- §1 "Indoor location" row: becomes this layered estimator. "GPS only pre-selects building" becomes "GPS outdoors: building + assembly geofence suggestion".
- §2 item 10: add the `location_events` table. Add `rooms` (polygons) and floor `elevation_m`/`height_m` to the campus schema.
- Build slices:
  - Slice 3 adds `packages/campus-view` + 2D view + QR sheet.
  - Slice 5 adds the estimator + 2.5D view.
  - Slice 6 adds check-in via QR/GPS + `location_events`.
  - New **slice 7b**: `packages/campus-3d`, Filament Campus 3D page, the app 3D toggle, and drill replay.
