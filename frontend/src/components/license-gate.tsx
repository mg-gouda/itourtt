'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldX, AlertTriangle, X } from 'lucide-react';
import { useLicense } from '@/hooks/use-license';

const ALLOWED_PATHS = ['/dashboard/company'];

// A dismissed expiry warning stays hidden for this long. sessionStorage alone made it
// reappear on every mobile app/tab reopen, which is what kept it in users' way.
const WARN_SNOOZE_MS = 24 * 60 * 60 * 1000;

// Storage access can throw (Safari private mode, blocked site data). Never let that stop
// a dismiss from closing the dialog.
function readStore(key: string): string | null {
  try { return localStorage.getItem(key) ?? sessionStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {
    try { sessionStorage.setItem(key, value); } catch { /* in-memory dismissal only */ }
  }
}

function getWarningLevel(days: number): 90 | 60 | 30 | null {
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  if (days <= 90) return 90;
  return null;
}

const LEVEL_STYLE = {
  30: {
    border: 'border-red-500/40',
    bg: 'bg-red-950/60',
    icon: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300',
    title: 'text-red-300',
    btn: 'bg-red-600 hover:bg-red-700 text-white',
  },
  60: {
    border: 'border-orange-500/40',
    bg: 'bg-orange-950/60',
    icon: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-300',
    title: 'text-orange-300',
    btn: 'bg-orange-600 hover:bg-orange-700 text-white',
  },
  90: {
    border: 'border-yellow-500/40',
    bg: 'bg-yellow-950/60',
    icon: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-300',
    title: 'text-yellow-300',
    btn: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
} as const;

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { status, loading } = useLicense();
  const pathname = usePathname();
  // Keys dismissed in this page's lifetime — keeps the dialog closed even when storage is unavailable.
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  const warningLevel = status?.valid && status.daysRemaining !== null
    ? getWarningLevel(status.daysRemaining)
    : null;

  // Per-level dismissal, snoozed for WARN_SNOOZE_MS
  const warnKey = warningLevel ? `license_warn_dismissed_${warningLevel}` : null;
  const warningDismissed = !!warnKey && (
    dismissedKeys.includes(warnKey) || Number(readStore(warnKey)) > Date.now()
  );

  function dismiss() {
    if (!warnKey) return;
    setDismissedKeys((k) => [...k, warnKey]);
    writeStore(warnKey, String(Date.now() + WARN_SNOOZE_MS));
  }

  // Dismiss via Escape key
  useEffect(() => {
    if (!warningLevel || warningDismissed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Fail-soft: an invalid / unconfigured license WARNS but never hard-blocks the app,
  // so a config gap or transient check failure can't take production down. Dismissible per session.
  const invalid = !!(status && !status.valid);
  const INVALID_KEY = 'license_invalid_dismissed';
  let invalidDismissed = dismissedKeys.includes(INVALID_KEY);
  try { invalidDismissed ||= sessionStorage.getItem(INVALID_KEY) === '1'; } catch { /* not dismissed */ }
  function dismissInvalid() {
    setDismissedKeys((k) => [...k, INVALID_KEY]);
    try { sessionStorage.setItem(INVALID_KEY, '1'); } catch { /* in-memory dismissal only */ }
  }

  // Always allow the Company settings page so admin can enter the license key
  if (ALLOWED_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground" />
      </div>
    );
  }

  const showWarning = warningLevel !== null && !warningDismissed && !ALLOWED_PATHS.includes(pathname);
  const showInvalid = invalid && !invalidDismissed && !ALLOWED_PATHS.includes(pathname);

  return (
    <>
      {children}
      {showInvalid && (
        <div className="fixed inset-x-4 bottom-4 z-[9998] rounded-xl sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm border border-destructive/40 bg-card p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">License not active</h2>
                <button
                  type="button"
                  onClick={dismissInvalid}
                  className="-m-1.5 touch-manipulation rounded-lg p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {status?.message || 'Your software license is not configured or could not be verified.'} The
                app stays usable — please reactivate to clear this notice.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <a
                  href="/dashboard/company"
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Activate License
                </a>
                <a
                  href="https://wa.me/+201002805139"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                >
                  Contact Mohamed Gouda
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
      {showWarning && (() => {
        const level = warningLevel!;
        const days = status!.daysRemaining!;
        const s = LEVEL_STYLE[level];
        const months = level === 90 ? '3 months' : level === 60 ? '2 months' : '1 month';
        return (
          // Tapping the backdrop dismisses too. Bottom sheet on phones, centred dialog from sm up.
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
            onClick={dismiss}
          >
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border ${s.border} ${s.bg} backdrop-blur-md p-5 sm:p-6 shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={dismiss}
                className="absolute right-2 top-2 flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10`}>
                <AlertTriangle className={`h-6 w-6 ${s.icon}`} />
              </div>

              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.badge} mb-3`}>
                License Expiry Warning
              </span>

              <h2 className={`text-lg font-bold ${s.title} mb-1`}>
                License expires in {days} day{days !== 1 ? 's' : ''}
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Your iTourTT license will expire within {months}. Please renew before it expires to avoid service interruption.
              </p>

              <div className="flex items-center gap-3">
                <a
                  href="https://wa.me/+201002805139"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${s.btn}`}
                >
                  Contact to Renew
                </a>
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex-1 touch-manipulation rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  Dismiss
                </button>
              </div>

              <p className="mt-3 hidden text-center text-[11px] text-muted-foreground sm:block">
                Press <kbd className="rounded border border-border bg-white/10 px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to dismiss · Reappears in 24 hours
              </p>
            </div>
          </div>
        );
      })()}
    </>
  );
}
