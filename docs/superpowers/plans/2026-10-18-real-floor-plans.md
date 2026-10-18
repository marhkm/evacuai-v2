# Real Floor Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose Native execution in Phase 1). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annex 1 campus data is imported from the official evacuation PDFs. 2D maps and the 3D view are redrawn in the poster style: real walls, door swings, blue labels, and red chevron routes.

**Architecture:**
- **Importer:** a local Python (PyMuPDF) tool writes a `plan` block (walls, doors, stairs, labels, arrows, in metres), room outlines and a draft graph into `campus-data/uclm/A1/floor-N.json`.
- **Data path:** `plan` flows through the TypeScript loader and snapshot, a new `floors.plan` database column, and `/api/campus-snapshot`.
- **Rendering:** `packages/campus-view` turns `plan` into drawable shapes and route chevrons for `FloorPlan.tsx`. `packages/campus-3d` raises the real walls.

**Tech Stack:** Python 3 + PyMuPDF (local tool, plus a CI self-test on synthetic PDFs), TypeScript (routing, campus-view, campus-3d / three.js), Expo `react-native-svg`, Laravel 13 (migration, seeder), Pest, Vitest, Jest.

**Spec:** `docs/superpowers/specs/2026-10-18-real-floor-plans-design.md`

## Global Constraints

- **The PDFs are never committed, copied into the repository or uploaded.** Debug PNGs go to the system temp folder.
- **Only these leave a PDF:** geometry inside the plan area (the bounding box of the gray 0.86 strokes, plus 2%) and blue (`0x0000ff`) text inside that area.
- **Annex 1 levels:**

  | Level | Name | elevation_m |
  |---|---|---|
  | 1 | Ground | 0 |
  | 2 | Mezzanine | 1.75 |
  | 3 | Second | 3.5 |
  | 4 | Third | 7 |
  | 6 | Fifth | 14 |
  | 7 | Sixth | 17.5 |

  Every floor has `height_m` 3.5. Level 5 (Fourth) is **absent**, so the stairs link level 4 directly to level 6.
  - **Ruling:** levels are ordinal integers, and names carry the poster labels.
- **Assembly:** `A1/1/AP_Outside`, "Off-campus assembly area", `safe_for: ["earthquake", "fire"]`, reached by `outdoor` edges whose estimated distances are flagged `["estimated"]`. The OPEN GROUND courtyard is a label only and never a destination.
- **Route color** `#D7263D` (red chevrons). **Blocked paths** are never drawn red: dark hatched with a ✕. **Congested paths** are amber `#F2A900`. **Labels** are blue `#1F3FBF`.
- **Scale:** metres per point = 0.9 ÷ the median door-arc radius, unless `import.json` sets `scale_m_per_pt`.
- **3D triangle budget:** under 60,000 for the full UCLM snapshot.
- **No new npm dependencies.**
- **Commits:** no AI attribution. Commit only when the user asks.

## Review Focus

1. **A floor without `plan` (Basic Ed, demo)** must still render, using room outlines as walls, in both 2D and 3D. Tests are in Tasks 5 and 7.
2. **A route that leaves the building** (to `AP_Outside`, off the floor plan) must not draw chevrons into empty space. Draw only the on-floor part, plus an "Exit to off-campus assembly area" badge. Test in Task 5.
3. **Unknown keys in floor JSON still fail loudly**, after `plan` is allowed. Test in Task 1.
4. **Snapshot size and ETag:** the `plan` coordinates are rounded to 2 decimals, and the snapshot stays under 1.5 MB. Test in Task 4.
5. **A label that falls outside every enclosed region** (an open area or a link) must not crash the room flood-fill and must not create a room. Test in Task 2.

---

### Task 1: `plan` in the TypeScript data model

**Files:**
- `packages/routing/src/types.ts`:
  - add `FloorPlan { walls: Point[][]; doors: { hinge: Point; r: number; from: number; to: number }[]; stairs: Point[][]; labels: { text: string; x: number; y: number }[]; arrows: { x: number; y: number; deg: number }[] }`;
  - add `plan?: FloorPlan` on `Floor`.
- `packages/routing/src/load.ts`:
  - `KEYS.floor` gains `plan`, plus a new `KEYS.plan` (walls, doors, stairs, labels, arrows) check;
  - the loader copies `data.plan` onto the matching `Floor` in `buildings[].floors[]`.
