'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldX, AlertTriangle, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
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

/**
 * Licence notices (UI review 3d). They used to be a toast over every page and a
 * modal, covering Save buttons, dialog fields and the portals' tab bar, and they
 * told field staff to contact the developer. Now:
 * - only office admins see anything (field portals pass audience="field");
 * - it is one slim strip at the top of the page, dismissible (expiry warning:
 *   24 h snooze per level; not-active: for this browser session).
 */
export function LicenseGate({ children, audience = 'office' }: { children: React.ReactNode; audience?: 'office' | 'field' }) {
  const { status } = useLicense();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAdmin = user?.role === 'ADMIN';
  const warningLevel = status?.valid && status.daysRemaining !== null ? getWarningLevel(status.daysRemaining) : null;
  const warnKey = warningLevel ? `license_warn_dismissed_${warningLevel}` : null;
  const INVALID_KEY = 'license_invalid_dismissed';
  const invalid = !!(status && !status.valid);

  let invalidDismissed = dismissedKeys.includes(INVALID_KEY);
  if (mounted) { try { invalidDismissed ||= sessionStorage.getItem(INVALID_KEY) === '1'; } catch { /* not dismissed */ } }
  const warningDismissed = !!warnKey && (dismissedKeys.includes(warnKey) || (mounted && Number(readStore(warnKey)) > Date.now()));

  function dismiss() {
    if (invalid) {
      setDismissedKeys((k) => [...k, INVALID_KEY]);
      try { sessionStorage.setItem(INVALID_KEY, '1'); } catch { /* in-memory only */ }
    } else if (warnKey) {
      setDismissedKeys((k) => [...k, warnKey]);
      writeStore(warnKey, String(Date.now() + WARN_SNOOZE_MS));
    }
  }

  const show = mounted && audience === 'office' && isAdmin && !ALLOWED_PATHS.includes(pathname)
    && ((invalid && !invalidDismissed) || (!invalid && warningLevel !== null && !warningDismissed));

  const days = status?.daysRemaining ?? 0;
  const tone = invalid || warningLevel === 30
    ? 'bg-red-950 text-red-100 border-red-500/40'
    : 'bg-amber-950 text-amber-100 border-amber-500/40';

  return (
    <>
      {show && (
        <div role="status" className={`sticky top-0 z-[60] flex items-center gap-2 border-b px-4 py-1.5 text-sm ${tone}`}>
          {invalid ? <ShieldX className="h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 flex-1 truncate">
            {invalid
              ? 'Licence not active — the system keeps working.'
              : `Licence expires in ${days} day${days !== 1 ? 's' : ''}.`}
          </span>
          <a href="/dashboard/company" className="shrink-0 font-semibold underline underline-offset-2">
            {invalid ? 'Activate' : 'Renew'}
          </a>
          <button type="button" onClick={dismiss} aria-label="Dismiss licence notice"
            className="-my-1 shrink-0 rounded-md p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
