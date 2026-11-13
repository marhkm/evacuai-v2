const SOURCES: Record<string, string> = {
  schedule: 'from class schedule', gps: 'from GPS', estimate: 'approximate (last known)', qr: 'scanned sticker', manual: 'picked by student',
};

/** An SOS place with where it came from, so officers know how far to trust it ("Basic Ed · from GPS"). */
export const withSource = (place: string, source?: string | null) => (source && SOURCES[source] ? `${place} · ${SOURCES[source]}` : place);
