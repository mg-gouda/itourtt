"use client";

import React from "react";

// ─── Status → color mapping ──────────────────────────────────────────────────
// Each entry: [bgClass, textClass, dotClass]
const STATUS_MAP: Record<string, [string, string, string]> = {
  // Job statuses — the shared system (lib/status-colors.ts, UI review 3a).
  PENDING:     ["bg-slate-500/25",   "text-slate-700 dark:text-slate-200",   "bg-slate-500"],
  ASSIGNED:    ["bg-blue-500/25",    "text-blue-800 dark:text-blue-200",     "bg-blue-500"],
  IN_PROGRESS: ["bg-amber-500/25",   "text-amber-800 dark:text-amber-200",   "bg-amber-500"],
  IN_PLACE:    ["bg-purple-500/25",  "text-purple-800 dark:text-purple-200", "bg-purple-500"],
  COMPLETED:   ["bg-emerald-500/25", "text-emerald-800 dark:text-emerald-200","bg-emerald-500"],
  CANCELLED:   ["bg-red-500/25",     "text-red-800 dark:text-red-200",       "bg-red-500"],
  NO_SHOW:     ["bg-red-500/25",     "text-red-800 dark:text-red-200",       "bg-red-500"],
  DRAFT:       ["bg-zinc-500/30",    "text-zinc-600 dark:text-zinc-400",     "bg-zinc-500"],
  POSTED:      ["bg-sky-500/30",     "text-sky-600 dark:text-sky-400",       "bg-sky-500"],
  PAID:        ["bg-emerald-500/30", "text-emerald-600 dark:text-emerald-400","bg-emerald-500"],
  CONFIRMED:   ["bg-green-500/30",   "text-green-600 dark:text-green-400",   "bg-green-500"],
  CONVERTED:   ["bg-blue-500/30",    "text-blue-600 dark:text-blue-400",     "bg-blue-500"],
  COLLECTED:   ["bg-blue-500/30",    "text-blue-600 dark:text-blue-400",     "bg-blue-500"],
  LIQUIDATED:  ["bg-emerald-500/30", "text-emerald-600 dark:text-emerald-400","bg-emerald-500"],
  NEW:         ["bg-emerald-500/30", "text-emerald-600 dark:text-emerald-400","bg-emerald-500"],
  UPDATED:     ["bg-sky-500/30",     "text-sky-600 dark:text-sky-400",       "bg-sky-500"],
  REFUNDED:    ["bg-zinc-500/30",    "text-zinc-600 dark:text-zinc-400",     "bg-zinc-500"],
  FAILED:      ["bg-red-500/30",     "text-red-600 dark:text-red-400",       "bg-red-500"],
  ACTIVE:      ["bg-emerald-500/30", "text-emerald-600 dark:text-emerald-400","bg-emerald-500"],
  INACTIVE:    ["bg-zinc-500/30",    "text-zinc-600 dark:text-zinc-400",     "bg-zinc-500"],
};

const FALLBACK: [string, string, string] = [
  "bg-zinc-500/30",
  "text-zinc-600 dark:text-zinc-400",
  "bg-zinc-500",
];

interface StatusBadgeProps {
  status: string;
  /** Override the display label; defaults to status with underscores replaced by spaces */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const [bg, text, dot] = STATUS_MAP[status] ?? FALLBACK;
  const displayLabel = label ?? status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {displayLabel}
    </span>
  );
}
