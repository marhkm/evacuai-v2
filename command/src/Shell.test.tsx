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

test('shows the officer, the active alert and the open SOS count', async () => {
  renderApp('/');
  expect(await screen.findByText('Olive Officer')).toBeTruthy();
  expect(await screen.findByText(/DRILL · fire · high/i)).toBeTruthy();
  expect(screen.getByRole('link', { name: /SOS 2 open/ })).toBeTruthy();
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
