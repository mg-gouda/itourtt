/** One rep or driver as returned by GET /tracking/reps | /tracking/drivers. */
export type TrackedRole = "REP" | "DRIVER";

export interface TrackedPerson {
  id: string;
  /** Rep or driver — on Overall Tracking reps are round markers, drivers square. */
  role: TrackedRole;
  name: string;
  mobileNumber: string;
  hasAccount: boolean;
  online: boolean;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    source: string;
    recordedAt: string;
  } | null;
  todayJobs: {
    jobId: string;
    internalRef: string;
    serviceType: string;
    status: string;
    legStatus: string;
    flightNo: string | null;
    time: string | null;
  }[];
}

export type Freshness = "live" | "recent" | "stale" | "none";

const LIVE_MS = 5 * 60_000;
const RECENT_MS = 60 * 60_000;

/** Bucket a last-known position by age relative to `now`. */
export function freshnessOf(p: TrackedPerson, now: number): Freshness {
  if (!p.location) return "none";
  const age = now - new Date(p.location.recordedAt).getTime();
  if (age <= LIVE_MS) return "live";
  if (age <= RECENT_MS) return "recent";
  return "stale";
}

export const FRESHNESS_COLOR: Record<Freshness, string> = {
  live: "#16a34a",
  recent: "#d97706",
  stale: "#6b7280",
  none: "#9ca3af",
};

/** "3 min ago" style label (translated via `t`). */
export function relativeAge(iso: string, now: number, t: (k: string) => string): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t("tracking.justNow");
  if (mins < 60) return t("tracking.minAgo").replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("tracking.hAgo").replace("{n}", String(hours));
  return t("tracking.dAgo").replace("{n}", String(Math.floor(hours / 24)));
}

/** Wall-clock time in Cairo, regardless of the viewer's device timezone. */
export function cairoDateTime(iso: string, localeId: string): string {
  return new Date(iso).toLocaleString(localeId, {
    timeZone: "Africa/Cairo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function cairoTime(iso: string, localeId: string): string {
  return new Date(iso).toLocaleTimeString(localeId, {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
