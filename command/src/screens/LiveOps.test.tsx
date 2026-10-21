import { fireEvent, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));

beforeEach(() => {
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 1 }, active_alert: null }],
    'GET /api/campus-snapshot': [200, snapshot],
    'GET /api/officer/live': [200, {
      alert: { id: 6, label: 'Drill · Fire', active: true },
      edges: { 'A1/1/C1->A1/1/C2': 'blocked' },
      hazardRoomIds: [],
      roomCounts: { 'A1/1/STUDY_HALL': 3 },
      pins: [],
    }],
    'GET /api/officer/safety': [200, { counts: { total: 16, safe: 5, needs_help: 2, unknown: 9, sos: 1 } }],
    'GET /api/officer/sos?open=1': [200, { sos: [{ id: 12, person: 'Sam Student', place: 'Annex 1 · Ground · Study Hall', status: 'open', message: null, created_at: '2026-10-18T02:50:00+08:00' }] }],
    'GET /api/officer/reports': [200, { reports: [{ id: 3, hazard_type: 'smoke', place: 'Annex 1 · Third', matching: 3, status: 'pending' }] }],
  });
});
afterEach(() => vi.unstubAllGlobals());

const pickFloor = async (building: string, floor: string) => {
  fireEvent.change(await screen.findByLabelText('Building'), { target: { value: building } });
  fireEvent.change(screen.getByLabelText('Floor'), { target: { value: floor } });
};

test('the counters show safe, needs help and unknown for the active alert', async () => {
  renderApp('/');
  const counters = await screen.findByRole('region', { name: 'Safety counters' });
  expect(await within(counters).findByText('5')).toBeTruthy();
  expect(within(counters).getByText('2')).toBeTruthy();
  expect(within(counters).getByText('9')).toBeTruthy();
});

test('the open SOS list shows the person and place, and opens the SOS', async () => {
  const { router } = renderApp('/');
  const item = await screen.findByRole('link', { name: /Sam Student/ });
  expect(item.textContent).toContain('Annex 1 · Ground · Study Hall');
  fireEvent.click(item);
  expect(router.state.location.pathname).toBe('/sos/12');
});

test('the plan marks blocked paths and people counts', async () => {
  renderApp('/');
  await pickFloor('A1', '1');
  expect(await screen.findByLabelText('Blocked path')).toBeTruthy();
  expect(screen.getByText('3 people')).toBeTruthy();
});

test('the building and floor picker changes the plan', async () => {
  renderApp('/');
  await pickFloor('A1', '7');
  expect(await screen.findByText('A-61')).toBeTruthy();
  await pickFloor('A1', '1');
  expect(screen.queryByText('A-61')).toBeNull();
});
