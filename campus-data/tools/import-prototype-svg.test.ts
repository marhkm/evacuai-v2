import { buildFloor, parseRects } from './import-prototype-svg';

const svg = `<svg><g transform="translate(10,10)">
  <rect id="Corridor_X" x="30" y="90" width="100" height="20" fill="none"/>
  <rect id="Room_A" x="30" y="112" width="40" height="80"/>
  <rect id="Room_B" x="80" y="2" width="40" height="86"/>
  <rect id="Stairs_Left_G" x="0" y="0" width="30" height="200"/>
  <rect id="Exit_South" x="80" y="112" width="40" height="80"/>
</g></svg>`;

test('parseRects reads every rect', () => {
  expect(parseRects(svg).map(r => r.id)).toEqual(['Corridor_X', 'Room_A', 'Room_B', 'Stairs_Left_G', 'Exit_South']);
});

test('buildFloor makes rooms, corridor graph, doors and exits', () => {
  const f = buildFloor(parseRects(svg), { level: 1, scale: 0.1, floodSafe: false });
  expect(f.rooms.find(r => r.id === 'Room_A')!.polygon).toEqual([[3, 11.2], [7, 11.2], [7, 19.2], [3, 19.2], [3, 11.2]]);
  expect(f.nodes.filter(n => n.type === 'hallway')).toHaveLength(2); // centre x 50 and 100; stairs join nearest
  expect(f.nodes.find(n => n.id === 'Exit_South')!.safe_for).toEqual(['earthquake', 'fire']);
  expect(f.edges.some(e => e.from === 'Room_B' && e.type === 'door')).toBe(true);
  expect(f.nodes.find(n => n.id === 'Stairs_Left_G')!.type).toBe('stairwell');
});

test('floodSafe marks corridor nodes safe for flood', () => {
  const f = buildFloor(parseRects(svg), { level: 2, scale: 0.1, floodSafe: true });
  expect(f.nodes.filter(n => n.type === 'hallway').every(n => n.safe_for?.includes('flood'))).toBe(true);
});

test('readable names: floor suffix stripped, corridors named by floor', () => {
  const f = buildFloor(parseRects(svg), { level: 2, scale: 0.1, floodSafe: true, floorName: 'Second' });
  expect(f.rooms.find(r => r.id === 'Stairs_Left_G')!.name).toBe('Stairs Left');
  expect(f.nodes.filter(n => n.type === 'hallway').map(n => n.name)).toEqual(['Second floor corridor', 'Second floor corridor']);
});

test('I3: hallway nodes belong to the corridor room', () => {
  const f = buildFloor(parseRects(svg), { level: 1, scale: 0.1, floodSafe: false });
  expect(f.nodes.filter(n => n.type === 'hallway').every(n => n.room_id === 'Corridor_X')).toBe(true);
});

test('sticker nodes get a stable qr_id; corridor and elevator nodes do not', () => {
  const a = buildFloor(parseRects(svg), { level: 1, scale: 0.1, floodSafe: false, building: 'BE' });
  const b = buildFloor(parseRects(svg), { level: 1, scale: 0.1, floodSafe: false, building: 'BE' });
  const qr = (f: typeof a, id: string) => f.nodes.find(n => n.id === id)!.qr_id;
  for (const id of ['Room_A', 'Room_B', 'Stairs_Left_G', 'Exit_South']) {
    expect(qr(a, id)).toMatch(/^[0-9A-F]{8}$/);
    expect(qr(a, id)).toBe(qr(b, id));
  }
  expect(a.nodes.filter(n => n.type === 'hallway').every(n => n.qr_id === undefined)).toBe(true);
  expect(new Set(a.nodes.map(n => n.qr_id).filter(Boolean)).size).toBe(4);
});
