import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { loadDemoSnapshot } from './helpers';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));
jest.mock('@/lib/realtime', () => ({
  subscribeAlerts: async () => () => undefined,
  subscribeCampus: async () => () => undefined,
  subscribeSos: async () => () => undefined,
  subscribeOfficers: async () => () => undefined,
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const fire = {
  id: 7, hazard_type: 'fire', severity_level: 'high', message: 'Fire on the 2nd floor. Leave now.', status: 'active', source: 'admin',
  verified: true, is_drill: false, building_id: null, issued_at: '2026-10-21T08:00:00+08:00', resolved_at: null,
};
let alerts: object[] = [];

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  alerts = [];
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = path === '/api/me' ? { user } : path === '/api/alerts' ? { alerts }
      : path === '/api/campus-snapshot' ? loadDemoSnapshot() : path === '/api/me/schedule/now' ? { class: null } : {};
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('during an alert the home leads with one big EVACUATE NOW button that opens the route', async () => {
  alerts = [fire];
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Fire on the 2nd floor. Leave now.')).toBeTruthy();
  const evacuate = screen.getByRole('button', { name: 'Evacuate now: evacuation route' });
  expect(screen.getByText('Evacuate now')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check in safe' })).toBeTruthy();
  await fireEvent.press(evacuate);
  expect(await screen.findByRole('header', { name: 'Evacuation route' })).toBeTruthy();
});

test('without an alert the home is calm: an all-clear note and the normal route button', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText(/No active alerts/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Evacuation route' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Check in safe' })).toBeNull();
});
