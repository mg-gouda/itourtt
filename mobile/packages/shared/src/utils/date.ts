const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date as dd-MMM-yy (e.g. 07-Feb-26) */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '\u2014';
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTHS[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}-${mmm}-${yy}`;
}

/** Format a date as YYYY-MM-DD for API calls */
export function toApiDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Format time from ISO string as HH:mm */
export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '\u2014';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '\u2014';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Get today's date as YYYY-MM-DD */
export function today(): string {
  return toApiDate(new Date());
}

/**
 * Add/subtract days from a date string (YYYY-MM-DD). Pure calendar maths in
 * UTC: parsing as local midnight and printing with toISOString() shifted the
 * result a day back on phones east of UTC (Cairo is UTC+2).
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const CAIRO = 'Africa/Cairo';

/** HH:mm in Cairo time, whatever the phone's timezone ("—" when missing). */
export function formatTimeCairo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { timeZone: CAIRO, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Tue, 17 Nov" in Cairo time. */
export function formatDayLabel(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { timeZone: CAIRO, weekday: 'short', day: '2-digit', month: 'short' });
}

/** Today in Cairo as YYYY-MM-DD (the service-date calendar the server uses). */
export function todayCairo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CAIRO });
}

/** "5 min ago" / "3 h ago" / "17 Nov" — short relative time for feeds. */
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (isNaN(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString('en-GB', { timeZone: CAIRO, day: '2-digit', month: 'short' });
}
