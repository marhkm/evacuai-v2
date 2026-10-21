import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError } from './api';

/**
 * Runs an officer action, then refetches `keys`. On failure (for example 422 when another officer acted first)
 * it keeps the server's message for an inline banner and still refetches, so the screen shows the real state.
 */
export function useAction(...keys: string[][]) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => keys.forEach(queryKey => client.invalidateQueries({ queryKey }));

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      refresh();
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Can't reach the server.");
      refresh();
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { run, error, busy, setError };
}
