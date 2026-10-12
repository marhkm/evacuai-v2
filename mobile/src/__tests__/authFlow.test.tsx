import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));

type Route = (body: any) => { status: number; body?: unknown };
let routes: Record<string, Route> = {};
const calls: { url: string; body: any }[] = [];

beforeEach(() => {
  mockMem.clear();
  calls.length = 0;
  routes = {};
  global.fetch = jest.fn(async (url: string, init: any = {}) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: `${init.method ?? 'GET'} ${path}`, body });
    const handler = routes[`${init.method ?? 'GET'} ${path}`];
    const res = handler ? handler(body) : { status: 404, body: { message: 'not found' } };
    return { ok: res.status < 300, status: res.status, json: async () => res.body } as Response;
  }) as jest.Mock;
});

const user = (over: object = {}) => ({
  id: 1, name: 'Juan', email: 'juan@example.test', role: 'student', department: null, phone: null,
  email_verified: true, consented: true, has_password: true, ...over,
});

const app = () => renderRouter('./src/app', { initialUrl: '/' });

test('signed-out users land on the sign-in screen', async () => {
  await app();
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeTruthy();
});

test('signing in shows the home screen and stores the token', async () => {
  routes['POST /api/auth/login'] = () => ({ status: 200, body: { token: 'tok-1', user: user() } });
  await app();
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'juan@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-1');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Campus map' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Evacuation route' })).toBeTruthy();
  expect(mockMem.get('token')).toBe('tok-1');
});

test('wrong credentials show the server message', async () => {
  routes['POST /api/auth/login'] = () => ({ status: 422, body: { message: 'x', errors: { email: ['These credentials do not match our records.'] } } });
  await app();
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'juan@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'nope');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('These credentials do not match our records.')).toBeTruthy();
});

test('an unverified account is sent to the code screen, and the code signs in', async () => {
  routes['POST /api/auth/login'] = () => ({ status: 403, body: { reason: 'email_not_verified', message: 'Verify your email first.' } });
  routes['POST /api/auth/resend-code'] = () => ({ status: 200, body: { message: 'sent' } });
  routes['POST /api/auth/verify-email'] = b => (b.code === '123456'
    ? { status: 200, body: { token: 'tok-2', user: user() } }
    : { status: 422, body: { errors: { code: ['The code is invalid or has expired.'] } } });
  await app();
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'juan@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-1');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
  expect(calls.find(c => c.url === 'POST /api/auth/resend-code')?.body).toEqual({ email: 'juan@example.test' });
});

test('registration goes to the code screen', async () => {
  routes['POST /api/auth/register'] = () => ({ status: 201, body: { message: 'ok' } });
  await renderRouter('./src/app', { initialUrl: '/register' });
  await fireEvent.changeText(await screen.findByLabelText('Full name'), 'Juan');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'juan@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-1');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'correct-horse-1');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByLabelText('6-digit code')).toBeTruthy();
  expect(calls.find(c => c.url === 'POST /api/auth/register')?.body).not.toHaveProperty('role');
});

test('users who have not consented see the privacy notice first', async () => {
  mockMem.set('token', 'tok-3');
  mockMem.set('user', JSON.stringify(user({ consented: false })));
  routes['GET /api/me'] = () => ({ status: 200, body: { user: user({ consented: false }) } });
  routes['POST /api/me/consent'] = () => ({ status: 200, body: { user: user() } });
  await app();
  await fireEvent.press(await screen.findByRole('button', { name: 'I agree' }));
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
});

test('stays signed in offline using the cached profile', async () => {
  mockMem.set('token', 'tok-4');
  mockMem.set('user', JSON.stringify(user()));
  (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  await app();
  expect(await screen.findByText('Welcome, Juan')).toBeTruthy();
});

test('a revoked token signs the user out', async () => {
  mockMem.set('token', 'old');
  mockMem.set('user', JSON.stringify(user()));
  routes['GET /api/me'] = () => ({ status: 401, body: { message: 'Unauthenticated.' } });
  await app();
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeTruthy();
  await waitFor(() => expect(mockMem.has('token')).toBe(false));
});

test('forgot password → code + new password → back to sign in', async () => {
  routes['POST /api/auth/forgot-password'] = () => ({ status: 200, body: { message: 'sent' } });
  routes['POST /api/auth/reset-password'] = () => ({ status: 200, body: { message: 'Password updated. Sign in with your new password.' } });
  await renderRouter('./src/app', { initialUrl: '/forgot' });
  await fireEvent.changeText(await screen.findByLabelText('Email'), 'juan@example.test');
  await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await fireEvent.changeText(await screen.findByLabelText('6-digit code'), '654321');
  await fireEvent.changeText(screen.getByLabelText('New password'), 'new-horse-22');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'new-horse-22');
  await fireEvent.press(screen.getByRole('button', { name: 'Reset password' }));
  expect(await screen.findByText('Password updated. Sign in with your new password.')).toBeTruthy();
});

describe('profile', () => {
  beforeEach(() => {
    mockMem.set('token', 'tok-5');
    mockMem.set('user', JSON.stringify(user()));
    routes['GET /api/me'] = () => ({ status: 200, body: { user: user() } });
  });

  test('pre-fills the form with the signed-in profile', async () => {
    await renderRouter('./src/app', { initialUrl: '/profile' });
    expect((await screen.findByLabelText('Full name')).props.value).toBe('Juan');
  });

  test('saves the profile and shows server validation errors', async () => {
    routes['PATCH /api/me'] = b => (b.phone === '123'
      ? { status: 422, body: { errors: { phone: ['Enter a valid Philippine mobile number (09XXXXXXXXX).'] } } }
      : { status: 200, body: { user: user({ phone: b.phone }) } });
    await renderRouter('./src/app', { initialUrl: '/profile' });
    await fireEvent.changeText(await screen.findByLabelText('Mobile number'), '123');
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Enter a valid Philippine mobile number (09XXXXXXXXX).')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '09171234567');
    await fireEvent.press(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeTruthy();
    expect(JSON.parse(mockMem.get('user')!).phone).toBe('09171234567');
  });

  test('deleting the account clears the session', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((...args: any[]) => args[2][1].onPress());
    routes['DELETE /api/me'] = b => (b.password === 'correct-horse-1' ? { status: 204 } : { status: 422, body: { errors: { password: ['The password is incorrect.'] } } });
    routes['POST /api/auth/logout'] = () => ({ status: 204 });
    await renderRouter('./src/app', { initialUrl: '/profile' });
    await fireEvent.changeText(await screen.findByLabelText('Password to confirm deletion'), 'correct-horse-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeTruthy();
    expect(mockMem.has('token')).toBe(false);
  });
});
