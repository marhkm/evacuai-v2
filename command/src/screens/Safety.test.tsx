import { fireEvent, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));
afterEach(() => vi.unstubAllGlobals());

const person = (id: number, name: string, status: string) => ({ id, name, role: 'student', status, place: 'Annex 1 · Third', source: 'qr', updated_at: null, phone: null });

beforeEach(() => {
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/officer/safety': [200, {
      alert: { id: 6, hazard_type: 'fire', is_drill: true, status: 'active' },
      alerts: [{ id: 6, label: 'Drill · Fire · Oct 18', active: true }],
      counts: { total: 3, safe: 1, needs_help: 1, unknown: 1, sos: 0 },
      occupancy: [{ name: 'Off-campus assembly area', count: 1 }],
      people: [person(1, 'Ana Safe', 'safe'), person(2, 'Ben Help', 'needs_help'), person(3, 'Cy Unknown', 'unknown')],
    }],
  });
});

test('the Needs help filter shows only those people', async () => {
  renderApp('/safety');
  const table = await screen.findByRole('table');
  expect(within(table).getByText('Ana Safe')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Needs help/ }));
  expect(within(table).getByText('Ben Help')).toBeTruthy();
  expect(within(table).queryByText('Ana Safe')).toBeNull();
  expect(within(table).queryByText('Cy Unknown')).toBeNull();
});

test('the drill report link downloads the CSV for the chosen alert', async () => {
  renderApp('/safety');
  const link = await screen.findByRole('link', { name: /Drill report/ });
  expect(link.getAttribute('href')).toBe('/api/officer/alerts/6/report.csv');
});

test('with no active alert, the latest alert is picked so its report can be downloaded', async () => {
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/officer/safety': [200, { alert: null, alerts: [{ id: 6, label: 'Drill · Fire · Oct 18', active: false }], counts: null, occupancy: [], people: [] }],
  });
  renderApp('/safety');
  expect((await screen.findByRole('link', { name: /Drill report/ })).getAttribute('href')).toBe('/api/officer/alerts/6/report.csv');
});
