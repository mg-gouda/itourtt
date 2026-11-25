"use client";

import { CheckCircle2, ChevronDown, RefreshCw, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Portal job card actions (UI review 1c). One big main button that always shows
 * the next step for the job's status (In Place → Complete → ✓ Done), and the
 * rest under "More". A disabled main button says why in plain text under it
 * (phones have no hover, so the old tooltips never showed).
 */

export interface MainActionSpec {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Shown under the button when it is disabled. */
  reason?: string;
  /** "complete" = green finishing step; "next" = the brand colour. */
  tone: "next" | "complete";
  busy?: boolean;
}

export function MainActionButton({ spec, className }: { spec: MainActionSpec; className?: string }) {
  const Icon = spec.icon;
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={spec.onClick}
        disabled={spec.disabled || spec.busy}
        className={cn(
          "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-base font-bold transition-colors disabled:cursor-not-allowed",
          spec.tone === "complete"
            // Dark text on green: readable in sun and at night (UI review 4a).
            ? "bg-emerald-400 text-emerald-950 active:bg-emerald-500 disabled:bg-emerald-400/35 disabled:text-emerald-950/60 dark:disabled:text-emerald-100/60"
            : "bg-primary text-primary-foreground active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="truncate">{spec.label}</span>
      </button>
      {spec.disabled && spec.reason && (
        <p className="mt-1 text-xs text-muted-foreground">{spec.reason}</p>
      )}
    </div>
  );
}

export function DoneBadge({ label }: { label: string }) {
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-muted text-sm font-semibold text-muted-foreground">
      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {label}
    </div>
  );
}

export interface MoreItem {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Appended to the label when disabled, e.g. "available from 07:10". */
  reason?: string;
  destructive?: boolean;
  /** Separate this item from the ones above (used for Cancel). */
  separated?: boolean;
}

export function MoreMenu({ items }: { items: MoreItem[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground active:bg-muted"
        >
          {t("portal.more")}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={it.label}>
              {it.separated && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={it.disabled}
                onSelect={() => it.onClick()}
                className={cn("min-h-11 gap-2.5 text-[15px]", it.destructive && "text-destructive focus:text-destructive")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="flex-1">
                  {it.label}
                  {it.disabled && it.reason && <span className="block text-xs text-muted-foreground">{it.reason}</span>}
                </span>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** UI review 1b: a failed load is not "no jobs today". */
export function LoadErrorBanner({ savedAt, onRetry, retrying }: { savedAt: number | null; onRetry: () => void; retrying?: boolean }) {
  const t = useT();
  const time = savedAt
    ? new Date(savedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-amber-500/60 bg-amber-500/10 px-3 py-3">
      <WifiOff className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{t("portal.cantReachOffice")}</p>
        <p className="text-xs text-muted-foreground">
          {time ? t("portal.showingSavedAt").replace("{time}", time) : t("portal.noSavedJobs")}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-bold text-amber-950 active:bg-amber-600 disabled:opacity-60"
      >
        <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} aria-hidden="true" />
        {t("portal.retry")}
      </button>
    </div>
  );
}

/** Last good job list per portal + day, kept on the phone for weak-signal moments. */
export function saveJobsCache(kind: "rep" | "driver", date: string, jobs: unknown[]) {
  try { localStorage.setItem(`portal-jobs:${kind}:${date}`, JSON.stringify({ at: Date.now(), jobs })); } catch { /* storage full / blocked */ }
}

export function readJobsCache<T>(kind: "rep" | "driver", date: string): { at: number; jobs: T[] } | null {
  try {
    const raw = localStorage.getItem(`portal-jobs:${kind}:${date}`);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v?.jobs) && typeof v?.at === "number" ? v : null;
  } catch {
    return null;
  }
}
