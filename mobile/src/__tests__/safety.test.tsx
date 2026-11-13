import { router } from 'expo-router';
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
const mockConfirm = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/lib/confirm', () => ({ confirm: (...a: unknown[]) => mockConfirm(...a) }));
let mockGps: { latitude: number; longitude: number; accuracy: number } | null = null;
jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: async () => ({ granted: mockGps !== null }),
  getCurrentPositionAsync: async () => ({ coords: mockGps }),
}));
let mockQr = 'evacuai://q/APSTICKR';
jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement, useEffect } = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => {
      useEffect(() => { if (mockQr) onBarcodeScanned({ data: mockQr }); }, [onBarcodeScanned]);
      return createElement(View, { testID: 'camera' });
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
// The class in session for /api/me/schedule/now (null: none).
let schedule: object | null = null;
let posts: { path: string; body: Record<string, unknown> }[] = [];
const zone = (count: number, capacity: number | null, full = false) => ({ node_id: 'DEMO/1/AP', name: 'AP', count, capacity, full });
let zones = [zone(2, 300)];
// The next check-in POST replies with this instead of succeeding (409 "already checked in").
let checkInReply: ((body: Record<string, unknown>) => { status: number; body: unknown } | null) | null = null;
let sosFails = false;

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
  zones = [zone(2, 300)];
  schedule = null;
  checkInReply = null;
  sosFails = false;
  mockConfirm.mockClear();
  mockConfirm.mockResolvedValue(true);
  mockQr = 'evacuai://q/APSTICKR';
  mockGps = null;
  snapshot.assemblyPoints[0].lat = null;
  snapshot.assemblyPoints[0].lng = null;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (init?.method === 'POST') {
      const body = init.body ? JSON.parse(init.body as string) : {};
      posts.push({ path, body });
      if (path === '/api/sos' && sosFails) return { ok: false, status: 500, json: async () => ({ message: 'Server error' }), headers: { get: () => null } } as unknown as Response;
      // Like the server: a fresh scan or pick wins, else the class in session, else what the phone sent.
      const exact = body.location_source === 'qr' || body.location_source === 'manual';
      if (path === '/api/sos') sos = sosWith({
        created_at: new Date().toISOString(),
        location_source: exact ? body.location_source : schedule ? 'schedule' : body.location_source ?? null,
        place: exact || schedule || body.node_id || body.room_id ? 'Demo Building · Second · R201' : null,
        room_id: exact || schedule || body.room_id ? 'DEMO/2/R201' : null,
      });
      if (path === '/api/sos/3/messages') sos = sosWith({ messages: [{ id: 1, body: body.body, mine: true, sender: 'Juan', created_at: '' }] });
      if (path === '/api/sos/3/cancel') sos = sosWith({ status: 'cancelled' });
      if (path === '/api/check-in') {
        const special = checkInReply?.(body);
        if (special) return { ok: false, status: special.status, json: async () => special.body, headers: { get: () => null } } as unknown as Response;
        checkIn = { alert_id: 7, status: 'safe', place: body.node_id ? 'Demo Building · Ground · AP' : null, checked_in_at: '2026-10-14T08:20:00+08:00', zones, history: [] };
      }
    }
    if (init?.method === 'PATCH') {
      const body = init.body ? JSON.parse(init.body as string) : {};
      posts.push({ path: `PATCH ${path}`, body });
      sos = sosWith({ status: 'pending', location_source: body.location_source, place: 'Demo Building · Second · R201', room_id: 'DEMO/2/R201' });
    }
    const body = path === '/api/me' ? { user }
      : path === '/api/me/schedule/now' ? { class: schedule }
      : path === '/api/alerts' ? { alerts }
      : path.startsWith('/api/sos') ? { sos }
      : path === '/api/check-in' ? { check_in: checkIn }
      : path === '/api/campus-snapshot' ? JSON.parse(JSON.stringify(snapshot)) : {};
    return { ok: true, status: path === '/api/location' ? 204 : 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('sends an SOS with a room picked a moment ago and chats live with the officer', async () => {
  mockMem.set('whereabouts', JSON.stringify({ nodeId: 'DEMO/2/R201', roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2, source: 'manual', confidence: 'exact', at: Date.now() - 60_000 }));
  await renderRouter('./src/app', { initialUrl: '/sos' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));

  expect(await screen.findByText('Waiting for a safety officer…')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/sos')!.body).toEqual({ node_id: 'DEMO/2/R201', room_id: 'DEMO/2/R201', building_id: 'DEMO', level: 2, location_source: 'manual' });
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
  await fireEvent.press(await screen.findByRole('button', { name: 'Scan safe zone QR' }));
  expect(await screen.findByText('You checked in safe at Demo Building · Ground · AP.')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/check-in')!.body).toEqual({ node_id: 'DEMO/1/AP', source: 'qr' });
  expect(posts.find(p => p.path === '/api/location')!.body).toMatchObject({ source: 'qr', node_id: 'DEMO/1/AP' });
});

test('a sticker that is not a safe zone is rejected, and "I need help" is gone (SOS is the way to ask)', async () => {
  alerts = [alert];
  checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null };
  mockQr = 'evacuai://q/S2STICKR';
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Scan safe zone QR' }));
  expect(await screen.findByText(/That sticker is not at a safe zone/)).toBeTruthy();
  expect(posts.some(p => p.path === '/api/check-in')).toBe(false);
  expect(screen.queryByRole('button', { name: 'I need help' })).toBeNull();
});

test('GPS inside the assembly point radius offers a one-tap check-in', async () => {
  alerts = [alert];
  checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null };
  Object.assign(snapshot.assemblyPoints[0], { lat: 10.3270, lng: 123.9500, radius_m: 25 });
  mockGps = { latitude: 10.32705, longitude: 123.95008, accuracy: 8 }; // about 10 m away
  await renderRouter('./src/app', { initialUrl: '/checkin' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Check in safe at AP' }));
  expect(await screen.findByText('You checked in safe at Demo Building · Ground · AP.')).toBeTruthy();
  expect(posts.find(p => p.path === '/api/check-in')!.body).toEqual({ node_id: 'DEMO/1/AP', source: 'gps' });
});

describe('safe zones and check-in history', () => {
  const ready = () => {
    alerts = [alert];
    checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null, zones, history: [] };
  };

  test('lists each safe zone with its head count and capacity, and checks in from the list', async () => {
    zones = [zone(2, 300), { node_id: 'DEMO/1/X1', name: 'Gate', count: 0, capacity: null, full: false }];
    ready();
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    expect(await screen.findByRole('button', { name: 'AP · 2 of 300' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gate · 0 here' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'AP · 2 of 300' }));
    expect(await screen.findByText('You checked in safe at Demo Building · Ground · AP.')).toBeTruthy();
    expect(posts.find(p => p.path === '/api/check-in')!.body).toEqual({ node_id: 'DEMO/1/AP', source: 'list' });
  });

  test('a full zone says so', async () => {
    zones = [zone(300, 300, true)];
    ready();
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    expect(await screen.findByRole('button', { name: 'AP · 300 of 300 · Full' })).toBeTruthy();
  });

  test('checking in again asks first, and only replaces the status when the user says Update', async () => {
    ready();
    checkInReply = body => (body.replace ? null : { status: 409, body: { error: 'already_checked_in', place: 'Demo Building · Ground · AP', checked_in_at: '2026-10-29T06:41:00Z', message: 'You already checked in. Update your status?' } });
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    mockConfirm.mockResolvedValueOnce(false);
    await fireEvent.press(await screen.findByRole('button', { name: "I'm safe (not at a safe zone)" }));
    await screen.findByRole('button', { name: "I'm safe (not at a safe zone)" });
    expect(mockConfirm).toHaveBeenCalledWith('You already checked in at Demo Building · Ground · AP at 2:41 PM. Update your status?', expect.any(String), 'Update');
    expect(posts.filter(p => p.path === '/api/check-in')).toHaveLength(1); // Keep: nothing re-sent

    await fireEvent.press(screen.getByRole('button', { name: "I'm safe (not at a safe zone)" }));
    expect(await screen.findByText('You checked in safe.')).toBeTruthy();
    expect(posts.filter(p => p.path === '/api/check-in').at(-1)!.body).toEqual({ node_id: null, source: 'none', replace: true });
  });

  test('when the chosen zone is full, another one with space is suggested', async () => {
    ready();
    const fullZone = zone(300, 300, true);
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    const real = (global.fetch as jest.Mock).getMockImplementation()!;
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/check-in') && init?.method === 'POST') {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({
          check_in: { alert_id: 7, status: 'safe', place: 'Demo Building · Ground · AP', checked_in_at: '2026-10-29T06:41:00Z', zones: [fullZone], history: [] },
          zones: [fullZone], suggest: { node_id: 'DEMO/1/X1', name: 'Gate', count: 1, capacity: 50, full: false },
        }) } as unknown as Response;
      }
      return real(url, init);
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'AP · 2 of 300' }));
    expect(await screen.findByText('AP is full. Gate has space.')).toBeTruthy();
  });

  test('shows earlier check-ins', async () => {
    ready();
    checkIn = { ...checkIn!, status: 'safe', place: null, checked_in_at: '2026-10-29T06:50:00Z',
      history: [{ place: null, at: '2026-10-29T06:50:00Z' }, { place: 'Demo Building · Ground · AP', at: '2026-10-29T06:41:00Z' }] };
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    expect(await screen.findByText('2:41 PM · Demo Building · Ground · AP')).toBeTruthy();
  });
});

