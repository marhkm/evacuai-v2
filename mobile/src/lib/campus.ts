import type { CampusSnapshot } from '@evacuai/routing';

import { getServerUrl } from '@/lib/api';
import { storage } from '@/lib/storage';

/**
 * Campus geometry + live path status. Cached on the device so maps (and later routing) work offline;
 * refreshed with If-None-Match so an unchanged campus costs one tiny 304.
 */
export async function loadSnapshot(token: string | null): Promise<{ snapshot: CampusSnapshot; offline: boolean }> {
  const [cached, etag] = await Promise.all([storage.get('campus_snapshot'), storage.get('campus_etag')]);
  try {
    const res = await fetch(`${getServerUrl()}/api/campus-snapshot`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cached && etag ? { 'If-None-Match': etag } : {}),
      },
    });
    if (res.status === 304 && cached) return { snapshot: JSON.parse(cached), offline: false };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = (await res.json()) as CampusSnapshot;
    await storage.set('campus_snapshot', JSON.stringify(snapshot));
    const tag = res.headers.get('etag');
    if (tag) await storage.set('campus_etag', tag);
    return { snapshot, offline: false };
  } catch {
    if (cached) return { snapshot: JSON.parse(cached), offline: true };
    throw new Error('Could not load the campus map. Connect to the internet once to download it.');
  }
}