- `packages/routing/src/cli/snapshot.ts`: no change expected, since the snapshot serializes `buildings`.
- Test: `packages/routing/test/load.test.ts`.

- [ ] **Step 1: Write failing tests:**
  - `loads a floor plan onto its floor`: the fixture floor JSON with a small `plan` produces `snap.buildings[0].floors[0].plan.walls.length === 2`.
  - `rejects unknown plan keys`: `plan: { wals: [] }` throws `unknown key "wals"`.
- [ ] **Step 2: Run** `npx vitest run packages/routing/test/load.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, then `npm run validate` and `npm run snapshots`. Expected: PASS; snapshots are unchanged because no data has a `plan` yet.

### Task 2: PDF importer

**Files:**
- Create: `campus-data/tools/import_pdf_plan.py`. It exposes `extract(pdf_path, level, name, scale=None) -> dict` (the floor dict, with `plan` and `rooms`) and `main(building)`, which reads `<campus>/<B>/import.json`. It writes `floor-<level>.json`, keeping any existing `nodes`/`edges` unless `--graph` is given and none exist.
- Create: `campus-data/tools/test_import_pdf_plan.py`, which builds a synthetic PDF with PyMuPDF.
- Create: `campus-data/uclm/A1/import.json`: `{"campus_dir": "..", "files": [{"pdf": "plan-ground.pdf", "level": 1, "name": "Ground"}, ...]}`. The PDFs are read from `source/`.

**Algorithm decisions** (the implementer writes the bodies):
- **Plan area:** the bounding box of the strokes with color (0.86, 0.86, 0.86), grown by 2%.
- **Walls:** line items of black (0, 0, 0) width-0.72 strokes and gray strokes inside the area, rounded to 0.01 m after scaling. Merging into polylines is optional (separate 2-point segments are acceptable).
- **Doors:** red (1, 0, 0) stroke drawings containing a `c` item inside the area. The hinge is the curve endpoint nearest a black wall endpoint; the radius is the distance from the hinge to the far endpoint; the angles come from `atan2`.
- **Stairs:** orange (0.87, 0.43, 0) segments clustered within 3 m, each cluster as its convex hull.
- **Labels:** spans with `color == 0x0000ff` inside the area, merged when the vertical gap is under 1.2 × size and the horizontal centres are within 2 × size. Text is joined with spaces and uppercased.
- **Arrows:** red-fill (1, 0, 0) drawings inside the area. The centroid gives the position; `deg` points toward the vertex farthest from the centroid.
- **Rooms:** rasterize the walls into a numpy-free `bytearray` grid at 4 px/m, then BFS from each label's point. If the region touches the grid edge or covers more than 40% of the area, it is open space, so no room. Otherwise the polygon is the convex hull of the region's cells, capped at 12 points.
  - **Id:** uppercase, non-alphanumerics → `_`.
  - **Type:** `CR` → `restroom`, `OFFICE` → `office`, `FACULTY` → `office`, `LAB` → `lab`, `ELEVATOR` → `elevator`, otherwise `classroom`.
  - **Not rooms:** labels starting with `TO ` or equal to `OPEN GROUND` are skipped.
- **Coordinates:** points minus the plan area's top-left corner, times the scale. Every coordinate is rounded to 2 decimals.

- [ ] **Step 1: Write failing tests** in `test_import_pdf_plan.py`, using plain asserts run from `__main__`:
  - **Synthetic page:** gray outline 100–500 pt; black walls forming two rooms; a red quarter-circle door with a 36 pt radius; blue labels "ROOM" / "A-1" stacked in room 1; a blue "OPEN GROUND" outside the rooms but inside the area; a black text "MR. JUAN DELA CRUZ" outside the area; a black text "NOTE" inside the area; a red filled arrow.
  - `scale == 0.9 / 36`;
  - labels `== ["ROOM A-1", "OPEN GROUND"]`, with no "JUAN" or "NOTE" anywhere in `json.dumps(result)`;
  - one room `ROOM_A_1` whose polygon contains the label point, and no room for OPEN GROUND;
  - one door with `r ≈ 0.9`;
  - the arrow `deg` within 5° of the drawn direction.
- [ ] **Step 2: Run** `python -I campus-data/tools/test_import_pdf_plan.py`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `import_pdf_plan.py`.
- [ ] **Step 4: Run** the test. Expected: `ok`.

### Task 3: Import Annex 1 and build its graph

**Files:**
- Create: `campus-data/uclm/A1/building.json` (levels as in Global Constraints; `origin` null; `footprint` from the ground floor's plan area).
- Create: `campus-data/uclm/A1/floor-{1,2,3,4,6,7}.json` (importer output plus the graph).
- Modify: `campus-data/uclm/campus.json`: buildings `["BE", "A1"]`; add assembly point `{id: "AP_Outside_A1", node_id: "A1/1/AP_Outside", lat: null, lng: null, radius_m: 50}`.
- Regenerate: `campus-data/uclm.snapshot.json` via `npm run snapshots`.
- Test: `packages/routing/test/a1-poster.test.ts`.

- [ ] **Step 1:** Run the importer with `--graph`. Review the debug PNG (temp folder) for each floor.
- [ ] **Step 2: Complete the graph by hand** where the draft is wrong or incomplete:
  - corridor chain;
  - door → corridor links;
  - stairs linked across 1↔2↔3↔4↔6↔7;
  - ground exits → `AP_Outside` (`outdoor`, `flags: ["estimated"]`);
  - the elevator node with type `elevator`.
- [ ] **Step 3: Write failing tests:**
  - `npm run validate` passes for `campus-data/uclm`.
  - `a1-poster.test.ts`: for each Annex 1 floor, the fire route from the room farthest from any exit ends at `A1/1/AP_Outside`. The corridor nodes it passes on that floor appear in the poster's arrow order: each arrow's nearest route node index is non-decreasing.
- [ ] **Step 4: Run** `npx vitest run packages/routing/test/a1-poster.test.ts` and `npm run validate`. Expected: PASS after the graph fixes.

### Task 4: API stores and serves `plan`

**Files:**
- Create: `api/database/migrations/2026_10_18_000000_add_plan_to_floors_table.php` (`json('plan')->nullable()`).
- Modify: `api/database/seeders/CampusSeeder.php` (floors upsert includes `plan` as JSON).
- Modify: `api/app/Http/Controllers/Api/CampusSnapshotController.php` (`buildings[].floors[].plan` decoded, omitted when null).
- Test: `api/tests/Feature/CampusSeederTest.php`, `api/tests/Feature/CampusSnapshotTest.php`.

- [ ] **Step 1: Write failing tests:**
  - seeding `uclm` stores a non-null `plan` for A1 level 1 and null for BE level 1;
  - the snapshot JSON has `buildings` A1 `floors[0].plan.walls` non-empty, and no `plan` key on BE floors;
  - the full snapshot response body is under 1,500,000 bytes.
- [ ] **Step 2: Run** them (Herd PHP in PowerShell). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, plus `php artisan test`. Expected: PASS.

### Task 5: campus-view: plan shapes and route chevrons

**Files:**
- Modify: `packages/campus-view/src/index.ts`. Add:
  - `toPlanShapes(snap, building, level): PlanShapes`, where `PlanShapes = { walls: Point[][]; doors: string[] /* SVG arc path d */; stairs: Point[][]; labels: { text: string; x: number; y: number }[]; bounds: { minX; minY; w; h } }`. The fallback when there is no `plan`: walls = closed room polygons, labels = room names at centroids (corridors excluded), and doors/stairs empty.
  - `routeChevrons(points: Point[], spacing = 1.5): { x: number; y: number; deg: number }[]`, chevrons along the polyline at a fixed spacing, starting 0.75 m in.
  - `exitBadge(snap, route, building, level): string | null`: "Exit to <destination name>" when the route continues off this floor to a node in another building or an outdoor node, otherwise null.
- Test: `packages/campus-view/test/plan.test.ts`.

- [ ] **Step 1: Write failing tests:**
  - `toPlanShapes` for a fixture with `plan` returns its walls, labels and door path strings starting with `M`;
  - without `plan`, walls equal the room polygons and labels the room names;
  - `routeChevrons([[0,0],[6,0]])` gives 4 chevrons at x = 0.75, 2.25, 3.75 and 5.25, all with `deg` 0;
  - `routeChevrons` over a right-angle corner gives degrees 0 then 90;
  - `exitBadge` for a route ending at `AP_Outside`, on the ground floor, is `'Exit to Off-campus assembly area'`.
- [ ] **Step 2: Run** `npx vitest run packages/campus-view`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.

### Task 6: Mobile FloorPlan in poster style

**Files:**
- Modify: `mobile/src/components/FloorPlan.tsx`. Props change to `{ snapshot, building, level, route?: Point[], you?: Point, edges?: FloorShapes['edges'] }`; callers pass these instead of `shapes`. Drawing order as in the spec:
  - white sheet;
  - invisible room hit polygons (keeping each room's `accessibilityLabel`);
  - walls `#1B1F24`;
  - door arcs;
  - stair hatch `#C4651F`;
  - labels `#1F3FBF` uppercase;
  - hazard rooms tinted `#F8D7DA`;
  - blocked edges as a hatched dark bar with a ✕, congested edges amber;
  - route chevrons `#D7263D` on a thin red line;
  - the "You are here" green figure `#2BA84A` with label;
  - a collapsible legend chip.
