# Campus Core (pure TS) Implementation Plan — Plan 1 of 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TypeScript campus core that the server, mobile and 3D plans all consume:
- the campus data format, its loader and its validator (also a CLI);
- hazard-aware routing;
- barometric floor-change detection;
- the `campus-view` shape, overlay and step-text helpers;
- the demo campus and the Basic Ed (BE) data imported from the student prototype.

**Architecture:**
- Two npm-workspace packages with no build step. Consumers (Vite, Expo Metro, tsx) compile the TS sources directly.
- `packages/routing` owns the types, loading, validation, routing and floor detection.
- `packages/campus-view` turns a `CampusSnapshot` + `Route` into drawable shapes and text.
- `CampusSnapshot` is the contract. Plan 2's `/api/campus-snapshot` must return exactly this shape.

**Tech Stack:** Node 26, npm workspaces, TypeScript ^7.0, Vitest ^5.0, fast-check ^4.10, tsx ^4.23.

**Spec:** `docs/superpowers/specs/2026-10-08-campus-map-and-location-design.md` (§2, §3.1, §4.3, §7). Parent: `docs/PLAN.md`.

**Later plans (not here):**
- Plan 2: Laravel snapshot, location events, check-ins, QR sheet (needs foundation slices 1–2).
- Plan 3: mobile 2D/2.5D views, estimator, sensor adapters, trace-recording screen.
- Plan 4: `campus-3d`, the Filament Campus 3D page, the app 3D toggle.

## Global Constraints

- Hazards are exactly `earthquake`, `fire`, `flood`.
- Global IDs use the form `<building>/<level>/<local>`. A raw ID that already contains `/` is treated as global.
- Units are metres in a per-building local frame. Floors are placed vertically by `elevation_m`. `height_m` defaults to `3.5`.
- `floorDelta = height_m × 0.12` hPa. Falling pressure means going up.
- Elevator edges (`type: "elevator"`) are never routed, under any hazard.
- Default weights:
  - `congested` ×2.5
  - `fullAssemblyPenalty_m` 100
  - flag `glass`: earthquake ×3
  - flag `smoke`: fire ∞
  - flag `flood_prone`: flood ∞
- The student prototype github.com/Lexageda/evacuai is **read-only**. Only copy its SVGs and IDs.
- **Do not git commit.** User instruction: every "Commit" step is deferred until the user supplies the git identity and says go. Leave the changes in the working tree.
- Use npm workspaces, not pnpm. pnpm isn't installed, and npm ships with Node. This replaces the parent plan's pnpm mention.

