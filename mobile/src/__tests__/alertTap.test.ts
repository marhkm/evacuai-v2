import { openRouteOnAlertTap } from '@/lib/alertTap';

const mockNotif: { last: unknown; tap?: (r: unknown) => void; removed: boolean } = { last: null, removed: false };
jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: async () => mockNotif.last,
  addNotificationResponseReceivedListener: (cb: (r: unknown) => void) => { mockNotif.tap = cb; return { remove: () => { mockNotif.removed = true; } }; },
}));

const response = (data: object) => ({ notification: { request: { content: { data } } } });

test('tapping an alert notification opens the route; other notifications do not', async () => {
  const open = jest.fn();
  const off = openRouteOnAlertTap(open);
  await Promise.resolve();
  expect(open).not.toHaveBeenCalled();

  mockNotif.tap!(response({ other: 1 }));
  expect(open).not.toHaveBeenCalled();
  mockNotif.tap!(response({ alert_id: 7 }));
  expect(open).toHaveBeenCalledTimes(1);

  off();
  expect(mockNotif.removed).toBe(true);
});

test('an alert notification that launched the app also opens the route', async () => {
  mockNotif.last = response({ alert_id: 9 });
  const open = jest.fn();
  openRouteOnAlertTap(open);
  await new Promise(r => setTimeout(r, 0));
  expect(open).toHaveBeenCalledTimes(1);
});
