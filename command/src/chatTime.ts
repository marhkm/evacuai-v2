// Chat times in campus time (as config('evacuai.timezone')), whatever the browser's zone.
const ZONE = 'Asia/Manila';
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONE }); // YYYY-MM-DD

/** "2:41 PM" */
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });

/** "Today", "Yesterday", else e.g. "Tue, Oct 27": the separator before a day's first message. */
export function dayLabel(iso: string, now = new Date()): string {
  const day = dayKey(new Date(iso));
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
}