**Spec extensions decided here** (small; recorded so later plans match):
- Node `type` adds `elevator`.
- Edge `type` adds `elevator`.
- Floors carry a display `name` ("Ground").
- Nodes may carry an optional `name`.
- `detectFloorChanges` takes `{ floorHeight_m }` (the current building's floor height) instead of a `floorHeights` list.

## Review Focus

1. **Malformed campus JSON** (trailing comma, a typo'd key): the loader throws an error naming the file, not a deep stack trace. Test in Task 1.
2. **Hazard reported in a room on the route** (e.g. fire at `Exit_South`): the route must not pass through or end at that room's nodes, except the origin itself. Test in Task 2.
3. **Assembly point with no `capacity`/`occupancy`**: no penalty and never `NaN` cost. Test in Task 2.
4. **Pressure samples with a gap** (app backgrounded for 2 minutes), **empty input**, or **25 Hz vs 5 Hz sampling**: no false floor change, and the same result at any rate. Test in Task 4.
5. **Stale or unknown QR node ID**, and **every exit blocked**: `findRoute` returns distinct `unknown_origin` / `no_safe_route` results instead of throwing, so the app can show "scan again" vs "no safe route — send SOS". Test in Task 2.

---

## File Structure

```
package.json                         root: workspaces, scripts (test, typecheck, validate)
tsconfig.base.json                   strict, ES2022, moduleResolution bundler, noEmit
vitest.config.ts                     include packages/*/test/**/*.test.ts
.gitignore                           node_modules/, coverage/
.github/workflows/ci.yml             npm ci → typecheck → test → validate
packages/routing/
  package.json                       name @evacuai/routing, main src/index.ts
  src/types.ts                       all shared types + DEFAULT_WEIGHTS + HAZARDS
  src/load.ts                        loadCampus(dir) — Node fs only
  src/route.ts                       findRoute()
  src/validate.ts                    validate()
  src/floorChange.ts                 detectFloorChanges()
  src/cli/validate.ts                CLI wrapper
  src/index.ts                       re-exports (except load.ts and cli, which are Node-only)
  test/*.test.ts
  test/helpers/demo.ts               loadDemo(), clone(), synthetic trace()
  test/fixtures/traces/              recorded CSV traces (filled later by Plan 3)
packages/campus-view/
  package.json                       name @evacuai/campus-view, depends on @evacuai/routing
  src/index.ts                       toFloorShapes, routeOverlay, routeSteps, displayName
  test/campusView.test.ts
campus-data/
  demo/campus.json, demo/DEMO/building.json, floor-1.json, floor-2.json
  uclm/campus.json, uclm/BE/building.json, floor-1.json, floor-2.json, floor-3.json
  uclm/BE/source/Floor_Ground.svg, Floor_Second.svg, Floor_Third.svg   (copied from prototype)
  tools/import-prototype-svg.ts      one-off SVG→JSON importer
  tools/import-prototype-svg.test.ts
```

---

### Task 1: Workspace, types, loader, demo campus, CI

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/routing/package.json`, `packages/routing/src/types.ts`, `packages/routing/src/load.ts`, `packages/routing/src/index.ts`
- Create: `campus-data/demo/campus.json`, `campus-data/demo/DEMO/building.json`, `campus-data/demo/DEMO/floor-1.json`, `campus-data/demo/DEMO/floor-2.json`
- Test: `packages/routing/test/load.test.ts`, `packages/routing/test/helpers/demo.ts`

**Interfaces:**
- Produces, in `types.ts`:

```ts
export type Hazard = 'earthquake' | 'fire' | 'flood';
export const HAZARDS: readonly Hazard[];
export type Point = [number, number];
export type EdgeStatus = 'open' | 'blocked' | 'congested';
export type NodeType = 'room' | 'hallway' | 'stairwell' | 'exit' | 'assembly_point' | 'elevator';
export type EdgeType = 'corridor' | 'stairs' | 'ramp' | 'door' | 'outdoor' | 'elevator';
export interface Floor { level: number; name: string; elevation_m: number; height_m: number }
export interface Building { id: string; name: string; origin: { lat: number; lng: number } | null;
  rotation_deg: number; footprint: Point[]; floors: Floor[] }
export interface Room { id: string; building: string; level: number; name: string; type: string; polygon: Point[] }
export interface CampusNode { id: string; building: string; level: number; type: NodeType; x: number; y: number;
  name?: string; room_id?: string; safe_for: Hazard[]; qr_id?: string; capacity?: number; occupancy?: number }
export interface Edge { id: string; from: string; to: string; type: EdgeType; distance_m: number;
  bidirectional: boolean; flags: string[]; status: EdgeStatus }
export interface AssemblyPoint { id: string; node_id: string; lat: number | null; lng: number | null; radius_m: number }
export interface RuleWeights { congested: number; fullAssemblyPenalty_m: number;
  flags: Record<Hazard, Record<string, number>> }
export const DEFAULT_WEIGHTS: RuleWeights;
export interface CampusSnapshot { name: string; buildings: Building[]; rooms: Room[]; nodes: CampusNode[];
  edges: Edge[]; assemblyPoints: AssemblyPoint[]; hazardRoomIds: string[]; weights: RuleWeights }
export interface Route { nodeIds: string[]; distance_m: number; cost: number; destinationId: string }
export type RouteResult = { ok: true; route: Route } | { ok: false; reason: 'unknown_origin' | 'no_safe_route' };
```

- Produces, in `load.ts`: `loadCampus(dir: string): CampusSnapshot`.

**Raw file formats** (what humans edit):
- `campus.json` = `{ name, origin|null, buildings: string[], assembly_points: AssemblyPoint[] }`.
- `building.json` = `Building` without nesting. Floor `height_m` is optional and defaults to 3.5.
- `floor-<level>.json` = `{ rooms: [{id,name,type,polygon}], nodes: [{id,type,x,y,name?,room_id?,safe_for?,qr_id?,capacity?,occupancy?}], edges: [{from,to,type,distance_m?,bidirectional?,flags?}] }`.

**Loader rules:**
- Globalize every ID that has no `/`.
- `room_id` is globalized the same way.
- Edge `id` = `${from}->${to}`.
- `bidirectional` defaults to `true`.
- `flags` defaults to `[]`.
- `status` = `'open'`.
- `safe_for` defaults to `[]`.
- Missing `distance_m`:
  - same level: Euclidean distance between the endpoints;
  - different levels (stairs/elevator): `2 × height_m` of the higher floor.
- Edge endpoints that don't resolve are kept as given. They're reported by `validate`, not thrown.
- `hazardRoomIds: []`; `weights: DEFAULT_WEIGHTS`.

**Demo campus** (`campus-data/demo`). Building `DEMO`, floors `{1, "Ground", 0, 3.5}` and `{2, "Second", 3.5, 3.5}`. Rooms: `R101` (floor 1) and `R201` (floor 2), each named the same as its ID, as a closed rectangle around its node (first point = last).

| Floor | Nodes (id type x,y safe_for) | Edges (from–to type, flags) |
|---|---|---|
| 1 | `R101 room 5,2` (room_id R101) · `C1 hallway 5,6` · `C2 hallway 15,6` · `S1 stairwell 20,6` · `E1 elevator 10,8` · `X1 exit 0,6 [earthquake,fire]` · `AP assembly_point -10,6 [earthquake,fire]` | R101–C1 door · C1–C2 corridor [glass] · C2–S1 corridor · C1–E1 corridor · C1–X1 door · X1–AP outdoor |
| 2 | `R201 room 5,2` (room_id R201) · `C3 hallway 5,6` · `C4 hallway 15,6 [flood]` · `S2 stairwell 20,6` · `E2 elevator 10,8` | R201–C3 door · C3–C4 corridor · C4–S2 corridor · C3–E2 corridor · S2–`DEMO/1/S1` stairs · E2–`DEMO/1/E1` elevator |

`campus.json`: `{ "name": "Demo Campus", "origin": null, "buildings": ["DEMO"], "assembly_points": [{ "id": "AP", "node_id": "DEMO/1/AP", "lat": null, "lng": null, "radius_m": 25 }] }`.

- [ ] **Step 1: Create the root workspace files**
  - `package.json`:
    - `"private": true`
    - `"workspaces": ["packages/*"]`
    - scripts:
      - `"test": "vitest run"`
      - `"typecheck": "tsc -p tsconfig.base.json"`
    - devDependencies: `typescript@^7.0.2`, `vitest@^5.0.3`, `fast-check@^4.10.2`, `tsx@^4.23.15`, `@types/node`
  - `tsconfig.base.json`: `include: ["packages/*/src", "packages/*/test", "campus-data/tools"]`, plus `strict`, `noEmit`, `module: "ESNext"`, `moduleResolution: "bundler"`, `resolveJsonModule`.
  - `ci.yml`:
    - on `push` and `pull_request`;
    - runs on `ubuntu-latest`;
    - `actions/setup-node@v4` with `node-version: 26` and `cache: npm`;
    - `npm ci && npm run typecheck && npm test`. Task 3 adds `npm run validate`.

  Run `npm install`. Expected: a lockfile is created with no errors.

- [ ] **Step 2: Write the failing test** `packages/routing/test/load.test.ts`

```ts
import { loadCampus } from '../src/load';
const snap = loadCampus('campus-data/demo');

test('globalizes ids and resolves cross-floor stairs', () => {
  expect(snap.nodes.map(n => n.id)).toContain('DEMO/2/S2');
  const stair = snap.edges.find(e => e.id === 'DEMO/2/S2->DEMO/1/S1')!;
  expect(stair.type).toBe('stairs');
  expect(stair.distance_m).toBe(7);            // 2 × 3.5
});
test('computes same-floor distance and defaults', () => {
  const e = snap.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/C2')!;
  expect(e.distance_m).toBe(10);
  expect(e).toMatchObject({ bidirectional: true, status: 'open', flags: ['glass'] });
  expect(snap.nodes.find(n => n.id === 'DEMO/1/R101')!.room_id).toBe('DEMO/1/R101');
});
test('malformed JSON error names the file', () => {        // Review Focus 1
  expect(() => loadCampus('packages/routing/test/fixtures/bad-campus'))
    .toThrow(/bad-campus[\\/]+B[\\/]+floor-1\.json/);
});
```

  Also create `packages/routing/test/fixtures/bad-campus/`:
  - `campus.json` listing building `B`;
  - `B/building.json` with floor level 1;
  - `B/floor-1.json` containing `{ "rooms": [], }` (trailing comma).

  `test/helpers/demo.ts` exports:
  - `loadDemo(): CampusSnapshot`;
  - `clone<T>(x: T): T` using `structuredClone`.

- [ ] **Step 3: Run it.** `npx vitest run packages/routing/test/load.test.ts`. Expected: FAIL, cannot resolve `../src/load`.

- [ ] **Step 4: Implement `types.ts`, `load.ts` and `index.ts`.**
  - Use `readFileSync` + `JSON.parse` wrapped in a try/catch that rethrows `Error(\`${path}: ${err.message}\`)`.
  - Read floors by iterating `building.floors` levels → `floor-<level>.json`.
  - `index.ts` re-exports `types` (and later `route`, `validate`, `floorChange`). It does not export `load`, which is Node-only: consumers import it from `@evacuai/routing/src/load`.
  - Write the demo JSON files from the table above.

- [ ] **Step 5: Run it.** `npx vitest run packages/routing/test/load.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Commit (deferred; user instruction).** Suggested message: `feat(routing): campus types, loader, demo campus, CI`.

---

### Task 2: Hazard-aware routing — `findRoute`

**Files:**
- Create: `packages/routing/src/route.ts`
- Modify: `packages/routing/src/index.ts` (export)
- Test: `packages/routing/test/route.test.ts`

**Interfaces:**
- Consumes: `CampusSnapshot`, `RouteResult` (Task 1).
- Produces: `findRoute(snap: CampusSnapshot, originId: string, hazard: Hazard): RouteResult` and `edgeCost(edge: Edge, hazard: Hazard, w: RuleWeights): number`.

**Rules:**
- `edgeCost` = `distance_m × (status === 'congested' ? w.congested : 1) × Π w.flags[hazard][flag]` (missing flag = 1).
- `blocked` → ∞; `type === 'elevator'` → ∞.
- Nodes whose `room_id` is in `snap.hazardRoomIds` are impassable, except the origin.
- Run a full Dijkstra from the origin, skipping ∞ edges. Directed edges are traversable `from → to` only.
- Destination = argmin over reachable nodes with `safe_for.includes(hazard)` of `dist + penalty`.
- `penalty` = `w.fullAssemblyPenalty_m` only when the node is an `assembly_point` and `capacity` and `occupancy` are both numbers with `occupancy >= capacity`. Otherwise 0.
- Ties are broken by the lower `distance_m`, then by node ID.
- `route.cost` includes the penalty. `route.distance_m` is the plain sum of edge `distance_m`.

- [ ] **Step 1: Write the failing tests** (use `loadDemo`/`clone`)

```ts
test('earthquake from R201 → X1 with glass ×3', () => {
  const r = findRoute(loadDemo(), 'DEMO/2/R201', 'earthquake');
  expect(r).toEqual({ ok: true, route: {
    nodeIds: ['DEMO/2/R201','DEMO/2/C3','DEMO/2/C4','DEMO/2/S2','DEMO/1/S1','DEMO/1/C2','DEMO/1/C1','DEMO/1/X1'],
    distance_m: 46, cost: 66, destinationId: 'DEMO/1/X1' } });
});
test('flood goes up to C4', () => {
  const r = findRoute(loadDemo(), 'DEMO/1/R101', 'flood');
  expect(r.ok && r.route.nodeIds).toEqual(['DEMO/1/R101','DEMO/1/C1','DEMO/1/C2','DEMO/1/S1','DEMO/2/S2','DEMO/2/C4']);
  expect(r.ok && r.route.distance_m).toBe(31);
});
test('blocked only path → no_safe_route (elevator never used)', () => {
  const s = clone(loadDemo()); s.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/C2')!.status = 'blocked';
  expect(findRoute(s, 'DEMO/2/R201', 'earthquake')).toEqual({ ok: false, reason: 'no_safe_route' });
});
test('unknown origin', () => {                                // Review Focus 5
  expect(findRoute(loadDemo(), 'DEMO/9/NOPE', 'fire')).toEqual({ ok: false, reason: 'unknown_origin' });
});
test('origin already safe → single-node route', () => {
  const r = findRoute(loadDemo(), 'DEMO/1/X1', 'fire');
  expect(r.ok && r.route).toMatchObject({ nodeIds: ['DEMO/1/X1'], distance_m: 0, cost: 0 });
});
test('congested multiplies cost by 2.5', () => {
  const s = clone(loadDemo()); s.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/X1')!.status = 'congested';
  const r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(12.5);
});
test('hazard room is avoided, even as destination', () => {   // Review Focus 2
  const s = clone(loadDemo());
  s.rooms.push({ id: 'DEMO/1/X1room', building: 'DEMO', level: 1, name: 'Exit', type: 'exit', polygon: [[0,5],[1,5],[1,7],[0,5]] });
  s.nodes.find(n => n.id === 'DEMO/1/X1')!.room_id = 'DEMO/1/X1room';
  s.hazardRoomIds = ['DEMO/1/X1room'];
  expect(findRoute(s, 'DEMO/1/C1', 'fire')).toEqual({ ok: false, reason: 'no_safe_route' }); // AP only via X1
});
test('full assembly point adds penalty; missing capacity never NaN', () => {   // Review Focus 3
  const s = clone(loadDemo());
  s.nodes.find(n => n.id === 'DEMO/1/X1')!.safe_for = [];
  const ap = s.nodes.find(n => n.id === 'DEMO/1/AP')!;
  let r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(15);                    // C1–X1 5 + X1–AP 10, no capacity fields
  Object.assign(ap, { capacity: 100, occupancy: 100 });
  r = findRoute(s, 'DEMO/1/C1', 'fire');
  expect(r.ok && r.route.cost).toBe(115);
});
test('directed edge is one-way', () => {
  const s = clone(loadDemo()); s.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/X1')!.bidirectional = false;
  expect(findRoute(s, 'DEMO/1/AP', 'flood')).toEqual({ ok: false, reason: 'no_safe_route' }); // X1→C1 gone
});
```

  Add one **property test** using fast-check:
  - Arbitrary: a random subset of the demo edges set to `blocked`, a random hazard, and a random origin from the non-elevator nodes.
  - Assert: if `ok`, no consecutive pair in `nodeIds` uses a blocked edge, and the last node's `safe_for` includes the hazard.

- [ ] **Step 2: Run it.** `npx vitest run packages/routing/test/route.test.ts`. Expected: FAIL, `findRoute` is not exported.

- [ ] **Step 3: Implement `findRoute`/`edgeCost` in `route.ts`** following the rules above.
  - Build the adjacency once per call. Graphs have hundreds of nodes, so a binary heap is optional.
  - Use a sorted-array queue for simplicity. Add the comment `// ponytail: O(n²) queue, fine for <5k nodes; swap for binary heap if campus grows`.

- [ ] **Step 4: Run it.** `npx vitest run packages/routing/test/route.test.ts`. Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit (deferred).** Suggested message: `feat(routing): hazard-aware findRoute`.

---

### Task 3: `validate` + CLI

**Files:**
- Create: `packages/routing/src/validate.ts`, `packages/routing/src/cli/validate.ts`
- Modify: `packages/routing/src/index.ts`
- Test: `packages/routing/test/validate.test.ts`

**Interfaces:**
- Consumes: `findRoute` (Task 2), `loadCampus` (Task 1).
- Produces:
  - `type IssueCode = 'duplicate_id' | 'missing_ref' | 'open_polygon' | 'duplicate_qr' | 'stairs_same_level' | 'unreachable'`
  - `interface Issue { code: IssueCode; message: string }`
  - `validate(snap: CampusSnapshot): Issue[]`

**Checks:**
- duplicate node or room IDs;
- an edge endpoint, `room_id` or assembly `node_id` that doesn't resolve;
- a polygon with fewer than 4 points or `first !== last`;
- a duplicate `qr_id`;
- a `stairs`/`elevator` edge whose endpoints share a level;
- for every node × every hazard, `findRoute` (on a copy with all statuses open and `hazardRoomIds: []`) returning `no_safe_route`. Message: `` `${nodeId} cannot reach a safe node for ${hazard}` ``.

Run reachability only if there are no `missing_ref` issues.

- [ ] **Step 1: Write the failing tests**
  - `validate(loadDemo())` equals `[]`.
  - One test per code, each mutating a clone and asserting `expect(validate(s).map(i => i.code)).toContain('<code>')`:
    - `missing_ref`: edge `to: 'DEMO/1/GHOST'`;
    - `open_polygon`: drop the last point of the R101 polygon;
    - `duplicate_qr`: two nodes with `qr_id: 'Q1'`;
    - `stairs_same_level`: set the stair edge's `to` to `'DEMO/2/C3'`;
    - `unreachable`: clear `safe_for` on C4 → `DEMO/1/R101 cannot reach a safe node for flood`;
    - `duplicate_id`: push a copy of node C1.

- [ ] **Step 2: Run it.** `npx vitest run packages/routing/test/validate.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `validate` and the CLI.**
  - `cli/validate.ts` takes campus dirs from `process.argv.slice(2)` and runs `loadCampus` + `validate` on each.
  - It prints `✓ <dir>: <nodes> nodes, <edges> edges` or one `✗ <code> <message>` line per issue.
  - It calls `process.exitCode = 1` on any issue.

- [ ] **Step 4: Run it.** `npx vitest run packages/routing/test/validate.test.ts`. Expected: PASS.
  - Add the root script `"validate": "tsx packages/routing/src/cli/validate.ts campus-data/demo"`, and append `&& npm run validate` to `ci.yml`.
  - Run `npm run validate`. Expected: `✓ campus-data/demo: 12 nodes, 12 edges`.

- [ ] **Step 5: Commit (deferred).** Suggested message: `feat(routing): campus validator and CLI`.

---

### Task 4: `detectFloorChanges`

**Files:**
- Create: `packages/routing/src/floorChange.ts`
- Modify: `packages/routing/src/index.ts`
- Test: `packages/routing/test/floorChange.test.ts`
- Modify: `packages/routing/test/helpers/demo.ts` (add `trace()`)
- Create: `packages/routing/test/fixtures/traces/README.md` (format below)

**Interfaces:**
- Produces:
  - `interface PressureSample { t: number /* ms */; hPa: number }`
  - `interface FloorChange { t: number; floors: number /* +up, −down */ }`
  - `detectFloorChanges(samples: PressureSample[], opts: { floorHeight_m: number }): FloorChange[]`
- Constants, exported for Plan 3 tuning: `HPA_PER_M = 0.12`, `SMOOTH_MS = 5000`, `SUSTAIN_MS = 3000`, `STABLE_MS = 30000`, `TRIGGER = 0.6`, `STABLE_BAND = 0.3`, `GAP_MS = 10000`.

**Algorithm** (time-based, never sample-count-based):
1. Sort by `t`.
2. Smooth with a trailing moving average over `SMOOTH_MS`.
3. `fd = floorHeight_m × HPA_PER_M`. Baseline `b` = the first smoothed value. Let `d = b − s` (positive = up).
4. **Trigger:** when `|d| ≥ TRIGGER·fd` holds with the same sign continuously for `SUSTAIN_MS`:
   - `n = sign(d) × max(1, round(|d|/fd))`;
   - emit `{ t, floors: n }`;
   - set `b = b − n·fd`, a quantized re-baseline so that climbs spanning several floors add up correctly.
5. **Drift:** when `|d| < STABLE_BAND·fd` for `STABLE_MS`, set `b = s`.
6. **Gap:** when the time between samples exceeds `GAP_MS`, reset `b` to the next smoothed value and clear all timers. Emit nothing across a gap.

- [ ] **Step 1: Write `trace()` and the failing tests.**

  `trace({ seconds, hz, steps: [{ atS, floors, durS }], driftHpaPerHour = 0, noise = 0, seed = 1 }): PressureSample[]`:
  - starts at base 1010 hPa;
  - each step changes pressure linearly by `−floors × 3.5 × 0.12` over `durS`;
  - noise is Gaussian, from a seeded mulberry32.

  Tests (`sum = changes.reduce((a, c) => a + c.floors, 0)`, `floorHeight_m: 3.5`):
  - stairs up 1 floor over 15 s, noise 0.03 → `sum === 1`;
  - up 2 floors over 30 s → `sum === 2`;
  - down 1 → `sum === −1`;
  - elevator up 3 floors over 12 s → `sum === 3`;
  - 60 minutes of drift at 1 hPa/h, noise 0.03 → `changes.length === 0`;
  - pure noise 0.05 for 10 min → `changes.length === 0`;
  - **(Review Focus 4)** `detectFloorChanges([], …)` → `[]`;
  - **(Review Focus 4)** a 120 s gap mid-trace, with an offset of +0.5 hPa across the gap → no change emitted;
  - **(Review Focus 4)** the same 1-floor climb at 25 Hz and 5 Hz → equal `sum`;
  - **recorded traces:**
    - for each `test/fixtures/traces/*.csv`, parse `t_ms,hPa` rows and the expected floors from the filename pattern `<name>__floors_<n>.csv` (e.g. `stairs_up__floors_1.csv`, `drift__floors_0.csv`), then assert `sum === n`;
    - when no CSVs exist, assert that the directory exists, as a single `test('trace fixtures dir present')`.

- [ ] **Step 2: Run it.** `npx vitest run packages/routing/test/floorChange.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `detectFloorChanges`** following the algorithm above. Add `// ponytail: thresholds are calibration knobs; tune from recorded traces (Plan 3)`.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Commit (deferred).** Suggested message: `feat(routing): barometric floor-change detection`.

---

### Task 5: `@evacuai/campus-view`

**Files:**
- Create: `packages/campus-view/package.json`, `packages/campus-view/src/index.ts`
- Test: `packages/campus-view/test/campusView.test.ts`

**Interfaces:**
- Consumes: `CampusSnapshot`, `Route`, `findRoute` (tests only), `loadCampus` (tests only).
- Produces:

```ts
export function displayName(snap: CampusSnapshot, nodeId: string): string;
export interface FloorShapes {
  rooms: { id: string; name: string; type: string; polygon: Point[]; status: 'open' | 'hazard' }[];
  nodes: { id: string; type: NodeType; x: number; y: number; name: string }[];
  edges: { id: string; a: Point; b: Point; status: EdgeStatus }[];   // same-floor edges only
}
export function toFloorShapes(snap: CampusSnapshot, buildingId: string, level: number): FloorShapes;
export interface RouteOverlay {
  segments: { building: string; level: number; points: Point[] }[];
  transitions: { atNodeId: string; fromLevel: number; toLevel: number; direction: 'up' | 'down'; label: string }[];
}
export function routeOverlay(snap: CampusSnapshot, route: Route): RouteOverlay;
export function routeSteps(snap: CampusSnapshot, route: Route): string[];
```

**Rules:**
- `displayName`, in order:
  1. `node.name`;
  2. otherwise the room's `name` when `room_id` resolves;
  3. otherwise the local ID with a trailing floor suffix (`_G`, `_<digit>`, `_Ground`, `_Second`, `_Third`) removed and `_` replaced by a space.
- A room's status is `hazard` when its ID is in `hazardRoomIds`.
- **Segments:** split `nodeIds` whenever the level changes. Each segment's points are the nodes' `[x, y]`.
- **Transitions:**
  - one per level change, at the node where the route leaves the floor;
  - `label` = `` `${displayName} ${direction === 'down' ? '↓' : '↑'} ${toFloorName}` ``.
- **Steps:**
  - First step:
    - if the origin is also the destination: `` [`You are at ${name}. Stay here.`] ``;
    - if the origin is a `room` node: `` `Exit ${name}` ``;
    - otherwise: `` `Start at ${name}` ``.
  - Then, per transition: `` `Take ${stairName} ${up|down} to ${floorName}` ``.
  - Last step: `` `Go to ${destName}` ``.
  - Corridor-level steps are intentionally omitted (YAGNI).

- [ ] **Step 1: Write the failing tests** (demo snapshot + `findRoute(…, 'DEMO/2/R201', 'earthquake')`):
  - `toFloorShapes(s, 'DEMO', 2).edges` has 4 edges (excludes the stair and elevator edges), each `status: 'open'`.
  - After blocking `DEMO/2/C3->DEMO/2/C4`, that edge's status is `'blocked'`.
  - With `hazardRoomIds = ['DEMO/2/R201']`, room R201 has `status: 'hazard'`.
  - `routeOverlay` returns:
    - `segments.map(s => s.level)` equal to `[2, 1]`;
    - `transitions` equal to `[{ atNodeId: 'DEMO/2/S2', fromLevel: 2, toLevel: 1, direction: 'down', label: 'S2 ↓ Ground' }]`.
  - `routeSteps` returns `['Exit R201', 'Take S2 down to Ground', 'Go to X1']`.
  - `displayName` of the BE-style ID `'BE/1/Stairs_Left_G'` (node with no name/room) is `'Stairs Left'`. Build this as a tiny inline snapshot inside the test.
  - Origin = destination (`DEMO/1/X1`, fire) → `['You are at X1. Stay here.']`.

- [ ] **Step 2: Run it.** `npx vitest run packages/campus-view`. Expected: FAIL.

- [ ] **Step 3: Implement** `packages/campus-view/src/index.ts`. `package.json`: `name: "@evacuai/campus-view"`, `main: "src/index.ts"`, `dependencies: { "@evacuai/routing": "*" }`. Run `npm install` to link the workspace.

- [ ] **Step 4: Run it.** `npx vitest run packages/campus-view && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit (deferred).** Suggested message: `feat(campus-view): floor shapes, route overlay, step text`.

---

### Task 6: Basic Ed import from the prototype + UCLM campus data

**Files:**
- Create: `campus-data/tools/import-prototype-svg.ts`, `campus-data/tools/import-prototype-svg.test.ts`
- Create (copied verbatim, read-only source): `campus-data/uclm/BE/source/Floor_Ground.svg`, `Floor_Second.svg`, `Floor_Third.svg`, from `https://raw.githubusercontent.com/Lexageda/evacuai/main/static/svg/floors/`
- Create (generated): `campus-data/uclm/campus.json`, `campus-data/uclm/BE/building.json`, `floor-1.json`, `floor-2.json`, `floor-3.json`
- Modify: `vitest.config.ts` (include `campus-data/tools/*.test.ts`); root `package.json` `validate` script (append `campus-data/uclm`)

**Interfaces:**
- Consumes: the raw file formats (Task 1) and `validate` (Task 3), via `npm run validate`.
- Produces:
  - `parseRects(svg: string): { id: string; x: number; y: number; w: number; h: number }[]` (regex on `<rect id=… x=… y=… width=… height=…>`; ignores the group `translate`);
  - `buildFloor(rects, opts: { level: number; scale: number; floodSafe: boolean }): RawFloor`.
  - CLI: `tsx campus-data/tools/import-prototype-svg.ts --building BE --scale 0.15 --out campus-data/uclm/BE Floor_Ground.svg:1:Ground Floor_Second.svg:2:Second Floor_Third.svg:3:Third`.

**`buildFloor` rules** (prototype layout: one horizontal `Corridor_*` rect, rooms above/below it, `Stairs_*` at the ends, optional `Elevator_*`):
- Every rect except the corridor becomes a room: polygon = 4 corners + the first point repeated, scaled by `scale` (metres per SVG unit).
- **Node per room** (`id` = rect id):
  - type `stairwell` if the ID starts with `Stairs_`;
  - `elevator` if it starts with `Elevator_`;
  - `exit` if it starts with `Exit_`;
  - otherwise `room`.
- **Node position:** room centre x; y on the room's edge facing the corridor (stairs: the corridor's centre y). `room_id` = its own ID.
- **Corridor nodes:** one per distinct room centre x (rounded to 0.01) on the corridor centreline. IDs `C<level>_<nn>`, numbered left to right, type `hallway`. They chain along the corridor (`corridor` edges).
- **Door edges** (`door`) from each room/exit node to the corridor node at the same x. Stairs connect to the nearest corridor node with a `corridor` edge. Elevators connect with a `corridor` edge.
- `safe_for`:
  - exits: `['earthquake', 'fire']`;
  - if `floodSafe` (level ≥ 2): every corridor node gets `['flood']`.
- **Cross-floor links** (in the CLI after all floors are built), added to the upper floor's file:
  - `Stairs_Left_<x>` ↔ the matching `Stairs_Left_<y>` one level down (same for `Stairs_Right`), type `stairs`;
  - `Elevator_<n>` ↔ `Elevator_<n-1>` when it exists, type `elevator`. Ground has no elevator in the prototype; that's correct.
- **Level 1 also gets an assembly node** `AP_Field` (`assembly_point`, `safe_for` all three hazards):
  - placed 30 m below the floor's max y;
  - `outdoor` edges from each exit node with `distance_m: 30`;
  - `// ponytail: AP position/distance are placeholders until the site survey; edit in floor-1.json`.

**Written files:**
- `building.json`: `{ id: 'BE', name: 'Basic Education Building', origin: null, rotation_deg: 0, footprint: [], floors: [{ level, name, elevation_m: (level−1)×3.5, height_m: 3.5 }] }`.
- `campus.json`: `{ name: 'UCLM', origin: null, buildings: ['BE'], assembly_points: [{ id: 'AP_Field', node_id: 'BE/1/AP_Field', lat: null, lng: null, radius_m: 25 }] }`.

Origins, lat/lng and the scale are calibration values for the site survey. `null` disables the GPS geofence (spec §4.2).

- [ ] **Step 1: Write the failing test** `import-prototype-svg.test.ts`. Use an inline SVG with: `Corridor_X` (x 30, y 90, w 100, h 20), `Room_A` (30, 112, 40, 80), `Room_B` (80, 2, 40, 86), `Stairs_Left_G` (0, 0, 30, 200), `Exit_South` (80, 112, 40, 80).

```ts
const f = buildFloor(parseRects(svg), { level: 1, scale: 0.1, floodSafe: false });
expect(f.rooms.find(r => r.id === 'Room_A')!.polygon).toEqual([[3,11.2],[7,11.2],[7,19.2],[3,19.2],[3,11.2]]);
expect(f.nodes.filter(n => n.type === 'hallway')).toHaveLength(2);          // centre x 50 and 100; stairs join nearest
expect(f.nodes.find(n => n.id === 'Exit_South')!.safe_for).toEqual(['earthquake','fire']);
expect(f.edges.some(e => e.from === 'Room_B' && e.type === 'door')).toBe(true);
```


- [ ] **Step 2: Run it.** `npx vitest run campus-data/tools`. Expected: FAIL.

- [ ] **Step 3: Implement `parseRects`, `buildFloor` and the CLI. Copy the 3 SVGs** with `curl -s <raw url> -o campus-data/uclm/BE/source/<name>`.

- [ ] **Step 4: Run the importer, then validate.** `npx tsx campus-data/tools/import-prototype-svg.ts --building BE --scale 0.15 --out campus-data/uclm/BE campus-data/uclm/BE/source/Floor_Ground.svg:1:Ground campus-data/uclm/BE/source/Floor_Second.svg:2:Second campus-data/uclm/BE/source/Floor_Third.svg:3:Third`, then `npm run validate`.

  Expected:
  - `✓ campus-data/demo: 12 nodes, 12 edges`;
  - `✓ campus-data/uclm: <n> nodes, <m> edges`, with no `✗` lines.

  If `unreachable` lines appear, fix the importer rule, not the generated JSON.

- [ ] **Step 5: Run the whole suite.** `npm run typecheck && npm test && npm run validate`. Expected: all PASS. CI is now green.

- [ ] **Step 6: Commit (deferred).** Suggested message: `feat(campus-data): import Basic Ed from prototype SVGs`.
