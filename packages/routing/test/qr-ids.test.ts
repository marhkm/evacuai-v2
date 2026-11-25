import { loadCampus } from '../src/load';

// Every place someone can stand and scan (rooms, stairs, exits, safe zones) gets a sticker code, in every building.
const STICKERED = ['room', 'stairwell', 'exit', 'assembly_point'];

test('every room, staircase, exit and safe zone has a QR sticker code, unique across the campus', () => {
  const snap = loadCampus('campus-data/uclm');
  const places = snap.nodes.filter(n => STICKERED.includes(n.type));
  const missing = places.filter(n => !n.qr_id).map(n => n.id);
  expect(missing).toEqual([]);
  const codes = places.map(n => n.qr_id!);
  expect(new Set(codes).size).toBe(codes.length);
  for (const c of codes) expect(c).toMatch(/^[0-9A-Z]{4,16}$/); // what the app's scanner accepts (parseQr)
  expect(snap.nodes.find(n => n.id === "A1/1/AP_NaturesSpring")?.qr_id).toBeTruthy();
});

test('codes never change between builds, and existing printed stickers keep theirs', () => {
  const a = loadCampus('campus-data/uclm');
  const b = loadCampus('campus-data/uclm');
  expect(a.nodes.map(n => n.qr_id)).toEqual(b.nodes.map(n => n.qr_id));
  expect(a.nodes.find(n => n.id === 'BE/1/AP_Field')?.qr_id).toBe('116DD2FA');
});
