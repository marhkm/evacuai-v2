import { ApiError, api, getServerUrl, normalizeServerUrl, setServerUrl, testServer } from '@/lib/api';

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

describe('the server address a student types', () => {
  test.each([
    ['192.168.1.5', 'http://192.168.1.5:8000'],
    ['192.168.1.5:8000/', 'http://192.168.1.5:8000'],
    [' localhost ', 'http://localhost:8000'],
    ['http://10.0.0.2', 'http://10.0.0.2'], // a typed scheme means they chose the port too
    ['https://evac.example.com', 'https://evac.example.com'],
    ['evac.example.com', 'http://evac.example.com'], // a domain gets no :8000
    ['http://192.168.1.5:8000/command', 'http://192.168.1.5:8000'],
  ])('%s becomes %s', (typed, url) => {
    expect(normalizeServerUrl(typed)).toEqual({ url });
  });

  test('the web app and live-updates ports are refused with a hint', () => {
    expect(normalizeServerUrl('192.168.1.5:8081')).toEqual({ error: "That's the web app's port. Use 8000." });
    expect(normalizeServerUrl('http://192.168.1.5:8080')).toEqual({ error: "That's the live-updates port. Use 8000." });
  });

  test('a refused address keeps the old server', () => {
    setServerUrl('192.168.1.5:8081');
    expect(getServerUrl()).toBe('http://server.test');
  });
});

describe('Test connection', () => {
  test('an EvacuAI server answers its client config', async () => {
    respond(200, { reverb: { key: 'k', port: 8080, scheme: 'http' } });
    await expect(testServer('http://192.168.1.5:8000')).resolves.toBe('ok');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://192.168.1.5:8000/api/client-config');
  });

  test('no answer, or the wrong kind of server', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(testServer('http://192.168.1.5:8000')).resolves.toBe('unreachable');
    respond(200, { hello: 'world' });
    await expect(testServer('http://192.168.1.5:8000')).resolves.toBe('not-evacuai');
  });
});

test('when the server cannot be reached, the error names the address and the firewall', async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
  const err = await api('/api/me').catch(e => e);
  expect(err.message).toContain('http://server.test');
  expect(err.message).toContain('Windows Firewall');
});
