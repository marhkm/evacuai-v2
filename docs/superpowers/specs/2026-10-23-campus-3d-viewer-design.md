# Polished 3D campus viewer: architectural model + viewing controls

Status: approved by the user on 2026-10-23 (brainstorming: audience both, architectural-model look, all four control groups, approach A).

## Context

The user finds the current 3D view "horrendous" and wants it detailed and polished, with controls to view one floor or
the whole building, and different ways of viewing.

**Today** (`packages/campus-3d`, ~380 lines):
- Flat-shaded wall panels at 60% of floor height (no thickness), translucent room tiles and grey slabs.
- One orbit camera.
- Two controls exist but have no UI: `peel` (hide upper floors) and `explode`.
- Used by the phone app (`mobile/src/components/Campus3DView.tsx`, an Expo DOM web view) and the Command Center
  (`command/src/components/View3D.tsx`: Live Ops 3D and Replay).

**Decisions made with the user (brainstorming):**
- **Audience:** both students on phones and officers in the Command Center, with one shared viewer and the same controls.
- **Look:** an "architectural model".
- **Controls:** all four:
  - whole building / one floor;
  - exploded view;
  - camera presets;
  - building switcher with tap-to-focus.
- **Approach:** rebuild the existing three.js viewer (approach A). No new libraries.

**Limitation:** Basic Ed has no traced posters, so its walls come from room outlines and it looks simpler than Annex 1
until its PDFs are imported.

## Design

### 1. Scene: "architectural model" (`packages/campus-3d/src/index.ts`, split into focused files)

**Walls.** Real wall polylines (`floor.plan.walls`, or room outlines for Basic Ed):
- each segment becomes a box 0.15 m thick and full floor height (`height_m` − slab);
- boxes are merged into **one mesh per floor** with `BufferGeometryUtils.mergeGeometries` (three/examples, already
  installed);
- material: off-white with a slightly darker top cap;
- door swings drawn as thin floor lines.

**Floors and rooms.**
- Each floor is a slab with a small edge bevel.
- Rooms are tinted floor inlays by type (classroom, office, lab, corridor, stairs).
- Hazard rooms get a red emissive glow; people counts show as a warm tint (the existing heat scale).

