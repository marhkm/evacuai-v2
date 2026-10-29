// Chat times in campus time (as config('evacuai.timezone')), whatever the phone's zone. Same rules as the
// Command Center's command/src/chatTime.ts.
const ZONE = 'Asia/Manila';
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONE }); // YYYY-MM-DD
const valid = (iso: string) => !!iso && !Number.isNaN(new Date(iso).getTime());

/** "2:41 PM"; '' for a message without a usable time. */
export const timeLabel = (iso: string) => (valid(iso) ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }) : '');

/** "Today", "Yesterday", else e.g. "Tue, Oct 27": the separator before a day's first message ('' without a time). */
export function dayLabel(iso: string, now = new Date()): string {
  if (!valid(iso)) return '';
  const day = dayKey(new Date(iso));
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
}

/** True when message i starts a new day in the chat (so a separator goes before it). */
export const startsDay = (messages: { created_at: string }[], i: number) =>
  !!dayLabel(messages[i].created_at) && (i === 0 || dayLabel(messages[i].created_at) !== dayLabel(messages[i - 1].created_at));
