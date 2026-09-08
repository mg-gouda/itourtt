export const APP_TZ = 'Africa/Cairo';

/** Today's calendar date in Cairo as YYYY-MM-DD. */
export function todayCairo(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: APP_TZ });
}

/**
 * Whether a service date falls before today in Cairo.
 *
 * Accepts either a YYYY-MM-DD string or a Date. Comparison is on the calendar
 * date in Cairo, never the server's timezone or a UTC instant — a job dated
 * today in Cairo must not read as yesterday because the server is elsewhere.
 */
export function isPastServiceDate(value: string | Date, now: Date = new Date()): boolean {
  const day =
    typeof value === 'string'
      ? value.slice(0, 10)
      : value.toLocaleDateString('en-CA', { timeZone: APP_TZ });
  return day < todayCairo(now);
}
