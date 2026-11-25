/**
 * Shared display formats (UI review 3b). One format each, everywhere:
 *   date (tables)  25 Nov 2026        formatDate()       (lib/utils — re-exported)
 *   date (long)    Wed 25 Nov 2026    formatDateLong()
 *   time           13:40              formatTime24()     24-hour, Africa/Cairo
 *   money          23,160.00 EUR      formatMoney()
 * Operational times are always shown in Cairo time, never the device's zone.
 */
export { formatDate } from "@/lib/utils";

const CAIRO = "Africa/Cairo";

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return isNaN(d.getTime()) ? null : d;
}

/** "Wed 25 Nov 2026" (Cairo calendar day). */
export function formatDateLong(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CAIRO, weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** "13:40" — 24-hour clock in Cairo time; null when there is no time. */
export function formatTime24(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: CAIRO, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "23,160.00 EUR" — thousands separator, two decimals, currency code after. */
export function formatMoney(amount: number | string | null | undefined, currency?: string | null): string {
  const n = Number(amount ?? 0);
  const s = (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}
