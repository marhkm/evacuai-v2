import { loadSnapshot } from '@/lib/campus';
import { setServerUrl } from '@/lib/api';

const mockMem = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    get: async (k: string) => mockMem.get(k) ?? null,
    set: async (k: string, v: string) => void mockMem.set(k, v),
    remove: async (k: string) => void mockMem.delete(k),
  },
}));

const snap = { name: 'Demo', buildings: [], rooms: [], nodes: [], edges: [], assemblyPoints: [], hazardRoomIds: [], weights: {} };

beforeEach(() => {
  mockMem.clear();
  setServerUrl('http://server.test');
  global.fetch = jest.fn();
});

const reply = (status: number, body?: unknown, etag?: string) =>
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status < 300, status, json: async () => body, headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? etag ?? null : null) },
  });

test('downloads and caches the snapshot with its ETag', async () => {
  reply(200, snap, '"v1"');
  await expect(loadSnapshot('tok')).resolves.toEqual({ snapshot: snap, offline: false });
  expect(JSON.parse(mockMem.get('campus_snapshot')!)).toEqual(snap);
  expect(mockMem.get('campus_etag')).toBe('"v1"');
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(init.headers.Authorization).toBe('Bearer tok');
});

test('sends If-None-Match and reuses the cache on 304', async () => {
  mockMem.set('campus_snapshot', JSON.stringify(snap));
  mockMem.set('campus_etag', '"v1"');
  reply(304);
  await expect(loadSnapshot('tok')).resolves.toEqual({ snapshot: snap, offline: false });
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers['If-None-Match']).toBe('"v1"');
});

test('falls back to the cached snapshot when offline', async () => {
  mockMem.set('campus_snapshot', JSON.stringify(snap));
  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(loadSnapshot('tok')).resolves.toEqual({ snapshot: snap, offline: true });
});

test('fails clearly when offline with no cache', async () => {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(loadSnapshot('tok')).rejects.toThrow(/campus map/i);
});
