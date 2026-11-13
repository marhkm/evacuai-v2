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

test('each report shows what the checks found', async () => {
  setup({
    'GET /api/officer/reports': [200, { reports: [report(7, 3, {
      hazard_type: 'fire', ai_verdict: 'match', ai_note: 'Yes, flames in a hallway.', duplicate_of: 12, reporter_place: 'elsewhere',
      reporter_place_label: 'Annex 1 · Ground', reporter_flagged: true, auto_verified: true, status: 'verified',
    }), report(8, 1, { hazard_type: 'flood', ai_verdict: 'no_match', reporter_place: 'match' }), report(9, 1, { ai_verdict: 'unavailable', reporter_place: 'unknown' })], meta: meta(1, 1) }],
  });
  renderApp('/reports');
  const first = await row('Smoke 7');
  for (const text of ['AI: looks like fire', 'Same photo as #12', 'Reporter was elsewhere (Annex 1 · Ground)', 'Often false', 'Auto-verified']) {
    expect(within(first).getByText(text)).toBeTruthy();
  }
  expect(within(first).getByTitle('Yes, flames in a hallway.')).toBeTruthy(); // the AI's reason on hover
  expect(within(await row('Smoke 8')).getByText("AI: doesn't look like flood")).toBeTruthy();
  expect(within(await row('Smoke 8')).getByText('Location matches')).toBeTruthy();
  expect(within(await row('Smoke 9')).getByText('AI: not available')).toBeTruthy();
  expect(within(await row('Smoke 9')).getByText('Location unknown')).toBeTruthy();
});

test('Reject as false asks first, and Dismiss does not count against the student', async () => {
  const fetch = setup({
    'POST /api/officer/reports/3/reject-false': [200, { report: report(3, 3, { status: 'dismissed' }) }],
    'POST /api/officer/reports/4/dismiss': [200, { report: report(4, 2, { status: 'dismissed' }) }],
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderApp('/reports');
  const first = await row('Smoke 3');
  fireEvent.click(within(first).getByRole('button', { name: 'Reject as false' }));
  expect(confirm).toHaveBeenCalledWith('Count this as a false report by Sam Student?');
  expect(fetch.mock.calls.some(([u]) => u === '/api/officer/reports/3/reject-false')).toBe(false); // said no
  fireEvent.click(within(first).getByRole('button', { name: 'Reject as false' }));
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => u === '/api/officer/reports/3/reject-false' && i?.method === 'POST')).toBe(true));

  fireEvent.click(within(await row('Smoke 4')).getByRole('button', { name: 'Dismiss' }));
  await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => u === '/api/officer/reports/4/dismiss' && i?.method === 'POST')).toBe(true));
  confirm.mockRestore();
});
