import { act, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { makeQueryClient } from './realtime';
import { mockFetch, renderApp } from './test-utils';

// A fake Reverb connection the tests drive by hand.
const fake = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  let state: (up: boolean) => void = () => {};
  return {
    handlers,
    setState: (up: boolean) => state(up),
    socket: {
      listen: (channel: string, event: string, cb: () => void) => handlers.set(`${channel} ${event}`, cb),
      onState: (cb: (up: boolean) => void) => { state = cb; },
      disconnect: () => {},
    },
  };
});
vi.mock('./socket', () => ({ connectSocket: async () => fake.socket }));

beforeEach(() => {
  fake.handlers.clear();
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 2 }, active_alert: { hazard_type: 'fire', severity_level: 'high', is_drill: true, status: 'active' } }],
  });
});
afterEach(() => vi.unstubAllGlobals());

test('the top bar shows LIVE while the socket is connected and RECONNECTING otherwise', async () => {
  renderApp('/');
  expect(await screen.findByText('RECONNECTING')).toBeTruthy();
  await act(async () => fake.setState(true));
  expect(screen.getByText('LIVE')).toBeTruthy();
  await act(async () => fake.setState(false));
  expect(screen.getByText('RECONNECTING')).toBeTruthy();
});

test('shows the officer and the active alert', async () => {
  renderApp('/');
  expect(await screen.findByText('Olive Officer')).toBeTruthy();
  expect(await screen.findByText(/DRILL · fire · high/i)).toBeTruthy();
});

const overview = (unseen: object, unowned = 0) => [200, { stats: { open_sos: unowned, unowned_sos: unowned }, active_alert: null, unseen }] as [number, unknown];

test('shows unseen counts on SOS, Reports and Feedback', async () => {
  mockFetch({ 'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }], 'GET /api/officer/overview': overview({ sos: 1, reports: 3, feedback: 2 }) });
  renderApp('/');
  expect(await screen.findByRole('link', { name: 'SOS 1 new' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Reports 3 new' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Feedback 2 new' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Alerts' })).toBeTruthy(); // no badge
});

test('keeps the SOS badge while an SOS has no owner', async () => {
  mockFetch({ 'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }], 'GET /api/officer/overview': overview({ sos: 0, reports: 0, feedback: 0 }, 2) });
  renderApp('/');
  expect(await screen.findByRole('link', { name: 'SOS 2 new' })).toBeTruthy();
});

test('marks a tab seen when it is opened, only when it has unseen items', async () => {
  const seen = vi.fn(() => [204] as [number]);
  const fetch = mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': overview({ sos: 0, reports: 3, feedback: 0 }),
    'POST /api/officer/seen/reports': seen,
  });
  renderApp('/reports');
  await screen.findByRole('link', { name: 'Reports 3 new' });
  await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls.some(([url]) => url === '/api/officer/seen/feedback')).toBe(false);
});

test('does not mark a tab seen when it has nothing new', async () => {
  const seen = vi.fn(() => [204] as [number]);
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': overview({ sos: 0, reports: 0, feedback: 0 }),
    'POST /api/officer/seen/reports': seen,
  });
  renderApp('/reports');
  await screen.findByText('Olive Officer');
  await new Promise(r => setTimeout(r, 50));
  expect(seen).not.toHaveBeenCalled();
});

test('a new report or feedback refreshes the badges', async () => {
  const client = makeQueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  renderApp('/', client);
  await screen.findByText('Olive Officer');
  await act(async () => fake.handlers.get('officers .report.submitted')!());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] });
  invalidate.mockClear();
  await act(async () => fake.handlers.get('officers .feedback.submitted')!());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feedback'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] });
});

test('queries poll every 15 seconds only while the socket is down', async () => {
  const client = makeQueryClient();
  const interval = client.getDefaultOptions().queries!.refetchInterval as () => number | false;
  renderApp('/', client);
  await screen.findByText('RECONNECTING');
  expect(interval()).toBe(15000);
  await act(async () => fake.setState(true));
  expect(interval()).toBe(false);
});

test('an SOS event refreshes the SOS lists and the live map', async () => {
  const client = makeQueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  renderApp('/', client);
  await screen.findByText('Olive Officer');
  await act(async () => fake.handlers.get('officers .sos.updated')!());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sos'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['live'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overview'] }); // the rail's open-SOS badge
});

test('an alert event refreshes the alert lists, the live map and the safety board', async () => {
  const client = makeQueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  renderApp('/', client);
  await screen.findByText('Olive Officer');
  await act(async () => fake.handlers.get('alerts .alert.updated')!());
  for (const key of ['alerts', 'overview', 'live', 'safety']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
});
