import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// The real demo campus, exactly as the API serves it.
const demo = require('../../../campus-data/demo.snapshot.json');

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };

beforeEach(() => {
  mockMem.clear();
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  global.fetch = jest.fn(async (url: string) => {
    const body = url.endsWith('/api/me') ? { user } : demo;
    return { ok: true, status: 200, json: async () => body, headers: { get: () => '"e"' } } as unknown as Response;
  }) as jest.Mock;
});

test('shows the first floor of the first building with readable labels', async () => {
  await renderRouter('./src/app', { initialUrl: '/map' });
  expect(await screen.findByRole('header', { name: 'Campus map' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ground' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Second' })).toBeTruthy();
  expect(screen.getByLabelText('Room R101')).toBeTruthy();
  expect(screen.queryByLabelText('Room R201')).toBeNull();
});

test('switching floors shows that floor', async () => {
  await renderRouter('./src/app', { initialUrl: '/map' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Second' }));
  expect(await screen.findByLabelText('Room R201')).toBeTruthy();
  expect(screen.queryByLabelText('Room R101')).toBeNull();
});

test('marks blocked paths in the legend count', async () => {
  const blocked = JSON.parse(JSON.stringify(demo));
  blocked.edges.find((e: { id: string }) => e.id === 'DEMO/1/C1->DEMO/1/C2').status = 'blocked';
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => ({
    ok: true, status: 200, json: async () => (url.endsWith('/api/me') ? { user } : blocked), headers: { get: () => '"b"' },
  }));
  await renderRouter('./src/app', { initialUrl: '/map' });
  expect(await screen.findByText('1 blocked path on this floor')).toBeTruthy();
});
