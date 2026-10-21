import { onNotificationTap } from '@/lib/alertTap';

const mockNotif: { last: unknown; tap?: (r: unknown) => void; removed: boolean } = { last: null, removed: false };
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: async () => mockNotif.last,
  addNotificationResponseReceivedListener: (cb: (r: unknown) => void) => { mockNotif.tap = cb; return { remove: () => { mockNotif.removed = true; } }; },
}));

const response = (data: object) => ({ notification: { request: { content: { data } } } });

test('tapping an alert or SOS notification hands over its id; other notifications do not', async () => {
  const open = jest.fn();
  const off = onNotificationTap(open);
  await Promise.resolve();
  expect(open).not.toHaveBeenCalled();

  mockNotif.tap!(response({ other: 1 }));
  expect(open).not.toHaveBeenCalled();
  mockNotif.tap!(response({ alert_id: 7 }));
  expect(open).toHaveBeenLastCalledWith({ alertId: 7 });
  mockNotif.tap!(response({ sos_id: 3 }));
  expect(open).toHaveBeenLastCalledWith({ sosId: 3 });

  off();
  expect(mockNotif.removed).toBe(true);
});

test('an alert notification that launched the app also opens the route', async () => {
  mockNotif.last = response({ alert_id: 9 });
  const open = jest.fn();
  onNotificationTap(open);
  await new Promise(r => setTimeout(r, 0));
  expect(open).toHaveBeenCalledWith({ alertId: 9 });
});