**Stairs.** Stair polygons become stepped blocks (steps along the polygon's long axis) inside a translucent glass core,
so they read as stairs across floors.

**Lighting and ground.**
- Hemisphere light plus one directional "sun" with a soft shadow map (only on `quality: 'high'`).
- A ground plane with a subtle grid and building footprints.
- Fog for depth.

**Labels.** `CSS2DRenderer` (three/examples) DOM labels:
- building names in "All floors";
- room names of the focused floor only (avoids clutter);
- hidden when tiny on screen.

**Route.** A flat red ribbon with chevrons scrolling along it (a canvas texture with UV offset, static if the viewer
prefers reduced motion), plus the existing floor arrows. "You are here", SOS (pulsing) and check-in pins stay.

**Blocked paths.** Red/black striped barriers; congested paths in amber.

**Quality.**
- `mount(…, { quality })`, where `'low'` has no shadows, `pixelRatio` 1.5 and labels on the focused floor only.
- The phone app passes `'low'` below 4 GB of memory (it already gates 3D with `can3d`).
- The triangle budget test is raised from 50k to 120k (Annex 1 has ~4,300 wall segments).

### 2. Viewing controls: built into the shared viewer (`mount.ts` + new `controls.ts`)

An HTML control bar overlaid inside the viewer element. Both the phone DOM component and the Command Center get it for
free. Buttons are 44 px+ and labelled for screen readers.

- **Building:** Basic Ed / Annex 1. The camera flies to frame that building.
- **Floors:** `All` plus one chip per floor (G, M, 2, 3, …).
  - **All:** the full stack. Upper floors' walls fade to 25% so you can see in; building labels show.
  - **One floor:** that floor stays solid with room labels. Floors above are hidden; floors below are ghosted (15%).
    The camera flies to the floor.
- **Explode:** a slider from 0 to max. It spreads floors apart; the stairs stretch to connect them (reuses `explode()`).
- **View presets:**
  - **3D** (isometric orbit, the default);
  - **Top** (plan view, straight down, rotation locked);
  - **Front**;
  - **Follow route** (frames the route and starts from "you are here", shown only when there is a route);
  - **Reset**.
  - Camera moves are smooth eased transitions of about 600 ms (instant with reduced motion).
- **Tap to focus:** tapping a room flies to it and shows a card with its name, floor and live status (people inside,
  hazard, SOS here). Tapping empty space closes the card.
- **Viewer API** (extends today's `Viewer`):
  - `setBuilding(id)`;
  - `setFloor(level | null)` (replaces `peel`);
  - `setView('3d' | 'top' | 'front' | 'route')`;
  - `explode(f)`;
  - `focusRoom(id)`;
  - `reset()`;
  - existing `update` / `route` / `dispose` unchanged;
  - `mount(el, snap, { onPick, quality, controls = true, initial: { building, level } })`.
- **Consumers** keep working with small changes:
  - **Phone** `Campus3DView`: starts on the building and floor of the current route or screen; passes `quality`.
  - **Command Center** `View3D`: starts on Live Ops' selected building/floor; Replay uses All floors.

### 3. Structure (small, testable units)

The scene build is pure and testable without WebGL; DOM and renderer code stays in `mount.ts` and `controls.ts`.

| File | Role |
|---|---|
| `src/scene/walls.ts` | Wall segments → merged thick-wall geometry |
| `src/scene/stairs.ts` | Stepped stair geometry |
| `src/scene/floors.ts` | Slabs and room inlays |
| `src/scene/route.ts` | Route ribbon |
| `src/views.ts` | Pure camera maths: preset → position and target for a building/floor/route; floor visibility and opacity for All / one floor |
| `src/controls.ts` | The HTML control bar and focus card, wired to the Viewer API |
| `src/mount.ts` | Renderer, CSS2D labels, transitions, quality |

## Testing

- **Vitest** (`packages/campus-3d/test`):
  - walls are full height and 0.15 m thick, and merge into one mesh per floor;
  - stairs have steps;
  - triangle budget is under 120k;
  - `views.ts` presets give the expected camera position and target per building/floor;
  - Top looks straight down;
  - floor visibility and opacity rules for All vs one floor;
  - route ribbon length matches the route;
  - labels exist only for the focused floor.
- **Controls** (jsdom): chips, slider and preset buttons call the right Viewer methods; the focus card shows room status.
- **Existing tests stay green:** campus-3d, mobile `map.test`, Command Center `LiveOps`/`Replay`.
- **Playwright e2e:** the app spec's 3D step and a Command Center 3D toggle check the canvas and control bar.
- **Visual check:** screenshots (light/dark, phone and laptop) of All floors, one floor, exploded and Top, via
  `scripts/capture-screens.mjs` with WebGL enabled (swiftshader). Add the new shots to the walkthrough (S4, O2).
- **Performance check:** frame rate on the mobile web build with the `low` quality profile; note it in the PR.

## Verification

```
npx vitest run packages/campus-3d      # scene, views, budget
npm test -w command && cd mobile && npx jest --runInBand
npx tsc --noEmit -p command && cd mobile && npx tsc --noEmit
docker compose -f docker/compose.yml up -d --build
npm run e2e   (E2E_CHANNEL=msedge)
node scripts/capture-screens.mjs && npm run manual
```

Then check by hand:
- phone web build (http://localhost:8081 → Campus map → 3D);
- Command Center Live Ops → 3D, and Replay.

A new APK build is needed afterwards.

## Additions (user, 2026-10-23): one building at a time, and a better mobile experience from the Expo skills

### A. One building per 3D view

The user chose "one building at a time". The 3D view draws **only the selected building**, centred on the origin and
filling the view; the other building is not in the scene at all.

- **`buildScene(snap, { building })`:**
  - builds that building only;
  - the side-by-side `offsets` / `GAP_M` layout goes;
  - `Campus3D.building` names it.
- **`Viewer.setBuilding(id)`** disposes the current scene (geometry, materials, labels), builds the new one and frames
  it with the current view preset. Live status and route are re-applied.
- **Routes** are drawn only for the building in view. A route through another building shows its part in that
  building when the user switches to it.
- **`views.floorStyles`:** the "other building" rules are dropped.
- **Command Center:**
  - Live Ops' existing building picker drives `building`;
  - Replay gains the same building/floor picker;
  - room counts and pins are filtered to the shown building.
- **Tests:**
  - a scene for `A1` has no `BE/*` floor groups;
  - `setBuilding('BE')` leaves no `A1` meshes, labels or DOM behind;
  - the triangle count for one building stays under 120k (Annex 1 alone).

### B. Phone: native controls around the 3D view (Expo skills: `expo-dom`, `expo-ui`, `expo-animation`)

**`expo-dom` guidance:** use native components for the chrome and keep the DOM component for the specialised content
only. Pass state in as serializable props and native actions as async function props.

- **`Campus3DView` (DOM component):**
  - renders the canvas only (`mount(…, { controls: false })`);
  - props: `building`, `level` (null = All), `view` (`'3d' | 'top' | 'front' | 'route'`), `explode`, `route`, `quality`,
    `focusRoomId`;
  - one async prop `onPick(info)` returns the tapped room or pin to native.
  - The Command Center keeps the HTML control bar from `controls.ts` (desktop browser, no native layer).
- **Native control strip** on the map's 3D mode (`mobile/src/app/map.tsx`, new `components/Map3DControls.tsx`):
  - **Building:** the map's existing building tabs (one building at a time).
  - **Floors:** `All` plus a chip per floor, using our existing `Chips`, which are 44 pt and accessible.
    `@expo/ui` 57 has no segmented control (only `Picker` with menu/wheel), so `Chips` stay.
  - **Explode:** `Slider` from `@expo/ui` (universal; `value`, `onValueChange`, `min` 0, `max` 3, `step` 0.1) inside `Host`.
  - **View:** chips for 3D / Top / Front / Follow route (Follow route only when a route is shown), plus Reset.
  - **Full screen:** a button that opens the 3D view as a route `src/app/map-3d.tsx` with
    `presentation: 'fullScreenModal'` (a native stack option, not a hand-made transition), with the same strip at the
    bottom.
- **Room details:** a tap in 3D calls `onPick`, and native opens a `BottomSheet` from `@expo/ui` (`isPresented` /
  `onDismiss`, auto-sized). It shows the room name, floor, people inside, hazard, SOS here, and "Route from here" (sets
  that room as the route start). It replaces the old floating name box.
- **Key polish:**
  - **Haptics** via `npx expo install expo-haptics`:
    - `selectionAsync` on floor/view chip changes;
    - `impactAsync(Medium)` on Send SOS;
    - `notificationAsync(Success)` when an SOS is sent and on check-in safe;
    - `impactAsync(Light)` on EVACUATE NOW.
    - One haptic per action, always with a visual, fired in the same frame.
  - **Press feedback:** the `ui.tsx` `Button` and the home tiles scale to 0.97 in 120 ms through a Reanimated CSS
    transition (`transitionProperty: 'transform'`, `cubicBezier(0.23, 1, 0.32, 1)`). With reduced motion
    (`useReducedMotion`), opacity only. Feedback on press-in.
  - **Alert details sheet:** tapping the alert band opens a `BottomSheet` with the full message, translations, time,
    and **Evacuate now** / **All alerts** buttons, instead of jumping to the Alerts screen.
- **Tests (jest):**
  - `@expo/ui` mocked to plain RN views (Slider renders a pressable that calls `onValueChange`; BottomSheet renders
    children when `isPresented`);
  - `expo-haptics` mocked;
  - map 3D: chips/slider update the props passed to `Campus3DView` (mocked);
  - a pick opens the room sheet with "3 people inside";
  - SOS send calls `impactAsync` and `notificationAsync(Success)`;
  - tapping the alert band opens the sheet and Evacuate now goes to the route;
  - reduced motion: no scale.
- **Build:** `expo-haptics` adds native code, so a new APK is needed (it already is for the 3D work).
  `@expo/ui` is already installed (57.0.23).

These additions extend the implementation plan (`docs/superpowers/plans/2026-10-23-campus-3d-viewer.md`):
- Task 2 gains the single-building scene;
- Task 4 gains `setBuilding` rebuild;
- Task 6 becomes "phone native controls + room sheet";
- a new Task 6b covers haptics, press feedback and the alert sheet.

The spec gets the same sections.

