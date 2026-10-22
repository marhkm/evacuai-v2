import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { forgetWhereabouts } from '@/lib/whereabouts';

import { loadDemoSnapshot } from './helpers';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));

const mockLive: { alert?: (a: unknown) => void; campus?: () => void } = {};
jest.mock('@/lib/realtime', () => ({
  subscribeAlerts: async (cb: (a: unknown) => void) => { mockLive.alert = cb; return () => undefined; },
  subscribeCampus: async (cb: () => void) => { mockLive.campus = cb; return () => undefined; },
  subscribeSos: async () => () => undefined,
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));
const mockBaro: { floors?: (n: number) => void } = {};
jest.mock('@/lib/barometer', () => ({ watchFloorChanges: (_h: number, cb: (n: number) => void) => { mockBaro.floors = cb; return () => undefined; } }));
jest.mock('expo-camera', () => {
  // jest.mock factories are hoisted above imports, so modules must be required inside them.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => {
      useEffect(() => { onBarcodeScanned({ data: 'evacuai://q/S2STICKR' }); }, [onBarcodeScanned]);
      return null;
    },
  };
});

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
let snapshot = loadDemoSnapshot();
let alerts: object[] = [];
let scheduleClass: object | null = null;

const activeAlert = (hazard: string) => ({
  id: 1, hazard_type: hazard, severity_level: 'high', message: `${hazard} drill`, status: 'active', source: 'admin',
  verified: true, is_drill: false, building_id: null, issued_at: '2026-10-14T08:00:00+08:00', resolved_at: null,
});

beforeEach(() => {
  forgetWhereabouts();
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  snapshot = loadDemoSnapshot();
  snapshot.nodes.find(n => n.id === 'DEMO/2/S2')!.qr_id = 'S2STICKR';
  alerts = [];
  scheduleClass = null;
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = path === '/api/me' ? { user }
      : path === '/api/alerts' ? { alerts }
      : path === '/api/me/schedule/now' ? { class: scheduleClass }
      : path === '/api/campus-snapshot' ? JSON.parse(JSON.stringify(snapshot)) : {};
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

const open = () => renderRouter('./src/app', { initialUrl: '/route' });

test('routes from a picked room using the active alert hazard', async () => {
  alerts = [activeAlert('earthquake')];
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Pick my room' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Second' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R201' }));
  expect(await screen.findByText('Exit R201')).toBeTruthy();
  expect(screen.getByText('Take S2 down to Ground')).toBeTruthy();
  expect(screen.getByText('Go to X1')).toBeTruthy();
  expect(screen.getByText(/46 m/)).toBeTruthy();
});

test('without an alert the user chooses the hazard (flood goes upstairs)', async () => {
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Flood' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Pick my room' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Ground' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R101' }));
  expect(await screen.findByText('Take S1 up to Second')).toBeTruthy();
  expect(screen.getByText('Go to C4')).toBeTruthy();
});

test('routes from the current class with no tap, and offers to pick the room instead', async () => {
  alerts = [activeAlert('fire')];
  scheduleClass = { subject: 'IT 101', room_id: 'DEMO/2/R201', room_name: 'R201', building: 'DEMO', level: 2, time_start: '00:00', time_end: '23:59' };
  await open();
  expect(await screen.findByText('Exit R201')).toBeTruthy(); // route ready without any tap
  expect(screen.getByText(/from your class schedule.*Not there\? Pick your room below/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pick my room' })).toBeTruthy();
});

test('a room picked earlier today is still the starting point after the app restarts', async () => {
  alerts = [activeAlert('fire')];
  // Earlier today (3 hours ago, or midnight when it is not yet 3 AM: a pick from yesterday is rightly forgotten).
  const at = Math.max(new Date().setHours(0, 0, 0, 0), Date.now() - 3 * 3600_000);
  mockMem.set('whereabouts', JSON.stringify({ roomId: 'DEMO/1/R101', building: 'DEMO', floor: 1, source: 'manual', confidence: 'exact', at }));
  await open();
  expect(await screen.findByText('Exit R101')).toBeTruthy();
  expect(screen.getByText(/you picked it/)).toBeTruthy();
});

test('a QR scan sets an exact starting point', async () => {
  alerts = [activeAlert('fire')];
  await open();
  await fireEvent.press(await screen.findByRole('link', { name: 'Scan QR sticker instead' })); // optional, not the main action
  expect(await screen.findByText('Start at S2')).toBeTruthy();
  expect(screen.getByText(/scanned/i)).toBeTruthy();
});

test('re-routes live when an officer blocks a path, and says so when there is no way out', async () => {
  alerts = [activeAlert('earthquake')];
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Pick my room' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Second' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R201' }));
  expect(await screen.findByText('Go to X1')).toBeTruthy();

  snapshot.edges.find(e => e.id === 'DEMO/1/C1->DEMO/1/C2')!.status = 'blocked';
  await act(async () => mockLive.campus!());
  expect(await screen.findByText(/No safe way out found/)).toBeTruthy();
});

test('a barometer floor change moves the start to the stair landing and re-routes', async () => {
  alerts = [activeAlert('flood')];
  await open();
  await fireEvent.press(await screen.findByRole('button', { name: 'Pick my room' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Ground' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R101' }));
  expect(await screen.findByText('Take S1 up to Second')).toBeTruthy();

  await act(async () => mockBaro.floors!(1)); // climbed one floor
  expect(await screen.findByText(/floor change detected/)).toBeTruthy();
  expect(screen.getByText('Start at S2')).toBeTruthy();
  expect(screen.queryByText('Take S1 up to Second')).toBeNull();
});
