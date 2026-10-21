import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp, type FetchTable } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));

const item = { id: 12, person: 'Sam Student', place: 'Annex 1 · Ground · Study Hall', status: 'pending', message: 'Trapped, door jammed', created_at: '2026-10-18T02:50:00+08:00' };
const detail = {
  ...item, responder: null,
  messages: [{ id: 1, body: 'Please hurry', mine: false, sender: 'Sam Student', created_at: '2026-10-18T02:51:00+08:00' }],
};

function setup(extra: FetchTable = {}) {
  return mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 1 }, active_alert: null }],
    'GET /api/officer/sos?open=1': [200, { sos: [item], meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 } }],
    'GET /api/officer/sos/12': [200, { sos: detail }],
    ...extra,
  });
}
const posted = (fetch: ReturnType<typeof setup>, url: string) => fetch.mock.calls.find(([u, i]) => u === url && i?.method === 'POST');
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('the list shows open SOS by default', async () => {
  const fetch = setup();
  renderApp('/sos');
  expect(await screen.findByRole('link', { name: /Sam Student/ })).toBeTruthy();
  expect(fetch.mock.calls.some(([u]) => u === '/api/officer/sos?open=1')).toBe(true);
});

test('opening an SOS shows its conversation', async () => {
  setup();
  renderApp('/sos/12');
  expect(await screen.findByText('Please hurry')).toBeTruthy();
  expect(screen.getAllByText('Trapped, door jammed').length).toBeGreaterThan(0);
});

test('sending a message posts it and clears the box', async () => {
  const fetch = setup({ 'POST /api/officer/sos/12/messages': [201, { sos: detail }] });
  renderApp('/sos/12');
  const box = (await screen.findByLabelText('Message')) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: 'Help is on the way' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(posted(fetch, '/api/officer/sos/12/messages')).toBeTruthy());
  expect(JSON.parse(String(posted(fetch, '/api/officer/sos/12/messages')![1]!.body))).toEqual({ body: 'Help is on the way' });
  await waitFor(() => expect(box.value).toBe(''));
});

test('acknowledge and resolve post', async () => {
  const fetch = setup({
    'POST /api/officer/sos/12/acknowledge': [200, { sos: { ...detail, status: 'acknowledged' } }],
    'POST /api/officer/sos/12/resolve': [200, { sos: { ...detail, status: 'resolved' } }],
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderApp('/sos/12');
  fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
  await waitFor(() => expect(posted(fetch, '/api/officer/sos/12/acknowledge')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(posted(fetch, '/api/officer/sos/12/resolve')).toBeTruthy());
});
