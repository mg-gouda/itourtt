"use client";

// Shown when a page crashes in the browser (app/error.tsx, app/global-error.tsx).
// The error is reported to the server log (POST /client-errors) so a crash on a
// driver's or rep's phone can be diagnosed without their device, and the message
// is shown in small print so a screenshot carries it too.

import { useEffect } from "react";

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  useEffect(() => {
    // Plain fetch, not the api client: a signed-out visitor must not be bounced to /login.
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) return; // only signed-in users are reported
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/client-errors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: String(error?.message ?? error).slice(0, 2000),
          stack: String(error?.stack ?? "").slice(0, 8000),
          digest: error?.digest ?? null,
          path: window.location.pathname + window.location.search,
          userAgent: navigator.userAgent,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* storage blocked */
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Something went wrong / حدث خطأ</h1>
        <p className="text-sm text-muted-foreground">
          The problem was reported automatically. Tap Reload to try again.
          <br />
          تم إرسال المشكلة تلقائياً. اضغط إعادة التحميل للمحاولة مرة أخرى.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload / إعادة التحميل
          </button>
          {reset && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
            >
              Try again
            </button>
          )}
        </div>
        <p className="break-words font-mono text-[11px] text-muted-foreground">
          {String(error?.message ?? error)}
          {error?.digest ? ` · ${error.digest}` : ""}
        </p>
      </div>
    </div>
  );
}
