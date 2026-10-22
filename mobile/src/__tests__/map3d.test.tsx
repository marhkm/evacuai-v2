import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { quality3d } from '@/lib/can3d';

const demo = require('../../../campus-data/demo.snapshot.json');

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
}));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));
let mockMemory = 6 * 1024 ** 3;
jest.mock('expo-device', () => ({ get totalMemory() { return mockMemory; } }));
const mockProps: { last?: Record<string, unknown> } = {};
jest.mock('@/components/Campus3DLazy', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { Campus3DView: (p: Record<string, unknown>) => { mockProps.last = p; return <Text>3D campus view</Text>; } };
});

let mockAlerts: object[] = [];
const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  mockProps.last = undefined;
  mockMemory = 6 * 1024 ** 3;
  mockAlerts = [];
  global.fetch = jest.fn(async (url: string) => {
    const body = url.endsWith('/api/me') ? { user } : url.endsWith('/api/alerts') ? { alerts: mockAlerts } : demo;
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '"e"' } } as unknown as Response;
  }) as jest.Mock;
});

async function open3d() {
  await renderRouter('./src/app', { initialUrl: '/map' });
  await fireEvent.press(await screen.findByRole('button', { name: '3D' }));
  await screen.findByText('3D campus view');
}

test('3D opens on the whole building, with native controls that drive the view', async () => {
  await open3d();
  expect(mockProps.last).toMatchObject({ building: 'DEMO', level: null, view: '3d', explode: 0, quality: 'high' });
  // The web view rebuilds the 3D scene only when `version` changes (new campus data), never on a control change.
  const version = mockProps.last!.version;
  expect(typeof version).toBe('number');

  await fireEvent.press(screen.getByRole('button', { name: 'Second' }));
  expect(mockProps.last).toMatchObject({ level: 2 });
  await fireEvent.press(screen.getByRole('button', { name: 'Top' }));
  expect(mockProps.last).toMatchObject({ view: 'top' });
  await fireEvent.press(screen.getByLabelText('Explode floors'));
  expect(mockProps.last).toMatchObject({ explode: 2 });
  await fireEvent.press(screen.getByRole('button', { name: 'Whole building' }));
  expect(mockProps.last).toMatchObject({ level: null });
  expect(mockProps.last!.version).toBe(version);
});

test('tapping a room in 3D opens its details in a bottom sheet', async () => {
  await open3d();
  const onPick = mockProps.last!.onPick as (info: object) => Promise<void>;
  await act(async () => onPick({ roomId: 'DEMO/2/R201', name: 'R201', floorName: 'Second', count: 3, hazard: true, sos: false }));
  expect(await screen.findByText('3 people inside')).toBeTruthy();
  expect(screen.getByText('Hazard reported')).toBeTruthy();
  expect(screen.getByText('R201 · Second')).toBeTruthy();
});

test('weaker phones get the lighter 3D quality', () => {
  mockMemory = 2 * 1024 ** 3;
  expect(quality3d()).toBe('low');
  mockMemory = 6 * 1024 ** 3;
  expect(quality3d()).toBe('high');
});

test('Reset recentres the camera even after the user has only rotated it', async () => {
  await open3d();
  const before = mockProps.last!.resetKey as number;
  await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
  expect(mockProps.last!.resetKey).toBe(before + 1);
});

test('full screen opens on the floor and view chosen on the map', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const push = jest.spyOn(require('expo-router').router, 'push').mockImplementation(() => undefined);
  await open3d();
  await fireEvent.press(screen.getByRole('button', { name: 'Second' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Top' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Full screen' }));
  expect(push).toHaveBeenCalledWith({ pathname: '/map-3d', params: { building: 'DEMO', level: 2, view: 'top', explode: 0 } });
  push.mockRestore();
});

test('the full-screen 3D view starts from those settings', async () => {
  await renderRouter('./src/app', { initialUrl: '/map-3d?building=DEMO&level=2&view=top&explode=1.5' });
  await screen.findByText('3D campus view');
  expect(mockProps.last).toMatchObject({ building: 'DEMO', level: 2, view: 'top', explode: 1.5 });
});

test('during an alert the 3D view shows the way out from where the student is', async () => {
  mockAlerts = [{ id: 7, hazard_type: 'fire', severity_level: 'high', message: 'Fire.', status: 'active', source: 'admin', verified: true, is_drill: false, building_id: null, issued_at: '2026-10-21T08:00:00+08:00', resolved_at: null, translations: {} }];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/lib/whereabouts').updateWhereabouts({ source: 'manual', roomId: 'DEMO/2/R201', building: 'DEMO', floor: 2 }, null, false);
  await open3d();
  const route = mockProps.last!.route as { nodeIds: string[] } | null;
  expect(route?.nodeIds.length).toBeGreaterThan(1);
  expect(screen.getByRole('button', { name: 'Follow route' })).toBeTruthy();
});

test('the room sheet is read out when it opens', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  await open3d();
  const onPick = mockProps.last!.onPick as (info: object) => Promise<void>;
  await act(async () => onPick({ roomId: 'DEMO/2/R201', name: 'R201', floorName: 'Second', count: 3, hazard: true, sos: false }));
  expect(announce).toHaveBeenCalledWith('R201 · Second. 3 people inside. Hazard reported');
});
