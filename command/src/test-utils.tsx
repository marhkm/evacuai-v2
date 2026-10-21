import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';

import { makeQueryClient } from './realtime';
import { routes } from './routes';

type Reply = [status: number, body?: unknown];
export type FetchTable = Record<string, Reply | (() => Reply)>;

/** Stubs fetch with replies keyed by "METHOD /path"; returns the mock so tests can inspect calls. */
export function mockFetch(table: FetchTable) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const entry = table[key];
    if (!entry) throw new Error(`unexpected fetch ${key}`);
    const [status, body] = typeof entry === 'function' ? entry() : entry;
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderApp(path: string, client: QueryClient = makeQueryClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}
