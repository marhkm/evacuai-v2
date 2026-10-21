import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));
afterEach(() => vi.unstubAllGlobals());

test('the time slider moves the replay clock', async () => {
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/campus-snapshot': [200, snapshot],
    'GET /api/officer/safety': [200, { alert: null, alerts: [{ id: 6, label: 'Drill · Fire · Oct 18', active: false }], counts: null, occupancy: [], people: [] }],
    'GET /api/officer/replay?alert=6': [200, { alert: { id: 6, label: 'Drill · Fire' }, duration: 300, events: [{ t: 10, p: 1, room: 'A1/4/A_31' }], checkins: [{ t: 200, p: 1, node: 'A1/1/AP_Outside' }] }],
  });
  renderApp('/replay');
  const slider = await screen.findByLabelText('Time since the alert');
  expect(screen.getByText('0:00 / 5:00')).toBeTruthy();
  fireEvent.change(slider, { target: { value: '125' } });
  expect(screen.getByText('2:05 / 5:00')).toBeTruthy();
});
