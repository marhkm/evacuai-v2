import { loadCampus } from '../src/load';

const snap = loadCampus('campus-data/demo');

test('globalizes ids and resolves cross-floor stairs', () => {
  expect(snap.nodes.map(n => n.id)).toContain('DEMO/2/S2');
  const stair = snap.edges.find(e => e.id === 'DEMO/2/S2->DEMO/1/S1')!;
  expect(stair.type).toBe('stairs');
  expect(stair.distance_m).toBe(7); // 2 × 3.5
});

test('computes same-floor distance and defaults', () => {
  const e = snap.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/C2')!;
  expect(e.distance_m).toBe(10);
  expect(e).toMatchObject({ bidirectional: true, status: 'open', flags: ['glass'] });
  expect(snap.nodes.find(n => n.id === 'DEMO/1/R101')!.room_id).toBe('DEMO/1/R101');
});

test('malformed JSON error names the file', () => {
  expect(() => loadCampus('packages/routing/test/fixtures/bad-campus'))
    .toThrow(/bad-campus.B.floor-1\.json/); // . matches either path separator
});

// ── final-review fixes (I1: typo'd keys) ──
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const floorOk = { rooms: [], nodes: [{ id: 'X', type: 'exit', x: 0, y: 0, safe_for: ['earthquake', 'fire', 'flood'] }], edges: [] };
function campusWith(floor: object, campus: object = { name: 'T', origin: null, buildings: ['B'], assembly_points: [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'campus-'));
  mkdirSync(join(dir, 'B'));
  writeFileSync(join(dir, 'campus.json'), JSON.stringify(campus));
  writeFileSync(join(dir, 'B', 'building.json'), JSON.stringify({ id: 'B', name: 'B', origin: null, rotation_deg: 0, footprint: [], floors: [{ level: 1, name: 'G', elevation_m: 0 }] }));
  writeFileSync(join(dir, 'B', 'floor-1.json'), JSON.stringify(floor));
  return dir;
}

test('I1: typo in a top-level key names the file and key', () => {
  expect(() => loadCampus(campusWith({ rooms: [], nodse: [], edges: [] }))).toThrow('floor-1.json: unknown key "nodse"');
});
test('I1: typo in an edge key is not silently ignored', () => {
  const floor = { ...floorOk, edges: [{ from: 'X', to: 'X', type: 'door', bidirectonal: false }] };
  expect(() => loadCampus(campusWith(floor))).toThrow('floor-1.json: edges[0]: unknown key "bidirectonal"');
});
test('I1: typo in campus.json', () => {
  expect(() => loadCampus(campusWith(floorOk, { name: 'T', origin: null, buildngs: ['B'], assembly_points: [] })))
    .toThrow('campus.json: unknown key "buildngs"');
});
test('I1: missing required array', () => {
  expect(() => loadCampus(campusWith({ rooms: [], nodes: [] }))).toThrow('floor-1.json: missing "edges"');
});
test('I1: CLI reports load errors without a stack trace', () => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'packages/routing/src/cli/validate.ts', campusWith({ rooms: [], nodse: [], edges: [] })], { encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('✗ load');
  expect(r.stderr).not.toContain('    at ');
});

test('snapshot is JSON-safe (it is the API/seed contract)', () => {
  expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
});

// ── Phase 2: floor plans imported from the evacuation posters ──
const plan = {
  walls: [[[0, 0], [10, 0]], [[10, 0], [10, 5]]],
  doors: [{ hinge: [2, 0], r: 0.9, from: 0, to: 90 }],
  stairs: [[[8, 1], [9, 1], [9, 3], [8, 3]]],
  labels: [{ text: 'A-31', x: 5, y: 2 }],
  arrows: [{ x: 3, y: 4, deg: 180 }],
};

test('loads a floor plan onto its floor', () => {
  const s = loadCampus(campusWith({ ...floorOk, plan }));
  expect(s.buildings[0].floors[0].plan?.walls).toHaveLength(2);
  expect(s.buildings[0].floors[0].plan?.labels[0].text).toBe('A-31');
});

test('rejects unknown plan keys', () => {
  expect(() => loadCampus(campusWith({ ...floorOk, plan: { ...plan, wals: [] } }))).toThrow(/unknown key "wals"/);
});
