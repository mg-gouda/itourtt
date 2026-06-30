import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * The business operates exclusively in Egypt. All operational dates/times
 * (flight arrival/departure, pickup, meeting times, dispatch windows) are
 * Africa/Cairo and MUST render in Cairo regardless of the viewer's device
 * timezone — otherwise a rep/admin on a UTC device sees a 14:30 flight as
 * 11:30 and the IN PLACE window appears shifted.
 */
export const APP_TZ = "Africa/Cairo";

/** Format the HH:mm (24h) portion of an instant in Cairo time. */
export function formatTimeCairo(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-GB", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Return YYYY-MM-DD in local timezone (safe for API date params) */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a date as dd-MMM-yy (e.g. 07-Feb-26) */
export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "\u2014";
  const dd = String(d.getDate()).padStart(2, "0");
  const mmm = MONTHS[d.getMonth()];
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}-${mmm}-${yy}`;
}
