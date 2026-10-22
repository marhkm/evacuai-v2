# Polished 3D Campus Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose Native execution in earlier phases). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the shared three.js campus viewer looks like a clean architectural model and has built-in controls:
- building;
- All floors / one floor;
- explode;
- view presets (3D / Top / Front / Follow route);
- tap-to-focus.

It is used by the phone app and the Command Center.

**Architecture:** `packages/campus-3d` keeps the existing public functions:
- `buildScene`, `applyStatus`, `showRoute`, `explode`, `triangleCount`;
- `mount` and `Viewer`.

Inside, it changes in three ways:
- **Geometry** moves into `src/scene/*`.
- **Pure view logic** (camera presets, floor visibility and opacity) goes in `src/views.ts`, testable without WebGL.
- **The overlaid HTML control bar** goes in `src/controls.ts`. `mount.ts` wires renderer, labels (CSS2DRenderer),
  camera transitions and quality.

**Tech Stack:**
- three 0.181 with `three/examples/jsm/utils/BufferGeometryUtils.js`, `renderers/CSS2DRenderer.js` and
  `controls/OrbitControls.js` (all installed);
- Vitest (jsdom for controls);
- Expo DOM component (phone) and React (Command Center).

**Spec:** `docs/superpowers/specs/2026-10-23-campus-3d-viewer-design.md`

## Global Constraints

- **Dependencies:** no new runtime dependencies.
- **Geometry values:**
  - walls are 0.15 m thick and full floor height (`height_m` − 0.15 slab);
  - one merged wall mesh per floor;
  - whole-campus triangle budget under **120,000**.
- **Floor styles:**
  - "All floors": upper floors' walls at opacity 0.25 (top floor solid);
  - one floor: focused floor solid, floors above hidden, floors below at opacity 0.15.
- **Camera:** transitions of about 600 ms, eased; instant when `matchMedia('(prefers-reduced-motion: reduce)')` matches.
- **Quality:**
  - `'high'`: shadows on (one directional light, 2048 map), pixelRatio ≤ 2;
  - `'low'`: no shadows, pixelRatio ≤ 1.5, room labels on the focused floor only.
- **Controls:** 44 px+ hit targets, every button has an accessible name, keyboard reachable.
- **Labels:** room labels only on the focused floor; building labels only in All floors.
- **API compatibility:** `update`, `route`, `explode` and `dispose` keep their signatures; `peel` is replaced by `setFloor`.
- **Commits:** no AI attribution; commit and push only when the user asks.

## Review Focus

1. **Basic Ed (no traced plan):** walls come from room outlines, and the controls and labels still work. Test in Task 2.
2. **Floor switch while exploded:** the focus camera targets the exploded floor height, not the base height. Test in Task 1.
3. **A route that changes floors with one floor focused:** route segments on hidden floors are hidden too; the visible
   floor's segment stays. Test in Task 3.
4. **Live status updates** (`update`) after `setFloor`/`explode`: the floor styles stay. Hazard/heat materials must not
   reset opacity. Test in Task 2.
5. **Repeated mount/dispose** (screens switching 2D/3D): no leaked DOM (labels, control bar) left in the element. Test
   in Task 4.

---

### Task 1: Pure view logic (`views.ts`)

**Files:**
- Create: `packages/campus-3d/src/views.ts`
- Test: `packages/campus-3d/test/views.test.ts`

