import { subscribeAlerts, subscribeOfficers } from '@/lib/realtime';

// A fake Echo: channels share one handler list per name, and leave() drops it for everyone (as laravel-echo does).
const mockEcho = { handlers: new Map<string, ((p: unknown) => void)[]>(), left: [] as string[] };
jest.mock('laravel-echo', () => jest.fn().mockImplementation(() => {
  const channel = (name: string) => ({
    listen(event: string, fn: (p: unknown) => void) {
      const key = `${name} ${event}`;
      mockEcho.handlers.set(key, [...(mockEcho.handlers.get(key) ?? []), fn]);
      return this;
    },
  });
  return {
    channel, private: channel,
    leave: (name: string) => {
      mockEcho.left.push(name);
      for (const key of [...mockEcho.handlers.keys()]) if (key.startsWith(`${name} `)) mockEcho.handlers.delete(key);
    },
  };
}));
jest.mock('pusher-js', () => jest.fn());
jest.mock('@/lib/api', () => ({
  getServerUrl: () => 'http://localhost:8000',
  api: async () => ({ reverb: { key: 'k', port: 8080, scheme: 'http' } }),
}));

const emit = (key: string, payload: unknown = {}) => (mockEcho.handlers.get(key) ?? []).forEach(fn => fn(payload));

beforeEach(() => {
  mockEcho.left = [];
});

test('one screen leaving the alerts channel does not cut off the others', async () => {
  const banner = jest.fn();
  const screen = jest.fn();
  const offBanner = await subscribeAlerts(banner);
  const offScreen = await subscribeAlerts(screen);

  offScreen();
  expect(mockEcho.left).toEqual([]);
  emit('alerts .alert.updated', { alert: { id: 7 } });
  expect(banner).toHaveBeenCalledWith({ id: 7 });
  expect(screen).not.toHaveBeenCalled();

  offBanner();
  expect(mockEcho.left).toEqual(['alerts']);
});

test('a burst of officer events (e.g. a drill full of check-ins) refreshes once', async () => {
  const refresh = jest.fn();
  const off = await subscribeOfficers('t', refresh);
  jest.useFakeTimers();
  try {
    for (let i = 0; i < 20; i++) emit('officers .checkin.updated');
    emit('officers .sos.updated');
    expect(refresh).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
    off();
  }
});
