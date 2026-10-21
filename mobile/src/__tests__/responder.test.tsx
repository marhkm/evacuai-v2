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

const mockLive: { officers?: () => void } = {};
jest.mock('@/lib/realtime', () => ({
  subscribeAlerts: async () => () => undefined,
  subscribeCampus: async () => () => undefined,
  subscribeSos: async () => () => undefined,
  subscribeOfficers: async (_token: string, cb: () => void) => { mockLive.officers = cb; return () => undefined; },
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));
const mockConfirm = jest.fn(async () => true);
jest.mock('@/lib/confirm', () => ({ confirm: (...a: unknown[]) => mockConfirm(...(a as [])) }));

const officer = { id: 2, name: 'Olive Officer', email: 'o@x.test', role: 'safety_officer', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const student = { ...officer, id: 1, name: 'Juan', role: 'student' };
const snapshot = loadDemoSnapshot();
const alert = (id: number, status: string, extra = {}) => ({
  id, hazard_type: 'fire', severity_level: 'high', message: `Alert ${id}`, translations: null, status, source: 'admin',
  verified: true, is_drill: false, building_id: null, issued_at: '2026-10-21T08:00:00+08:00', resolved_at: null, ...extra,
});

let calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
let sosList: object[] = [];
let alertPosts = 0;
let secondFloor: Promise<void> = Promise.resolve();
const sosDetail = {
  id: 3, person: 'Juan', status: 'pending', message: 'Leg is hurt', place: 'Demo Building · Second · R201', responder: null,
  created_at: '2026-10-21T08:05:00+08:00', messages: [{ id: 1, body: 'Please hurry', mine: false, sender: 'Juan', created_at: '2026-10-21T08:06:00+08:00' }],
};
const person = (id: number, name: string, status: string) => ({ id, name, role: 'student', status, place: 'Demo Building · Second · R201', source: 'manual', updated_at: null, phone: '09170000000' });

function serve(user: object) {
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ method, path, body });
    const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data, headers: { get: () => null } }) as unknown as Response;
    if (path === '/api/me') return reply(200, { user });
    if (path === '/api/alerts') return reply(200, { alerts: [] });
    if (path === '/api/campus-snapshot') return reply(200, JSON.parse(JSON.stringify(snapshot)));
    if (path === '/api/officer/overview') return reply(200, { stats: { open_sos: sosList.length, pending_reports: 0, blocked_paths: 0 }, active_alert: alert(7, 'active') });
    if (path === '/api/officer/sos?open=1') return reply(200, { sos: sosList, meta: { current_page: 1, last_page: 1 } });
    if (path.startsWith('/api/officer/sos/3')) return reply(200, { sos: sosDetail });
    if (path === '/api/officer/safety') {
      return reply(200, {
        alert: alert(7, 'active'), alerts: [], counts: { total: 3, safe: 1, needs_help: 1, unknown: 1, sos: 0 }, occupancy: [],
        people: [person(1, 'Ana Safe', 'safe'), person(2, 'Ben Help', 'needs_help'), person(3, 'Cy Unknown', 'unknown')],
      });
    }
    if (path === '/api/officer/paths?building=DEMO&level=2' && method === 'GET') {
      await secondFloor; // held until the test lets it through
      return reply(200, { paths: [{ id: 'DEMO/2/C1->DEMO/2/S2', type: 'corridor', building_id: 'DEMO', level: 2, from: 'C1', to: 'S2', status: 'open', updated_by: null }] });
    }
    if (path.startsWith('/api/officer/paths')) {
      return reply(200, method === 'PATCH' ? { path: {} } : { paths: [{ id: 'DEMO/1/C1->DEMO/1/C2', type: 'corridor', building_id: 'DEMO', level: 1, from: 'C1', to: 'C2', status: 'open', updated_by: null }] });
    }
    if (path === '/api/officer/alerts' && method === 'POST') return reply(200, ++alertPosts === 1 ? { needs_confirmation: true, reporters: 1 } : { alert: alert(8, 'active') });
    if (path === '/api/officer/alerts') return reply(200, { alerts: [alert(7, 'active'), alert(5, 'draft', { message: 'Draft from PHIVOLCS' })] });
    if (path.startsWith('/api/officer/alerts/')) return reply(200, { alert: alert(7, 'resolved') });
    return reply(200, {});
  }) as jest.Mock;
}

beforeEach(() => {
  mockMem.clear();
  calls = [];
  sosList = [];
  alertPosts = 0;
  secondFloor = Promise.resolve();
  mockConfirm.mockClear();
  mockConfirm.mockResolvedValue(true);
});
const posted = (path: string) => calls.find(c => c.method === 'POST' && c.path === path);

