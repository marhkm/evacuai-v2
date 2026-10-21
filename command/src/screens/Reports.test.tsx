import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp, type FetchTable } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));

const report = (id: number, matching: number, extra = {}) => ({
  id, hazard_type: 'smoke', building_id: 'A1', level: 4, room_id: null, place: `Annex 1 · Third · room ${id}`, description: `Smoke ${id}`,
  status: 'pending', alert_id: null, reporter: 'Sam Student', matching, photo_url: null, created_at: '2026-10-18T02:50:00+08:00', ...extra,
});
const meta = (page: number, last: number) => ({ current_page: page, last_page: last, per_page: 50, total: 51 });

function setup(extra: FetchTable = {}) {
  return mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/officer/reports': [200, { reports: [report(3, 3, { photo_url: '/api/officer/reports/3/photo' }), report(4, 2)], meta: meta(1, 2) }],
    'GET /api/officer/reports?page=2': [200, { reports: [report(5, 1)], meta: meta(2, 2) }],
    ...extra,
  });
}
const row = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement;
afterEach(() => vi.unstubAllGlobals());

test('the matching badge turns red at three or more reports', async () => {
  setup();
  renderApp('/reports');
  expect(within(await row('Smoke 3')).getByLabelText('3 matching reports').className).toContain('hot');
  expect(within(await row('Smoke 4')).getByLabelText('2 matching reports').className).not.toContain('hot');
});

test('verify posts', async () => {
  const fetch = setup({ 'POST /api/officer/reports/4/verify': [200, { report: report(4, 2, { status: 'verified' }) }] });
  renderApp('/reports');
  fireEvent.click(within(await row('Smoke 4')).getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => u === '/api/officer/reports/4/verify' && i?.method === 'POST')).toBe(true));
});

test('the photo opens in a lightbox', async () => {
  setup();
  renderApp('/reports');
  fireEvent.click(within(await row('Smoke 3')).getByRole('button', { name: 'View photo' }));
  const box = screen.getByRole('dialog', { name: 'Report photo' });
  expect(within(box).getByRole('img').getAttribute('src')).toBe('/api/officer/reports/3/photo');
  fireEvent.click(within(box).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('summarize shows the AI summary', async () => {
  setup({ 'POST /api/officer/reports/3/summary': [200, { text: 'Three students report smoke near A-31.', provider: 'gemini' }] });
  renderApp('/reports');
  fireEvent.click(within(await row('Smoke 3')).getByRole('button', { name: 'Summarize' }));
  expect(await screen.findByText('Three students report smoke near A-31.')).toBeTruthy();
});

test('load more asks for the next page', async () => {
  setup();
  renderApp('/reports');
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByText('Smoke 5')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});
