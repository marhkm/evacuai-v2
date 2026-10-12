import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const demo = require('../../../campus-data/demo.snapshot.json');

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));

const mockLive: { push?: (a: unknown) => void } = {};
jest.mock('@/lib/realtime', () => ({
  subscribeAlerts: async (onAlert: (a: unknown) => void) => {
    mockLive.push = onAlert;
    return () => undefined;
  },
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const alert = (over: object = {}) => ({
  id: 1, hazard_type: 'fire', severity_level: 'high', message: 'Fire at BE 2F. Use Stairs Left.', status: 'active',
  source: 'admin', verified: true, is_drill: false, building_id: 'BE', issued_at: '2026-10-12T08:00:00+08:00', resolved_at: null, ...over,
});

let alerts: object[] = [];
const posted: { url: string; body: any }[] = [];

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  alerts = [];
  posted.length = 0;
  global.fetch = jest.fn(async (url: string, init: any = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init.method ?? 'GET';
    if (method === 'POST') posted.push({ url: path, body: JSON.parse(init.body) });
    let status = 200;
    let body: unknown = {};
    if (path === '/api/me') body = { user };
    else if (path === '/api/alerts') body = { alerts };
    else if (path === '/api/campus-snapshot') body = demo;
    else if (path === '/api/hazard-reports') {
      const b = JSON.parse(init.body);
      [status, body] = b.room_id === 'DEMO/2/R201' ? [422, { errors: { room_id: ['That room is not on the selected floor.'] } }] : [201, { report: { id: 9, status: 'pending' } }];
    }
    return { ok: status < 300, status, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('home shows the active alert banner', async () => {
  alerts = [alert()];
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('FIRE ALERT')).toBeTruthy();
  expect(screen.getByText('Fire at BE 2F. Use Stairs Left.')).toBeTruthy();
});

test('the banner shows reviewed Cebuano and Filipino translations', async () => {
  alerts = [alert({ translations: { ceb: 'Sunog sa BE 2F. Gamita ang Stairs Left.', fil: 'May sunog sa BE 2F. Gamitin ang Stairs Left.' } })];
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Sunog sa BE 2F. Gamita ang Stairs Left.')).toBeTruthy();
  expect(screen.getByText('May sunog sa BE 2F. Gamitin ang Stairs Left.')).toBeTruthy();
});

test('drill and unverified alerts are labelled', async () => {
  alerts = [alert({ id: 2, is_drill: true, verified: false, hazard_type: 'earthquake' })];
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('[DRILL] UNVERIFIED EARTHQUAKE ALERT')).toBeTruthy();
});

test('a live alert appears without reloading, and a resolve clears the banner', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  expect(screen.queryByText('FIRE ALERT')).toBeNull();

  await act(async () => mockLive.push!(alert()));
  expect(await screen.findByText('FIRE ALERT')).toBeTruthy();

  await act(async () => mockLive.push!(alert({ status: 'resolved' })));
  expect(screen.queryByText('FIRE ALERT')).toBeNull();
});

test('the alerts screen lists history with status', async () => {
  alerts = [alert(), alert({ id: 3, hazard_type: 'flood', status: 'retracted', message: 'False alarm' })];
  await renderRouter('./src/app', { initialUrl: '/alerts' });
  expect(await screen.findByText('False alarm')).toBeTruthy();
  expect(screen.getByText('Retracted')).toBeTruthy();
  expect(screen.getByText('Active')).toBeTruthy();
});

test('reporting a hazard sends type, building, floor and room', async () => {
  await renderRouter('./src/app', { initialUrl: '/report' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Fire' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Ground' }));
  await fireEvent.press(screen.getByRole('button', { name: 'R101' }));
  await fireEvent.changeText(screen.getByLabelText('What do you see?'), 'Smoke from the door');
  await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
  expect(await screen.findByText(/Report sent/)).toBeTruthy();
  expect(posted.find(p => p.url === '/api/hazard-reports')?.body).toEqual({
    hazard_type: 'fire', building_id: 'DEMO', level: 1, room_id: 'DEMO/1/R101', description: 'Smoke from the door',
  });
});

test('report requires a hazard type', async () => {
  await renderRouter('./src/app', { initialUrl: '/report' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Send report' }));
  expect(await screen.findByText('Choose what kind of hazard it is.')).toBeTruthy();
  expect(posted.length).toBe(0);
});
