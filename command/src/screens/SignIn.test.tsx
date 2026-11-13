import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { mockFetch, renderApp } from '../test-utils';

vi.mock('../socket', () => ({ connectSocket: () => new Promise(() => {}) }));
afterEach(() => vi.unstubAllGlobals());

test('shows and hides the password', async () => {
  mockFetch({});
  renderApp('/sign-in');
  const input = await screen.findByLabelText('Password');
  expect(input.getAttribute('type')).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input.getAttribute('type')).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input.getAttribute('type')).toBe('password');
});