test('the chat shows each message time and a day separator', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-29T04:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'] }); // only the clock is fake
  sos = sosWith({ status: 'acknowledged', responder: 'Officer Cruz', messages: [
    { id: 1, body: 'Are you hurt?', mine: false, sender: 'Officer Cruz', created_at: '2026-10-28T02:00:00Z' },
    { id: 2, body: 'Yes, my leg', mine: true, sender: 'Juan', created_at: '2026-10-29T06:41:00Z' },
  ] });
  try {
    await renderRouter('./src/app', { initialUrl: '/sos' });
    expect(await screen.findByText('Yes, my leg')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Yesterday' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText(/2:41 PM/)).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

describe('SOS location', () => {
  const nowHHMM = () => { const d = new Date(Date.now() - 10 * 60_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  test('a class in session fills in the place, and the student confirms it', async () => {
    schedule = { subject: 'IT 101', room_id: 'DEMO/2/R201', room_name: 'R201', building: 'DEMO', level: 2, time_start: nowHHMM() };
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));

    expect(await screen.findByText('We sent your class room: Demo Building · Second · R201. Are you there?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Yes' }));
    expect(posts.find(p => p.path.startsWith('PATCH /api/sos/3/location'))!.body).toMatchObject({ location_source: 'manual' });
    expect(screen.queryByText(/Are you there\?/)).toBeNull();
  });

  test('"No, change" lets the student pick the right room', async () => {
    schedule = { subject: 'IT 101', room_id: 'DEMO/2/R201', room_name: 'R201', building: 'DEMO', level: 2, time_start: nowHHMM() };
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'No, change' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Pick my room' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Ground' }));
    await fireEvent.press(screen.getByRole('button', { name: 'R101' }));
    expect(posts.find(p => p.path.startsWith('PATCH /api/sos/3/location'))!.body).toMatchObject({ location_source: 'manual' });
  });

  test('without any known place the SOS still goes out, then asks where they are', async () => {
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
    expect(posts.find(p => p.path === '/api/sos')!.body).toMatchObject({ node_id: null, room_id: null });
    expect(await screen.findByText('Location unknown. Pick your room or scan a sticker so officers can find you.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pick my room' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Second' }));
    await fireEvent.press(screen.getByRole('button', { name: 'R201' }));
    expect(posts.find(p => p.path.startsWith('PATCH /api/sos/3/location'))!.body).toMatchObject({ location_source: 'manual' });
  });
});

describe('SOS location: guesses are never sent as facts', () => {
  test('a class that ended hours ago is not sent as the SOS place', async () => {
    mockMem.set('whereabouts', JSON.stringify({ roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2, source: 'schedule', confidence: 'likely', at: Date.now() - 5 * 3_600_000 }));
    schedule = null; // no class now
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
    expect(posts.find(p => p.path === '/api/sos')!.body).toMatchObject({ node_id: null, room_id: null, location_source: null });
  });

  test('the room of a class that ended a few minutes ago is sent as approximate', async () => {
    mockMem.set('whereabouts', JSON.stringify({ roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2, source: 'schedule', confidence: 'likely', at: Date.now() - 50 * 60_000 }));
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
    expect(posts.find(p => p.path === '/api/sos')!.body).toMatchObject({ room_id: 'DEMO/2/R201', location_source: 'estimate' });
  });

  test('a floor-change guess is sent as an estimate, and the student is asked to confirm it', async () => {
    mockMem.set('whereabouts', JSON.stringify({ nodeId: 'DEMO/2/R201', roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2, source: 'barometer', confidence: 'likely', at: Date.now() - 60_000 }));
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
    expect(posts.find(p => p.path === '/api/sos')!.body).toMatchObject({ location_source: 'estimate' });
  });
});

describe('one-tap SOS', () => {
  test('the home SOS button sends at once and opens the chat', async () => {
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: 'SOS' }));
    expect(await screen.findByText('Waiting for a safety officer…')).toBeTruthy();
    expect(posts.filter(p => p.path === '/api/sos')).toHaveLength(1);
    expect(posts[0].path).toBe('/api/sos'); // nothing (no location call) goes before the SOS
  });

  test('shows retry when sending fails', async () => {
    sosFails = true;
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: 'SOS' }));
    expect(await screen.findByText("Couldn't send. Tap to retry")).toBeTruthy();
  });

  test('adds a GPS fix after the SOS when there is no class or known place', async () => {
    mockGps = { latitude: 10.327, longitude: 123.95, accuracy: 12 };
    await renderRouter('./src/app', { initialUrl: '/' });
    await fireEvent.press(await screen.findByRole('button', { name: 'SOS' }));
    await screen.findByText('Waiting for a safety officer…');
    await act(async () => undefined);
    expect(posts.find(p => p.path === 'PATCH /api/sos/3/location')!.body).toEqual({ lat: 10.327, lng: 123.95, accuracy: 12 });
  });

  test('offers Cancel (sent by mistake) only in the first 10 seconds', async () => {
    sos = sosWith({ created_at: new Date().toISOString() });
    await renderRouter('./src/app', { initialUrl: '/sos' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel (sent by mistake)' }));
    expect(posts.map(p => p.path)).toContain('/api/sos/3/cancel');
  });

  test('after 10 seconds only the normal cancel is offered', async () => {
    sos = sosWith({ created_at: new Date(Date.now() - 11_000).toISOString() });
    await renderRouter('./src/app', { initialUrl: '/sos' });
    expect(await screen.findByRole('button', { name: "Cancel SOS (I'm safe now)" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel (sent by mistake)' })).toBeNull();
  });
});

describe('QR scanner closes', () => {
  beforeEach(() => { alerts = [alert]; mockQr = ''; checkIn = { alert_id: 7, status: null, place: null, checked_in_at: null }; }); // no sticker in view: the camera stays open

  test('the scan button toggles the camera', async () => {
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan safe zone QR' }));
    expect(screen.getByTestId('camera')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close scanner' }));
    expect(screen.queryByTestId('camera')).toBeNull();
    expect(screen.getByRole('button', { name: 'Scan safe zone QR' })).toBeTruthy();
  });

  test('Close over the camera closes it', async () => {
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan safe zone QR' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('camera')).toBeNull();
  });

  test('leaving the screen closes the camera', async () => {
    await renderRouter('./src/app', { initialUrl: '/checkin' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan safe zone QR' }));
    await act(async () => router.push('/alerts'));
    await act(async () => router.back());
    expect(await screen.findByRole('button', { name: 'Scan safe zone QR' })).toBeTruthy();
    expect(screen.queryByTestId('camera')).toBeNull();
  });
});