test('an officer opens on the Responder home; Student view shows the normal home', async () => {
  serve(officer);
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Responder')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Student view' }));
  expect(await screen.findByText('Welcome, Olive Officer')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Responder mode' })).toBeTruthy();
});

test('a student who opens a Responder link gets the normal home', async () => {
  serve(student);
  await renderRouter('./src/app', { initialUrl: '/responder/sos' });
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  expect(calls.some(c => c.path.startsWith('/api/officer'))).toBe(false);
  expect(screen.queryByRole('button', { name: 'Responder mode' })).toBeNull();
});

test('an officer who has not agreed to the privacy notice is asked first, even from a Responder link', async () => {
  serve({ ...officer, consented: false });
  await renderRouter('./src/app', { initialUrl: '/responder/missing' });
  expect(await screen.findByText('Your privacy')).toBeTruthy();
  expect(calls.some(c => c.path.startsWith('/api/officer'))).toBe(false);
});

test('SOS inbox refreshes live; the chat acknowledges, replies and resolves', async () => {
  serve(officer);
  await renderRouter('./src/app', { initialUrl: '/responder/sos' });
  expect(await screen.findByText(/No open SOS/)).toBeTruthy();
  sosList = [{ id: 3, person: 'Juan', place: 'Demo Building · Second · R201', status: 'pending', message: 'Leg is hurt', created_at: '2026-10-21T08:05:00+08:00' }];
  await act(async () => mockLive.officers!());
  await fireEvent.press(await screen.findByRole('button', { name: /Juan/ }));

  expect(await screen.findByText('Please hurry')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Acknowledge' }));
  await waitFor(() => expect(posted('/api/officer/sos/3/acknowledge')).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText('Message'), 'We are coming');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(posted('/api/officer/sos/3/messages')?.body).toEqual({ body: 'We are coming' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(posted('/api/officer/sos/3/resolve')).toBeTruthy());
  expect(mockConfirm).toHaveBeenCalled();
});

test("Who's missing lists only people who need help or are unknown, and stores nothing about them", async () => {
  serve(officer);
  await renderRouter('./src/app', { initialUrl: '/responder/missing' });
  expect(await screen.findByText('Ben Help')).toBeTruthy();
  expect(screen.getByText('Cy Unknown')).toBeTruthy();
  expect(screen.queryByText('Ana Safe')).toBeNull();
  expect([...mockMem.values()].join(' ')).not.toMatch(/Ben Help|Cy Unknown/);
});

test('setting a path to Blocked patches it by its encoded id', async () => {
  serve(officer);
  await renderRouter('./src/app', { initialUrl: '/responder/paths' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Blocked: C1 to C2' }));
  await waitFor(() => {
    const call = calls.find(c => c.method === 'PATCH');
    expect(call?.path).toBe(`/api/officer/paths/${encodeURIComponent('DEMO/1/C1->DEMO/1/C2')}`);
    expect(call?.body).toEqual({ status: 'blocked' });
  });
});

test("switching floors never shows the previous floor's paths, so a tap cannot block the wrong one", async () => {
  serve(officer);
  let release!: () => void;
  secondFloor = new Promise(r => { release = r; });
  await renderRouter('./src/app', { initialUrl: '/responder/paths' });
  expect(await screen.findByRole('button', { name: 'Blocked: C1 to C2' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Second' }));
  expect(screen.queryByRole('button', { name: 'Blocked: C1 to C2' })).toBeNull(); // floor 1's rows are gone at once
  await act(async () => release());
  expect(await screen.findByRole('button', { name: 'Blocked: C1 to S2' })).toBeTruthy();
});

test('broadcast asks for direct confirmation with too few reports; resolve asks first', async () => {
  serve(officer);
  await renderRouter('./src/app', { initialUrl: '/responder/alerts' });
  await fireEvent.changeText(await screen.findByLabelText('Message'), 'Fire on the 2nd floor');
  await fireEvent.press(screen.getByRole('button', { name: 'Broadcast' }));
  await waitFor(() => expect(alertPosts).toBe(2));
  expect(mockConfirm.mock.calls[0]).toEqual(expect.arrayContaining([expect.stringContaining('1 matching report')]));
  expect(calls.filter(c => c.path === '/api/officer/alerts' && c.method === 'POST')[1].body).toMatchObject({ message: 'Fire on the 2nd floor', confirm: true });

  mockConfirm.mockResolvedValueOnce(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Resolve: Alert 7' }));
  expect(posted('/api/officer/alerts/7/resolve')).toBeUndefined();
  await fireEvent.press(screen.getByRole('button', { name: 'Resolve: Alert 7' }));
  await waitFor(() => expect(posted('/api/officer/alerts/7/resolve')).toBeTruthy());
});
