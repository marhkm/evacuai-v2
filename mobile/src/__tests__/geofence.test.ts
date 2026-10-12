import { assemblyPointAt, distanceM } from '@/lib/geofence';

import { loadDemoSnapshot } from './helpers';

jest.mock('expo-location', () => ({}));

test('distance between two points about 100 m apart', () => {
  expect(distanceM({ lat: 10.327, lng: 123.95 }, { lat: 10.3279, lng: 123.95 })).toBeCloseTo(100, -1);
});

test('finds the assembly point whose radius contains the phone, allowing for GPS error up to 30 m', () => {
  const snap = loadDemoSnapshot();
  expect(assemblyPointAt(snap, { lat: 10.327, lng: 123.95 })).toBeNull(); // no coordinates surveyed yet
  Object.assign(snap.assemblyPoints[0], { lat: 10.327, lng: 123.95, radius_m: 25 });
  expect(assemblyPointAt(snap, { lat: 10.32715, lng: 123.95, accuracy: 5 })?.nodeId).toBe('DEMO/1/AP'); // ~17 m
  expect(assemblyPointAt(snap, { lat: 10.3275, lng: 123.95, accuracy: 10 })).toBeNull(); // ~56 m
  expect(assemblyPointAt(snap, { lat: 10.3275, lng: 123.95, accuracy: 500 })).toBeNull(); // bad fix: slack capped at 30 m
});
