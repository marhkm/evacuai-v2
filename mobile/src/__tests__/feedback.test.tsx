import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));
jest.mock('@/lib/realtime', () => ({ subscribeAlerts: async () => () => undefined }));
jest.mock('@/lib/push', () => ({ registerForPush: async () => undefined }));

const user = { id: 1, name: 'Juan', email: 'j@x.test', role: 'student', department: null, phone: null, email_verified: true, consented: true, has_password: true };
let posted: unknown = null;

beforeEach(() => {
  mockMem.set('token', 't');
  mockMem.set('user', JSON.stringify(user));
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (path === '/api/feedback') posted = JSON.parse(init!.body as string);
    const body = path === '/api/me' ? { user } : path === '/api/alerts' ? { alerts: [] } : { message: 'Thank you for your feedback.' };
    return { ok: true, status: 200, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('requires a rating, then sends rating and comments', async () => {
  await renderRouter('./src/app', { initialUrl: '/feedback' });
  await fireEvent.press(await screen.findByRole('button', { name: 'Send feedback' }));
  expect(screen.getByText('Choose a rating from 1 to 5 stars.')).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: '4 stars' }));
  await fireEvent.changeText(screen.getByLabelText('Comments (optional)'), 'Clear routes');
  await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
  expect(await screen.findByText('Thank you for your feedback.')).toBeTruthy();
  expect(posted).toEqual({ rating: 4, comments: 'Clear routes' });
});
