import * as Haptics from 'expo-haptics';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

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
const mockReduced = { on: false };
jest.mock('@/lib/motion', () => ({
  useReduced: () => mockReduced.on,
  EASE_OUT: 'ease-out',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AnimatedView: require('react-native').View,
}));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
const fire = {
  id: 7, hazard_type: 'fire', severity_level: 'high', message: 'Fire on the 2nd floor. Leave now.', status: 'active', source: 'admin',
  verified: true, is_drill: false, building_id: null, issued_at: '2026-10-21T08:00:00+08:00', resolved_at: null,
  translations: { ceb: 'Sunog sa ikaduhang andana.' },
};
let alerts: object[] = [];
let sos: object | null = null;

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  alerts = [];
  sos = null;
  jest.clearAllMocks();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (path === '/api/sos' && init?.method === 'POST') sos = { id: 3, status: 'pending', message: null, place: null, responder: null, created_at: '', messages: [] };
    const body = path === '/api/me' ? { user } : path === '/api/alerts' ? { alerts }
      : path.startsWith('/api/sos') ? { sos } : path === '/api/campus-snapshot' ? loadDemoSnapshot() : {};
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('sending an SOS gives a firm tap, then a success buzz when it went through', async () => {
  await renderRouter('./src/app', { initialUrl: '/sos' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Send SOS' }));
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success));
  expect(await screen.findByText('Waiting for a safety officer…')).toBeTruthy();
});

test('tapping the alert band opens its details in a sheet, with Evacuate now', async () => {
  alerts = [fire];
  await renderRouter('./src/app', { initialUrl: '/' });
  await fireEvent.press(await screen.findByRole('alert'));
  const sheet = await screen.findByLabelText('sheet');
  expect(sheet).toBeTruthy();
  expect(screen.getAllByText('Fire on the 2nd floor. Leave now.').length).toBeGreaterThan(1); // band + sheet
  expect(screen.getAllByText('Sunog sa ikaduhang andana.').length).toBeGreaterThan(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Evacuate now' }));
  expect(await screen.findByRole('header', { name: 'Evacuation route' })).toBeTruthy();
});

test('changing a choice chip gives a light selection tick', async () => {
  await renderRouter('./src/app', { initialUrl: '/route' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Fire' }));
  expect(Haptics.selectionAsync).toHaveBeenCalled();
});

test('buttons shrink a little on press, or only dim when the phone asks for reduced motion', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  const face = () => screen.getAllByTestId('button-face')[0];
  await fireEvent(await screen.findByRole('button', { name: 'SOS' }), 'pressIn');
  expect(JSON.stringify(face().props.style)).toContain('"scale":0.97');
  await fireEvent(screen.getByRole('button', { name: 'SOS' }), 'pressOut');

  mockReduced.on = true;
  await renderRouter('./src/app', { initialUrl: '/' });
  await fireEvent(await screen.findByRole('button', { name: 'SOS' }), 'pressIn');
  const style = JSON.stringify(face().props.style);
  expect(style).not.toContain('scale');
  expect(style).toContain('"opacity":0.8');
  mockReduced.on = false;
});
