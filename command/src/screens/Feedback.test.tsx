import { screen } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));
afterEach(() => vi.unstubAllGlobals());

test('shows the average rating and the comments', async () => {
  mockFetch({
    'GET /api/officer/me': [200, { id: 1, name: 'Olive Officer', role: 'safety_officer' }],
    'GET /api/officer/overview': [200, { stats: { open_sos: 0 }, active_alert: null }],
    'GET /api/officer/feedback': [200, { average: 4.2, count: 5, items: [{ rating: 5, comments: 'Clear arrows', created_at: '2026-10-18T03:00:00+08:00', name: 'Ana' }] }],
  });
  renderApp('/feedback');
  expect(await screen.findByText('4.2')).toBeTruthy();
  expect(screen.getByText('Clear arrows')).toBeTruthy();
});
