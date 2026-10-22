import { cameraFor, floorStyles } from '../src/views';

const floors = [1, 2, 3].map(level => ({ key: `A/${level}`, building: 'A', level }));
const box = { min: [0, 0, 0] as [number, number, number], max: [40, 12, 20] as [number, number, number] };

describe('floorStyles', () => {
  it('shows every floor in "All floors", with the upper floors faded so you can see in', () => {
    const s = floorStyles(floors, { building: 'A', level: null });
    expect([...s.values()].every(f => f.visible && !f.labels)).toBe(true);
    expect(s.get('A/1')!.opacity).toBe(0.25);
    expect(s.get('A/2')!.opacity).toBe(0.25);
    expect(s.get('A/3')!.opacity).toBe(1);
  });

  it('focuses one floor: solid with labels, floors above hidden, floors below ghosted', () => {
    const s = floorStyles(floors, { building: 'A', level: 2 });
    expect(s.get('A/3')!.visible).toBe(false);
    expect(s.get('A/2')).toEqual({ visible: true, opacity: 1, labels: true });
    expect(s.get('A/1')).toMatchObject({ visible: true, opacity: 0.15, labels: false });
  });
});

describe('cameraFor', () => {
  it('Top looks straight down at the centre', () => {
    const { position, target } = cameraFor('top', box);
    expect(target).toEqual([20, 6, 10]);
    expect(position[0]).toBeCloseTo(20);
    expect(position[2]).toBeCloseTo(10, 1); // a hair off vertical: OrbitControls cannot look exactly straight down
    expect(position[1]).toBeGreaterThan(box.max[1]);
  });

  it('3D looks from the south-east and above', () => {
    const { position, target } = cameraFor('3d', box);
    expect(position[0]).toBeGreaterThan(target[0]);
    expect(position[2]).toBeGreaterThan(target[2]);
    expect(position[1]).toBeGreaterThan(target[1]);
  });

  it('Front looks from the south, lower than 3D', () => {
    const front = cameraFor('front', box);
    const iso = cameraFor('3d', box);
    expect(front.position[0]).toBeCloseTo(front.target[0]);
    expect(front.position[2]).toBeGreaterThan(front.target[2]);
    expect(front.position[1] - front.target[1]).toBeLessThan(iso.position[1] - iso.target[1]);
  });

  it('Follow route aims at where the route starts', () => {
    expect(cameraFor('route', box, { routeStart: [5, 3, 4] }).target).toEqual([5, 3, 4]);
  });

  it('aims higher when the floors are exploded (a taller box)', () => {
    const tall = { ...box, max: [40, 30, 20] as [number, number, number] };
    expect(cameraFor('3d', tall).target[1]).toBeGreaterThan(cameraFor('3d', box).target[1]);
  });
});

it('keeps exploded floors nearly solid, since they no longer cover each other', () => {
  const s = floorStyles([1, 2, 3].map(level => ({ key: `A/${level}`, building: 'A', level })), { building: 'A', level: null }, { exploded: true });
  expect(s.get('A/1')!.opacity).toBe(0.8);
});
