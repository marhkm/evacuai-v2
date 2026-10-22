import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

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
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined), impactAsync: jest.fn(async () => undefined), notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, NotificationFeedbackType: { Success: 'success' },
}));
// Native @expo/ui views as plain React Native stand-ins.
jest.mock('@expo/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native');
  return {
    Host: ({ children }: { children: unknown }) => <View>{children}</View>,
    Column: ({ children }: { children: unknown }) => <View>{children}</View>,
    Text: ({ children }: { children: string }) => <Text>{children}</Text>,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>,
    Slider: ({ onValueChange }: { onValueChange: (v: number) => void }) => <Pressable accessibilityRole="adjustable" accessibilityLabel="Explode slider" onPress={() => onValueChange(2)} />,
    BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: unknown }) => (isPresented ? <View accessibilityLabel="sheet">{children}</View> : null),
  };
});
const mockProps: { last?: Record<string, unknown> } = {};
jest.mock('@/components/Campus3DLazy', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return { Campus3DView: (p: Record<string, unknown>) => { mockProps.last = p; return <Text>3D campus view</Text>; } };
});

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  mockProps.last = undefined;
  mockMemory = 6 * 1024 ** 3;
  global.fetch = jest.fn(async (url: string) => {
    const body = url.endsWith('/api/me') ? { user } : url.endsWith('/api/alerts') ? { alerts: [] } : demo;
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
  await fireEvent.press(screen.getByLabelText('Explode slider'));
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
