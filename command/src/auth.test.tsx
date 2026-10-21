import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp } from './test-utils';

vi.mock('./socket', () => ({ connectSocket: () => new Promise(() => {}) })); // never connects

const officer = { id: 1, name: 'Olive Officer', role: 'safety_officer' };
const overview = { stats: { open_sos: 0 }, active_alert: null };

afterEach(() => vi.unstubAllGlobals());

async function signIn(email: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

test('a student is refused with the server message', async () => {
  const message = "Those details don't match an officer account.";
  mockFetch({
    'GET /sanctum/csrf-cookie': [204],
    'POST /command/session': [422, { message, errors: { email: [message] } }],
  });
  renderApp('/sign-in');
  await signIn('student@example.test');
  expect((await screen.findByRole('alert')).textContent).toContain(message);
});

test('a successful sign-in opens Live Ops', async () => {
  let signedIn = false;
  mockFetch({
    'GET /sanctum/csrf-cookie': [204],
    'POST /command/session': () => { signedIn = true; return [204]; },
    'GET /api/officer/me': () => (signedIn ? [200, officer] : [401, { message: 'Unauthenticated.' }]),
    'GET /api/officer/overview': [200, overview],
  });
  const { router } = renderApp('/sign-in');
  await signIn('officer@example.test');
  expect(await screen.findByRole('heading', { name: 'Live Ops' })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/');
});

test('an expired session on any request returns to the sign-in page', async () => {
  mockFetch({
    'GET /api/officer/me': [200, officer],
    'GET /api/officer/overview': [401, { message: 'Unauthenticated.' }],
  });
  const { router } = renderApp('/');
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/sign-in');
});

test('an officer who lost the role is told so and signed out', async () => {
  const fetch = mockFetch({
    'GET /api/officer/me': [404, { message: 'Not Found' }],
    'DELETE /command/session': [204],
  });
  renderApp('/');
  expect(await screen.findByText('Your account no longer has officer access.')).toBeTruthy();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/command/session', expect.objectContaining({ method: 'DELETE' })));
});

test('a stale session on an action (419 CSRF mismatch) returns to the sign-in page', async () => {
  mockFetch({
    'GET /api/officer/me': [200, officer],
    'GET /api/officer/overview': [200, overview],
    'GET /api/campus-snapshot': [200, { buildings: [], rooms: [], nodes: [], edges: [], hazardRoomIds: [] }],
    'GET /api/officer/alerts': [200, { alerts: [] }],
    'POST /api/officer/alerts': [419, { message: 'CSRF token mismatch.' }],
  });
  const { router } = renderApp('/alerts');
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Fire' } });
  fireEvent.click(screen.getByRole('button', { name: 'Broadcast' }));
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/sign-in');
});

test('an officer demoted mid-use is told so as soon as any officer request is refused', async () => {
  let meCalls = 0;
  const fetch = mockFetch({
    'GET /api/officer/me': () => (++meCalls === 1 ? [200, officer] : [404, { message: 'Not Found' }]),
    'GET /api/officer/overview': [404, { message: 'Not Found' }],
    'DELETE /command/session': [204],
  });
  renderApp('/feedback');
  expect(await screen.findByText('Your account no longer has officer access.')).toBeTruthy();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/command/session', expect.objectContaining({ method: 'DELETE' })));
});
