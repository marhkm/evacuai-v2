import { ApiError, api, setServerUrl } from '@/lib/api';

const respond = (status: number, body: unknown) =>
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

beforeEach(() => {
  global.fetch = jest.fn();
  setServerUrl('http://server.test/');
});

test('sends JSON with the bearer token to the configured server', async () => {
  respond(200, { user: { id: 1 } });
  await expect(api('/api/me', { token: 'abc' })).resolves.toEqual({ user: { id: 1 } });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('http://server.test/api/me');
  expect(init.headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer abc' });
});

test('maps 422 validation errors to field messages', async () => {
  respond(422, { message: 'Invalid', errors: { email: ['These credentials do not match our records.'] } });
  const err = await api('/api/auth/login', { method: 'POST', body: {} }).catch(e => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(422);
  expect(err.fieldError('email')).toBe('These credentials do not match our records.');
});

test('keeps the server reason for 403 responses', async () => {
  respond(403, { reason: 'email_not_verified', message: 'Verify your email first.' });
  const err = await api('/api/auth/login', { method: 'POST', body: {} }).catch(e => e);
  expect(err.reason).toBe('email_not_verified');
  expect(err.message).toBe('Verify your email first.');
});

test('turns network failures into a readable error', async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
  const err = await api('/api/health').catch(e => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(0);
  expect(err.message).toMatch(/cannot reach the server/i);
});

test('handles 204 No Content', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
  await expect(api('/api/auth/logout', { method: 'POST', token: 't' })).resolves.toBeNull();
});
