'use client';

import { usePathname } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { useLicense } from '@/hooks/use-license';

const ALLOWED_PATHS = ['/dashboard/company'];

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const { status, loading } = useLicense();
  const pathname = usePathname();

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

  if (status && !status.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground">License Inactive</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {status.message || 'Your software license has expired or is not configured.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact the developer to reactivate your license.
          </p>
          <div className="mt-4 flex flex-col gap-2 items-center">
            <a
              href="/dashboard/company"
              className="inline-block rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
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
    );
  }

  return <>{children}</>;
}
