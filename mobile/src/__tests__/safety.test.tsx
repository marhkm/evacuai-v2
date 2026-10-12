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

const mockLive: { sos?: () => void } = {};
jest.mock('@/lib/realtime', () => ({
  subscribeAlerts: async () => () => undefined,
  subscribeCampus: async () => () => undefined,
  subscribeSos: async (_id: number, _token: string, cb: () => void) => { mockLive.sos = cb; return () => undefined; },
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));
let mockGps: { latitude: number; longitude: number; accuracy: number } | null = null;
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: async () => ({ granted: mockGps !== null }),
  getCurrentPositionAsync: async () => ({ coords: mockGps }),
}));
let mockQr = 'evacuai://q/APSTICKR';
jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => {
      useEffect(() => { onBarcodeScanned({ data: mockQr }); }, [onBarcodeScanned]);
      return null;
    },
  };
});

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const alert = {
  id: 7, hazard_type: 'fire', severity_level: 'high', message: 'Fire drill', status: 'active', source: 'admin',
  verified: true, is_drill: true, building_id: null, issued_at: '2026-10-14T08:00:00+08:00', resolved_at: null,
};
const snapshot = loadDemoSnapshot();
snapshot.nodes.find(n => n.id === 'DEMO/1/AP')!.qr_id = 'APSTICKR';
snapshot.nodes.find(n => n.id === 'DEMO/2/S2')!.qr_id = 'S2STICKR';

let alerts: object[] = [];
let sos: object | null = null;
let checkIn: object | null = null;
let posts: { path: string; body: Record<string, unknown> }[] = [];

const sosWith = (over: object) => ({
  id: 3, status: 'pending', message: null, place: 'Demo Building · Second · R201', responder: null, created_at: '2026-10-14T08:05:00+08:00', messages: [], ...over,
});

beforeEach(() => {
  forgetWhereabouts();
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  alerts = [];
  sos = null;
  checkIn = null;
  posts = [];
  mockQr = 'evacuai://q/APSTICKR';
  mockGps = null;
  snapshot.assemblyPoints[0].lat = null;
  snapshot.assemblyPoints[0].lng = null;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (init?.method === 'POST') {
      const body = init.body ? JSON.parse(init.body as string) : {};
      posts.push({ path, body });
      if (path === '/api/sos') sos = sosWith({ message: body.message });
      if (path === '/api/sos/3/messages') sos = sosWith({ messages: [{ id: 1, body: body.body, mine: true, sender: 'Juan', created_at: '' }] });
      if (path === '/api/sos/3/cancel') sos = sosWith({ status: 'cancelled' });
      if (path === '/api/check-in') checkIn = { alert_id: 7, status: body.status, place: body.node_id ? 'Demo Building · Ground · AP' : null, checked_in_at: '2026-10-14T08:20:00+08:00' };
    }
    const body = path === '/api/me' ? { user }
      : path === '/api/alerts' ? { alerts }
      : path.startsWith('/api/sos') ? { sos }
      : path === '/api/check-in' ? { check_in: checkIn }
      : path === '/api/campus-snapshot' ? JSON.parse(JSON.stringify(snapshot)) : {};
    return { ok: true, status: path === '/api/location' ? 204 : 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('sends an SOS from a picked room and chats live with the officer', async () => {
  await renderRouter('./src/app', { initialUrl: '/sos' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Pick my room' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Second' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R201' }));
  expect(await screen.findByText('Your location: R201')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('What happened? (optional)'), 'Leg is hurt');
  await fireEvent.press(screen.getByRole('button', { name: 'Send SOS' }));

  expect(await screen.findByText('Waiting for a safety officer…')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/sos')!.body).toEqual({ node_id: 'DEMO/2/R201', message: 'Leg is hurt' });
  expect(posts.some(p => p.path === '/api/location')).toBe(false); // no active alert: location stays on the phone

  sos = sosWith({ status: 'acknowledged', responder: 'Officer Cruz', messages: [{ id: 9, body: 'Stay where you are, we are coming', mine: false, sender: 'Officer Cruz', created_at: '' }] });
  await act(async () => mockLive.sos!());
  expect(await screen.findByText('Officer Cruz is responding.')).toBeTruthy();
  expect(screen.getByText('Stay where you are, we are coming')).toBeTruthy();
  expect(screen.queryByRole('button', { name: "Cancel SOS (I'm safe now)" })).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Message'), 'Thank you');
  await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
  expect(await screen.findByText('Thank you')).toBeTruthy();
});

test('a pending SOS can be cancelled', async () => {
  sos = sosWith({});
  await renderRouter('./src/app', { initialUrl: '/sos' });
  await fireEvent.press(await screen.findByRole('button', { name: "Cancel SOS (I'm safe now)" }));
  expect(await screen.findByRole('button', { name: 'Send SOS' })).toBeTruthy();
  expect(posts.map(p => p.path)).toContain('/api/sos/3/cancel');
});

test('check-in is closed without an active alert', async () => {
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  expect(await screen.findByText(/no active alert/i)).toBeTruthy();
});

test('scanning the assembly point checks the user in safe and reports their location', async () => {
  alerts = [alert];
  checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null };
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Scan assembly point QR' }));
  expect(await screen.findByText('You checked in safe at Demo Building · Ground · AP.')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/check-in')!.body).toEqual({ status: 'safe', node_id: 'DEMO/1/AP' });
  expect(posts.find(p => p.path === '/api/location')!.body).toMatchObject({ source: 'qr', node_id: 'DEMO/1/AP' });
});

test('a sticker that is not an assembly point is rejected; "I need help" offers SOS', async () => {
  alerts = [alert];
  checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null };
  mockQr = 'evacuai://q/S2STICKR';
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Scan assembly point QR' }));
  expect(await screen.findByText(/That sticker is not at an assembly point/)).toBeTruthy();
  expect(posts.some(p => p.path === '/api/check-in')).toBe(false);

  await fireEvent.press(screen.getByRole('button', { name: 'I need help' }));
  expect(await screen.findByText('You said you need help.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Send SOS' })).toBeTruthy();
});

test('GPS inside the assembly point radius offers a one-tap check-in', async () => {
  alerts = [alert];
  checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null };
  Object.assign(snapshot.assemblyPoints[0], { lat: 10.3270, lng: 123.9500, radius_m: 25 });
  mockGps = { latitude: 10.32705, longitude: 123.95008, accuracy: 8 }; // about 10 m away
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Check in safe at AP' }));
  expect(await screen.findByText('You checked in safe at Demo Building · Ground · AP.')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/check-in')!.body).toEqual({ status: 'safe', node_id: 'DEMO/1/AP' });
});
