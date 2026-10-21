import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));
afterEach(() => vi.unstubAllGlobals());

test('clicking a path on the plan opens its panel, and Blocked saves it', async () => {
  const id = 'A1/1/C1->A1/1/C2';
  const path = { id, type: 'corridor', building_id: 'A1', level: 1, from: 'C1', to: 'C2', place: 'Annex 1 · Ground', status: 'open', updated_by: null, updated_at: null };
  const fetch = mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/campus-snapshot': [200, snapshot],
    'GET /api/officer/live': [200, { alert: null, edges: {}, hazardRoomIds: [], roomCounts: {}, pins: [] }],
    'GET /api/officer/paths?building=BE&level=1': [200, { paths: [] }],
    'GET /api/officer/paths?building=A1&level=1': [200, { paths: [path] }],
    [`PATCH /api/officer/paths/${encodeURIComponent(id)}`]: [200, { path: { ...path, status: 'blocked' } }],
  });
  renderApp('/paths');
  fireEvent.change(await screen.findByLabelText('Building'), { target: { value: 'A1' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Open path, C1 to C2' }));
  const panel = screen.getByRole('region', { name: 'Selected path' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Blocked' }));
  await waitFor(() => {
    const call = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH');
    expect(call?.[0]).toBe('/api/officer/paths/A1%2F1%2FC1-%3EA1%2F1%2FC2');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: 'blocked' });
  });
});