**Interfaces:**
- Produces:
  - `type FloorKey = string` (`"<building>/<level>"`).
  - `type Focus = { building: string; level: number | null }`.
  - `floorStyles(floors: { key: FloorKey; building: string; level: number }[], focus: Focus): Map<FloorKey, { visible: boolean; opacity: number; labels: boolean }>`
    (One building per scene, so only that building's floors are passed in.)
  - `type Preset = '3d' | 'top' | 'front' | 'route'`.
  - `cameraFor(preset: Preset, box: { min: [number, number, number]; max: [number, number, number] }, opts?: { routeStart?: [number, number, number] }): { position: [number, number, number]; target: [number, number, number] }`
    - `target` = box centre (for `'route'`: `routeStart` if given).
    - `'top'`: position directly above the target (x and z equal to the target).
    - `'3d'`: from the south-east, elevation about 35°.
    - `'front'`: from the south, low.
    - Distance fits the box diagonal at a 45° field of view (like today's `mount`).

- [ ] **Step 1: Failing tests** (`views.test.ts`):
  - `floorStyles` for building A with levels 1, 2, 3:
    - with `{ building: 'A', level: null }`: all visible; opacity of levels 1 and 2 is 0.25, level 3 is 1; `labels` is
      false for every floor.
    - with `level: 2`: level 3 is hidden, level 2 has opacity 1 and labels true, level 1 has opacity 0.15.
  - `cameraFor`:
    - `'top'` puts x and z at the box centre, with y above `box.max[1]`;
    - `'3d'` puts position x > target x and z > target z;
    - `'route'` uses `routeStart` as target;
    - Review Focus 2: an exploded box (larger max y) gives a higher target y.
- [ ] **Step 2:** `npx vitest run packages/campus-3d/test/views.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement both functions in `views.ts`.
- [ ] **Step 4:** Rerun. Expected: PASS.

### Task 2: Architectural-model geometry (`scene/*`, `buildScene`)

**Files:**
- Create:
  - `packages/campus-3d/src/scene/walls.ts`
  - `packages/campus-3d/src/scene/stairs.ts`
  - `packages/campus-3d/src/scene/floors.ts`
- Modify: `packages/campus-3d/src/index.ts` (`buildScene`, `applyStatus`, `COLORS`, materials; remove `wallMesh` and
  `WALL_HEIGHT`)
- Test: `packages/campus-3d/test/campus3d.test.ts` (update) and `packages/campus-3d/test/scene.test.ts`

**Interfaces:**
- Produces:
  - `thickWalls(lines: Point[][], opts: { dx: number; height: number; thickness?: number }): THREE.BufferGeometry`
    - One box per segment (skip segments under 0.05 m), merged with `mergeGeometries`; `thickness` defaults to 0.15.
  - `stairSteps(poly: Point[], opts: { dx: number; height: number; steps?: number }): THREE.BufferGeometry`
    - Steps along the polygon's longer bounding-box axis; `steps` defaults to 12.
  - `slab(box: THREE.Box3, y: number): THREE.Mesh` and
    `roomInlay(room: Room, dx: number, y: number, material: THREE.Material): THREE.Mesh`.
  - `buildScene(snap: CampusSnapshot, opts: { building: string }): Campus3D` builds **only that building**, centred on
    the origin (no side-by-side `offsets` / `GAP_M`); `Campus3D.building: string`. Nodes, edges and route points of
    other buildings are skipped.
  - `Campus3D` gains `labels: { building: Map<string, THREE.Vector3>; rooms: Map<string, { pos: THREE.Vector3; name: string; floor: FloorKey }> }`.
    - These are label anchor points only; `mount` creates the DOM labels.
  - `Campus3D` gains `setFloorStyles(styles: ReturnType<typeof floorStyles>): void`.
    - Applies visibility and opacity to each floor group's walls, inlays and slab. Per-floor material clones are made
      once and cached.
  - `COLORS`:
    - `wall: 0xF4F1EA`;
    - `wallTop: 0xD9D4C7`;
    - `slab: 0xE3E6EA`;
    - room tints: classroom `0xDDEBF7`, office `0xF3E8D6`, lab `0xE5DDF2`, corridor `0xF7F7F5`, stairwell `0xCFE0F5`,
      exit `0xCDEBD6`;
    - `ground: 0xEEF1EC`;
    - existing status colours kept.
  - Ground plane: a 1 m grid, named `'ground'`, sized to the campus bounds + 20 m.
  - Lights: hemisphere + directional `'sun'` with `castShadow` set by `mount`.
  - Fog: `scene.fog = new THREE.Fog(0xEEF1EC, size * 1.5, size * 4)`.

- [ ] **Step 1: Failing tests** (`scene.test.ts`):
  - `thickWalls([[[0,0],[10,0]]], {dx:0, height:3.35})` bounding box: x 0..10, y 0..3.35, z depth 0.15 (±0.01).
  - Each A1 floor group has exactly one mesh named `'walls'`.
  - `stairSteps` on a 2×4 m rectangle has 12 distinct top heights.
  - The whole uclm snapshot has `triangleCount < 120_000`. Update the old 50k assertions in `campus3d.test.ts` to 120k.
  - Basic Ed (no plan) still gets walls from room outlines, and `labels.rooms` has entries for its rooms (Review Focus 1).
  - `buildScene(uclm, { building: 'A1' })` has no floor group starting with `BE/`; Annex 1 alone is under 120k triangles.
  - `setFloorStyles` then `applyStatus` with a hazard room keeps the hidden floor hidden and the ghost opacity on other
    floors (Review Focus 4).
- [ ] **Step 2:** `npx vitest run packages/campus-3d`. Expected: new tests FAIL; the existing route and arrow tests still
  pass.
- [ ] **Step 3:** Implement the scene files and rewire `buildScene`. Keep room meshes in `campus.rooms` (inlays), so
  `applyStatus` and picking keep working. Hazard uses an emissive red material; heat keeps its scale.
- [ ] **Step 4:** Rerun `npx vitest run packages/campus-3d`. Expected: all PASS.

### Task 3: Route ribbon (`scene/route.ts`)

**Files:**
- Create: `packages/campus-3d/src/scene/route.ts`
- Modify: `index.ts` `showRoute`
- Test: `campus3d.test.ts`

**Interfaces:**
- Produces:
  - `routeRibbon(points: THREE.Vector3[], width?: number): THREE.Mesh`
    - Flat strip 0.6 m wide, 0.05 m above the floor. UVs run along its length (u = metres / 1.5), so a chevron texture
      repeats every 1.5 m.
    - Material map is a canvas chevron texture, created lazily (no canvas in Node: fall back to a plain red material).
  - `showRoute` puts per-floor ribbons in groups named `'route-<floorKey>'` under `overlay.route`, plus the existing
    arrows and a thin vertical `'route-link'` tube between floors.
  - `Campus3D.routeTick(dt: number): void` scrolls the texture offset; `mount` calls it.

- [ ] **Step 1: Failing tests:**
  - After `showRoute` for `A1/7/R_A_67` (fire), the route group's child groups are named `route-A1/7`, `route-A1/6`, …
  - The ribbon length for one floor equals the polyline length (±0.5 m).
  - After `setFloorStyles` focusing `A1/4`, route groups of hidden floors are not visible (Review Focus 3).
  - The existing "stops at exit" and "one arrow per chevron" tests still pass.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `setFloorStyles` also toggles `route-<key>` groups.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 4: Viewer API, labels, transitions, quality (`mount.ts`)

**Files:**
- Modify: `packages/campus-3d/src/mount.ts`
- Test: `packages/campus-3d/test/mount.test.ts` (jsdom; WebGLRenderer replaced through an injected `createRenderer`
  option)

**Interfaces:**
- Consumes: Task 1 `floorStyles` and `cameraFor`; Task 2 `labels` and `setFloorStyles`; Task 3 `routeTick`.
- Produces:
  - `mount(el, snap, opts: { onPick?; quality?: 'high' | 'low'; controls?: boolean; initial?: Partial<Focus>; createRenderer?: () => RendererLike })`.
    - `createRenderer` exists for tests only and defaults to `new THREE.WebGLRenderer({ antialias: quality === 'high' })`.
  - `Viewer`:
    - existing: `update`, `route`, `explode(f)`, `dispose`, and `campus` (a getter: the current building's scene);
    - `setBuilding(id: string): void`;
    - `setFloor(level: number | null): void`;
    - `setView(p: Preset): void`;
    - `focusRoom(id: string): void`;
    - `reset(): void`;
    - `state(): { building: string; level: number | null; view: Preset; explode: number; hasRoute: boolean }`;
    - `onChange(cb: (s: ReturnType<Viewer['state']>) => void): () => void`.
  - Labels: `CSS2DRenderer` layer appended to `el`, class `evac3d-label`; room labels only for floors whose style has
    `labels: true`.
  - Transitions: `requestAnimationFrame` tween of camera position and `controls.target` over 600 ms with ease-in-out.
    Rendering stays on demand: frames run only while tweening or while a route ribbon is shown (to scroll it).
  - `'top'` locks rotation (`controls.enableRotate = false`); other presets unlock it.

- [ ] **Step 1: Failing tests** (fake renderer):
  - `setFloor(4)` after `setBuilding('A1')` gives `state()` level 4, and the `A1/7` group is not visible.
  - `setView('top')` disables rotation.
  - `dispose()` leaves `el` with no children (Review Focus 5, repeated 3 times).
  - `setBuilding('BE')` after `A1`: no `A1/*` groups remain, the old geometries are disposed (spy on `dispose`), and the
    last `update(live)` and `route()` are re-applied to the new scene.
  - Room label elements exist only for the focused floor.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 5: Control bar and focus card (`controls.ts`)

**Files:**
- Create: `packages/campus-3d/src/controls.ts`
- Modify: `mount.ts` (attach when `controls !== false`)
- Test: `packages/campus-3d/test/controls.test.ts` (jsdom, with a fake `Viewer`)

**Interfaces:**
- Produces: `attachControls(el: HTMLElement, viewer: Viewer, snap: CampusSnapshot): () => void` (detach).
- DOM structure (an inline `<style>` in the bar, scoped by class `evac3d-*`, Signage colours):
  - a toolbar with `role="toolbar"`, `aria-label="3D view controls"`;
  - building `<select aria-label="Building">`;
  - floor buttons `All`, plus `aria-pressed` buttons named after each floor (for example "Ground", "Third");
  - `<input type="range" aria-label="Explode floors" min=0 max=3 step=0.1>`;
  - view buttons `3D`, `Top`, `Front`, `Follow route` (hidden when `!state().hasRoute`) and `Reset`;
  - a focus card (`role="dialog"`, `aria-label="Room details"`) listing the room name, floor, "N people inside", Hazard,
    SOS here, and a `Close` button. It is filled from `onPick` data (`roomId`, `name`, `count`, `hazard`).
- Floor short labels on narrow screens (< 480 px): G, M, 2, 3, … from the floor name's first letter or number.

- [ ] **Step 1: Failing tests:**
  - Clicking "Third" calls `viewer.setFloor(4)` and sets `aria-pressed`.
  - Changing the building select calls `setBuilding('BE')`.
  - The range input calls `explode(1.5)`.
  - "Top" calls `setView('top')`.
  - "Follow route" is absent without a route and present after `onChange` reports `hasRoute: true`.
  - A pick on a room with `count: 3, hazard: true` shows "3 people inside" and "Hazard" in the dialog.
  - Every button has an accessible name.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 6: Consumers, with native controls on the phone

`expo-dom` rule: native chrome, and the DOM component holds only the canvas.

**Files:**
- Modify:
  - `mobile/src/components/Campus3DView.tsx` (DOM: canvas only, `mount(..., { controls: false })`);
  - `mobile/src/app/map.tsx` (3D mode uses the native strip);
  - `mobile/src/lib/can3d.ts` (`quality3d()`);
  - `command/src/components/View3D.tsx` (`building`, `level`, HTML controls, `quality: 'high'`);
  - `command/src/screens/LiveOps.tsx` and `command/src/screens/Replay.tsx` (building/floor picker passed in; Replay
    gains `FloorPicker`).
- Create:
  - `mobile/src/components/Map3DControls.tsx` (native strip);
  - `mobile/src/components/RoomSheet.tsx` (`@expo/ui` `BottomSheet`);
  - `mobile/src/app/map-3d.tsx` (full screen; `Stack.Screen options={{ presentation: 'fullScreenModal' }}`).
- Test:
  - `mobile/src/__tests__/map3d.test.tsx`;
  - existing `map.test.tsx`, `command` LiveOps and Replay tests.

**Interfaces:**
- `Campus3DView` props (all serializable plus one async callback):
  - `snapshot`, `building: string`, `level: number | null`, `view: Preset`, `explode: number`, `route?: Route | null`,
    `quality: 'high' | 'low'`, `focusRoomId?: string | null`;
  - `onPick?: (info: { roomId?: string; name?: string; count?: number; hazard?: boolean; pinId?: string; label?: string }) => Promise<void>`;
  - `dom?: DOMProps`.
- `Map3DControls({ building, floors, level, onLevel, view, onView, explode, onExplode, hasRoute, onReset, onFullScreen })`:
  - floors as `Chips` (`All` + one per floor);
  - views as `Chips` (`3D`, `Top`, `Front`, `Follow route` only when `hasRoute`) and a `Reset` button;
  - explode as `Slider` from `@expo/ui` (min 0, max 3, step 0.1) in `<Host matchContents>`;
  - a "Full screen" button.
- `RoomSheet({ room: { name, floor, count, hazard, sos } | null, onClose, onRouteFrom })`:
  - `BottomSheet` with `isPresented={!!room}` and `onDismiss={onClose}`;
  - text "N people inside", "Hazard reported", "SOS here";
  - button "Route from here" calls `onRouteFrom`.
- `quality3d(): 'high' | 'low'`: `'low'` when `Device.totalMemory < 4 GB`, or on web when
  `navigator.hardwareConcurrency < 6`.

- [ ] **Step 1: Failing tests** (`map3d.test.tsx`):
  - `@expo/ui` mocked: `Host` renders children; `Slider` is a pressable labelled "Explode floors" that calls
    `onValueChange(2)`; `BottomSheet` renders children when `isPresented`.
  - `Campus3DView` mocked to record its props.
  - On the map's 3D mode:
    - tapping "Third" passes `level: 4`;
    - "Top" passes `view: 'top'`;
    - the slider passes `explode: 2`;
    - "All" passes `level: null`.
  - Calling the recorded `onPick({ roomId: 'A1/4/A_31', name: 'A-31', count: 3, hazard: true })` shows a sheet with
    "3 people inside" and "Hazard reported".
  - `quality3d()`: 2 GB gives `'low'`, 6 GB gives `'high'`.
- [ ] **Step 2:** `cd mobile && npx jest --runInBand src/__tests__/map3d.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the mobile pieces and the Command Center props.
- [ ] **Step 4:** Run the whole mobile suite, `npm test -w command`, both `tsc --noEmit`, and `npx expo lint`.
  Expected: all PASS.

### Task 6b: Haptics, press feedback, alert sheet (phone)

**Files:**
- Install: `npx expo install expo-haptics` (in `mobile/`).
- Create: `mobile/src/lib/haptics.ts`:
  - `tap()` → `selectionAsync`;
  - `light()`, `medium()` → `impactAsync`;
  - `success()` → `notificationAsync(Success)`;
  - each is a no-op on web and swallows errors.
- Modify:
  - `mobile/src/components/ui.tsx` (`Button`: Reanimated CSS transition on `transform` scale 0.97, 120 ms,
    `cubicBezier(0.23, 1, 0.32, 1)`, opacity only under `useReducedMotion()`; `Animated.View` wraps the label);
  - `mobile/src/app/index.tsx` (tiles: same press scale; EVACUATE NOW calls `light()`);
  - `mobile/src/components/Chips.tsx` (`tap()` on change);
  - `mobile/src/app/sos.tsx` (`medium()` on Send SOS press, `success()` when it is sent);
  - `mobile/src/app/checkin.tsx` (`success()` on a safe check-in);
  - `mobile/src/components/AlertBanner.tsx` (opens `AlertSheet` instead of routing).
- Create: `mobile/src/components/AlertSheet.tsx`:
  - `BottomSheet` with the title, message, translations and issued time;
  - buttons "Evacuate now" (goes to `/route`) and "All alerts" (goes to `/alerts`).
- Test: `mobile/src/__tests__/polish.test.tsx`.

- [ ] **Step 1: Failing tests:**
  - with `expo-haptics` mocked, pressing Send SOS calls `impactAsync`, and after the POST `notificationAsync` with
    Success;
  - tapping the alert band shows a sheet with the message and "Evacuate now", which goes to the route;
  - `useReducedMotion` mocked to true means the pressed Button style has no `transform`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full mobile suite, `tsc`, lint. Expected: PASS.
  - Update `alerts.test.tsx` if it relied on the banner navigating to `/alerts` (now "All alerts" in the sheet).

### Task 7: Visual check, e2e, docs

**Files:**
- Modify:
  - `e2e/app.spec.ts` (3D step: also expect `getByRole('toolbar', { name: '3D view controls' })`);
  - `e2e/command.spec.ts` (Live Ops: click `3D`, expect the toolbar and a canvas);
  - `scripts/capture-screens.mjs` (add `app-3d.jpg`, `command-3d-floor.jpg`, `command-3d-exploded.jpg`, launched with
    `--use-angle=swiftshader --enable-unsafe-swiftshader`);
  - `docs/WALKTHROUGH.md` (S4 and O2: the new controls and screenshots);
  - `npm run manual`.

- [ ] **Step 1:** Rebuild: `docker compose -f docker/compose.yml up -d --build`.
- [ ] **Step 2:** `npm run e2e` (`E2E_CHANNEL=msedge`). Expected: all pass.
- [ ] **Step 3:** `node scripts/capture-screens.mjs`. Read the screenshots (All floors, one floor, exploded, Top) in light
  and dark, and fix visual problems.
- [ ] **Step 4:** Update the walkthrough and run `npm run manual`. Final whole-branch review (fresh reviewer, opus).
