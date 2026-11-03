export function parseBookingTime(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

type BookingRange = { start: Date; end: Date; error?: never } | { error: 'invalidTime' | 'timeOrder' | 'timePast'; start?: never; end?: never };

/** Reject invalid clock values before Date can normalize them into another day. */
export function getBookingRange(date: Date, startTime: string, endTime: string, now = Date.now()): BookingRange {
  const startMinutes = parseBookingTime(startTime);
  const endMinutes = parseBookingTime(endTime);
  if (startMinutes === null || endMinutes === null || !Number.isFinite(date.getTime())) return { error: 'invalidTime' };
  if (endMinutes <= startMinutes) return { error: 'timeOrder' };
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  if (start.getTime() <= now) return { error: 'timePast' };
  return { start, end };
}