- Modify the callers: `mobile/src/app/map.tsx`, `mobile/src/app/route.tsx`, and `mobile/src/components/StackedFloors.tsx` if it uses `FloorPlan`.
- Test: `mobile/src/__tests__/floorPlan.test.tsx`.

- [ ] **Step 1: Write failing tests** (render with a tiny snapshot fixture):
  - a route of 6 m renders 4 elements labelled "Route direction";
  - a blocked edge renders with the accessibility label "Blocked path" and no `#D7263D` stroke;
  - the "You are here" label exists;
  - a floor without `plan` still renders the room labels.
- [ ] **Step 2: Run** `npx jest src/__tests__/floorPlan.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement**, and update the callers.
- [ ] **Step 4: Run** `npx jest` and `npx tsc --noEmit`. Expected: all pass.

### Task 7: 3D real walls and route arrows

**Files:**
- Modify: `packages/campus-3d/src/index.ts`:
  - `buildScene` raises `plan.walls` segments as boxes 0.15 m thick and `height_m - 0.3` tall, merged per floor (`BufferGeometryUtils.mergeGeometries` from three's examples, already a dependency through `three`);
  - room polygons become walls when there is no `plan`;
  - one translucent slab per floor;
  - `explode(factor: number)` spreads levels apart;
  - `showRoute` draws red arrow decals using `routeChevrons` from campus-view, plus vertical connectors at stairs.
- Modify: `packages/campus-3d/src/mount.ts` (the explode slider control is exposed on the viewer API).
- Rebuild: `npm run build:3d` (the committed `api/public/js/campus-3d.js`).
- Test: `packages/campus-3d/test/*.test.ts`.

- [ ] **Step 1: Write failing tests:**
  - for the UCLM snapshot, `triangleCount(scene) < 60000`;
  - the walls mesh exists for A1 level 1 and for BE level 1 (the fallback);
  - after `showRoute`, the route group's arrow count equals `routeChevrons(...)` length;
  - `explode(2)` raises level 7 above its normal height.
- [ ] **Step 2: Run** `npx vitest run packages/campus-3d`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npm run build:3d`. Expected: PASS, with the bundle regenerated.

### Task 8: CI, docs, and stack check

**Files:**
- Modify: `.github/workflows/ci.yml`. The core job adds `actions/setup-python@v5` (3.12) + `pip install pymupdf==1.26.4`, then runs `python -I campus-data/tools/test_import_pdf_plan.py`.
- Modify: `docs/USER-MANUAL.md` (maps section: poster-style map, red arrows, blocked style, Annex 1 available) and `npm run manual`.

- [ ] **Step 1:** Run all suites: `php artisan test`, `npx jest` (mobile), `npx vitest run` (packages), `npx tsc --noEmit`, `npm run validate`, the importer test.
- [ ] **Step 2: Docker:** run `docker compose -f docker/compose.yml up -d --build`. Open http://localhost:8081, then Map, then Annex 1, and check the walls, labels and route chevrons. Check Campus 3D in the admin panel.
- [ ] **Step 3: Final review:** a fresh reviewer (opus) on the whole working tree.
