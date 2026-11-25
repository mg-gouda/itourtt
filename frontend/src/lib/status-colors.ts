"use client";

import { useCallback } from "react";
import { useT } from "@/lib/i18n";

/**
 * One colour per job status, used by every office page, the web portals and
 * (mirrored in mobile/packages/ui/src/status.ts) both apps — UI review 3a.
 * Colour means status only; service type and booking channel use icon + text.
 *
 *   Pending       slate   (not started)
 *   Assigned      blue
 *   In progress   amber
 *   In place      purple
 *   Completed     green
 *   Cancelled     red
 *   No show       red
 */
export type JobStatusTone = "slate" | "blue" | "amber" | "purple" | "green" | "red";

export const JOB_STATUS_TONE: Record<string, JobStatusTone> = {
  NEW: "slate",
  PENDING: "slate",
  ASSIGNED: "blue",
  CONFIRMED: "blue",
  IN_PROGRESS: "amber",
  IN_PLACE: "purple",
  COMPLETED: "green",
  CANCELLED: "red",
  NO_SHOW: "red",
};

/** Pill / badge classes (background + readable text in light and dark + border). */
export const TONE_BADGE: Record<JobStatusTone, string> = {
  slate: "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/40",
  blue: "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/40",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40",
  purple: "bg-purple-500/15 text-purple-800 dark:text-purple-200 border-purple-500/40",
  green: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
  red: "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/40",
};

/** Solid dot / stripe colour. */
export const TONE_DOT: Record<JobStatusTone, string> = {
  slate: "bg-slate-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
};

/** Left stripe for table rows. */
export const TONE_STRIPE: Record<JobStatusTone, string> = {
  slate: "border-l-4 border-l-slate-500",
  blue: "border-l-4 border-l-blue-500",
  amber: "border-l-4 border-l-amber-500",
  purple: "border-l-4 border-l-purple-500",
  green: "border-l-4 border-l-emerald-500",
  red: "border-l-4 border-l-red-500",
};

export function statusTone(status: string | null | undefined): JobStatusTone {
  return (status && JOB_STATUS_TONE[status]) || "slate";
}

export function statusBadgeClass(status: string | null | undefined): string {
  return TONE_BADGE[statusTone(status)];
}

/** Translated status label ("In progress" / "قيد التنفيذ"); unknown values are prettified. */
export function useStatusLabel() {
  const t = useT();
  return useCallback(
    (status: string | null | undefined) => {
      if (!status) return "—";
      const key = `status.${status}`;
      const v = t(key);
      return v === key ? status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : v;
    },
    [t],
  );
}
