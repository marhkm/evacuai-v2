import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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
const mockNotif: { last: unknown } = { last: null };
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: async () => mockNotif.last,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
}));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const snapshot = loadDemoSnapshot();
const officerSays = (id: number, body: string) => ({ id, body, mine: false, sender: 'Officer Cruz', created_at: '2026-10-14T08:06:00+08:00' });
const sosWith = (over: object) => ({
  id: 3, status: 'acknowledged', message: null, place: 'Demo Building · Second · R201', responder: 'Officer Cruz', created_at: '2026-10-14T08:05:00+08:00', messages: [], ...over,
});
let sos: object | null = null;
const fetched = (p: string) => (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).endsWith(p)).length;

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  mockLive.sos = undefined;
  mockNotif.last = null;
  sos = sosWith({ messages: [officerSays(1, 'We are coming')] });
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = path === '/api/me' ? { user }
      : path === '/api/alerts' ? { alerts: [] }
      : path.startsWith('/api/sos') ? { sos }
      : path === '/api/campus-snapshot' ? JSON.parse(JSON.stringify(snapshot)) : {};
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('a new officer reply shows a banner on another screen; tapping it opens the SOS chat', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  await waitFor(() => expect(mockLive.sos).toBeDefined()); // the banner listens to the open SOS
  expect(screen.queryByText('Safety officer replied')).toBeNull(); // replies from before the app opened: the push covered them

  sos = sosWith({ messages: [officerSays(1, 'We are coming'), officerSays(2, 'Stay by the window')] });
  await act(async () => mockLive.sos!());
  expect(await screen.findByText('Safety officer replied')).toBeTruthy();
  expect(screen.getByText('Stay by the window')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: /Safety officer replied/ }));
  expect(await screen.findByText('Officer Cruz is responding.')).toBeTruthy(); // the SOS chat
  expect(screen.queryByText('Safety officer replied')).toBeNull();
});

test('no banner once the SOS is resolved', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  await waitFor(() => expect(mockLive.sos).toBeDefined()); // the banner listens to the open SOS

  sos = sosWith({ status: 'resolved', messages: [officerSays(1, 'We are coming'), officerSays(2, 'All clear')] });
  await act(async () => mockLive.sos!());
  await waitFor(() => expect(fetched('/api/sos/current')).toBe(2));
  expect(screen.queryByText('Safety officer replied')).toBeNull();
});

test("tapping the reply push opens the student's SOS chat", async () => {
  mockNotif.last = { notification: { request: { content: { data: { sos_id: 3 } } } } };
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Officer Cruz is responding.')).toBeTruthy();
});
