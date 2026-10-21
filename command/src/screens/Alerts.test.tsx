import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { mockFetch, renderApp, type FetchTable } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));

const alert = (id: number, status: string, extra = {}) => ({
  id, hazard_type: 'fire', severity_level: 'high', message: `Alert ${id}`, translations: null, status, source: 'officer',
  verified: true, is_drill: false, building_id: 'A1', issued_at: '2026-10-18T02:49:00+08:00', resolved_at: null, ...extra,
});

let listCalls = 0;
function setup(extra: FetchTable = {}) {
  listCalls = 0;
  return mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/campus-snapshot': [200, snapshot],
    'GET /api/officer/alerts': () => { listCalls++; return [200, { alerts: [alert(5, 'draft', { source: 'phivolcs', message: 'Draft from PHIVOLCS' }), alert(6, 'active')] }]; },
    ...extra,
  });
}
const body = (fetch: ReturnType<typeof setup>, key: string) => {
  const call = fetch.mock.calls.find(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key);
  return call && JSON.parse(String(call[1]!.body));
};
const row = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('broadcast asks the officer to confirm when too few reports match, then sends with confirm', async () => {
  let posts = 0;
  const fetch = setup({
    'POST /api/officer/alerts': () => (++posts === 1 ? [200, { needs_confirmation: true, reporters: 1 }] : [201, { alert: alert(7, 'active') }]),
  });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/alerts');
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Fire on the 3rd floor. Evacuate now.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Broadcast' }));
  await waitFor(() => expect(posts).toBe(2));
  expect(confirm.mock.calls[0][0]).toContain('1 matching report');
  const last = JSON.parse(String(fetch.mock.calls.filter(([u, i]) => u === '/api/officer/alerts' && i?.method === 'POST')[1][1]!.body));
  expect(last).toMatchObject({ hazard_type: 'fire', message: 'Fire on the 3rd floor. Evacuate now.', confirm: true });
});

test("publishing a draft sends the officer's edited message", async () => {
  const fetch = setup({ 'POST /api/officer/alerts/5/publish': [200, { alert: alert(5, 'active') }] });
  renderApp('/alerts');
  fireEvent.click(within(await row('Draft from PHIVOLCS')).getByRole('button', { name: 'Publish' }));
  fireEvent.change(screen.getByLabelText('Message to publish'), { target: { value: 'Edited quake advisory' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
  await waitFor(() => expect(body(fetch, 'POST /api/officer/alerts/5/publish')).toEqual({ message: 'Edited quake advisory' }));
});

test('resolve asks first, then posts', async () => {
  const fetch = setup({ 'POST /api/officer/alerts/6/resolve': [200, { alert: alert(6, 'resolved') }] });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderApp('/alerts');
  const r = await row('Alert 6');
  fireEvent.click(within(r).getByRole('button', { name: 'Resolve' }));
  expect(fetch.mock.calls.some(([u]) => u === '/api/officer/alerts/6/resolve')).toBe(false);
  fireEvent.click(within(r).getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === '/api/officer/alerts/6/resolve')).toBe(true));
  expect(confirm).toHaveBeenCalledTimes(2);
});

test('another officer got there first: the server message shows and the list refreshes', async () => {
  setup({ 'POST /api/officer/alerts/6/retract': [422, { message: 'Only active alerts can be retracted.' }] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/alerts');
  fireEvent.click(within(await row('Alert 6')).getByRole('button', { name: 'Retract' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Only active alerts can be retracted.');
  await waitFor(() => expect(listCalls).toBeGreaterThan(1));
});

test('translate fills the Cebuano and Filipino messages', async () => {
  setup({ 'POST /api/officer/alerts/translate': [200, { ceb: 'Sunog! Gawas dayon.', fil: 'Sunog! Lumabas agad.', provider: 'gemini' }] });
  renderApp('/alerts');
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Fire! Get out now.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Translate with AI' }));
  await waitFor(() => expect((screen.getByLabelText('Cebuano') as HTMLTextAreaElement).value).toBe('Sunog! Gawas dayon.'));
  expect((screen.getByLabelText('Filipino') as HTMLTextAreaElement).value).toBe('Sunog! Lumabas agad.');
});
