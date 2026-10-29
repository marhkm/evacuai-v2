import { dayLabel, timeLabel } from './chatTime';

const now = new Date('2026-10-29T04:00:00Z'); // 12:00 noon in Manila

test('labels days in campus (Manila) time', () => {
  expect(dayLabel('2026-10-29T01:00:00Z', now)).toBe('Today');
  expect(dayLabel('2026-10-28T03:00:00Z', now)).toBe('Yesterday');
  expect(dayLabel('2026-10-27T03:00:00Z', now)).toBe('Tue, Oct 27');
  expect(dayLabel('2026-10-28T17:30:00Z', now)).toBe('Today'); // Oct 29, 01:30 in Manila, still Oct 28 in UTC
});

test('shows the time of day', () => {
  expect(timeLabel('2026-10-29T06:41:00Z')).toBe('2:41 PM');
});
