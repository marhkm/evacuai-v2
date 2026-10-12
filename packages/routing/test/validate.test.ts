import { validate } from '../src/validate';
import { clone, loadDemo } from './helpers/demo';

const codes = (s: ReturnType<typeof loadDemo>) => validate(s).map(i => i.code);

test('demo campus is valid', () => {
  expect(validate(loadDemo())).toEqual([]);
});

test('missing_ref', () => {
  const s = clone(loadDemo());
  s.edges[0].to = 'DEMO/1/GHOST';
  expect(codes(s)).toContain('missing_ref');
});

test('open_polygon', () => {
  const s = clone(loadDemo());
  s.rooms.find(r => r.id === 'DEMO/1/R101')!.polygon.pop();
  expect(codes(s)).toContain('open_polygon');
});

test('duplicate_qr', () => {
  const s = clone(loadDemo());
  s.nodes[0].qr_id = 'Q1';
  s.nodes[1].qr_id = 'Q1';
  expect(codes(s)).toContain('duplicate_qr');
});

test('stairs_same_level', () => {
  const s = clone(loadDemo());
  s.edges.find(e => e.id === 'DEMO/2/S2->DEMO/1/S1')!.to = 'DEMO/2/C3';
  expect(codes(s)).toContain('stairs_same_level');
});

test('unreachable', () => {
  const s = clone(loadDemo());
  s.nodes.find(n => n.id === 'DEMO/2/C4')!.safe_for = [];
  expect(validate(s).map(i => i.message)).toContain('DEMO/1/R101 cannot reach a safe node for flood');
});

test('duplicate_id', () => {
  const s = clone(loadDemo());
  s.nodes.push({ ...s.nodes.find(n => n.id === 'DEMO/1/C1')! });
  expect(codes(s)).toContain('duplicate_id');
});

test('I2: reverse-duplicate edge', () => {
  const s = clone(loadDemo());
  const stair = s.edges.find(e => e.id === 'DEMO/2/S2->DEMO/1/S1')!;
  s.edges.push({ ...stair, id: 'DEMO/1/S1->DEMO/2/S2', from: 'DEMO/1/S1', to: 'DEMO/2/S2' });
  expect(codes(s)).toContain('duplicate_edge');
});

test('I2: exact duplicate edge', () => {
  const s = clone(loadDemo());
  s.edges.push({ ...s.edges[0] });
  expect(codes(s)).toContain('duplicate_edge');
});
