"use client";

import { useEffect, useState } from "react";
import { BellRing, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { ensurePushSubscription, pushAvailable, pushSupport } from "@/lib/web-push";

const DISMISS_KEY = "push-prompt-dismissed-at";
/** After "Not now", ask again a day later. */
const DISMISS_MS = 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * Rep/driver portal banner: turn on phone notifications for new jobs, job
 * changes and chat messages. When permission was already granted it silently
 * re-subscribes on every load (keeps the browser bound to whoever is signed in).
 */
export function PushPrompt({ variant = "portal" }: { variant?: "portal" | "office" } = {}) {
  const t = useT();
  const [mode, setMode] = useState<"hidden" | "ask" | "ios" | "blocked">("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      if (support === "ios-needs-install") {
        if (!dismissedRecently()) setMode("ios");
        return;
      }
      if (!(await pushAvailable()) || !alive) return;
      if (Notification.permission === "granted") {
        ensurePushSubscription(false).catch(() => {});
      } else if (Notification.permission === "default" && !dismissedRecently()) {
        setMode("ask");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setMode("hidden");
  };

  const enable = async () => {
    setBusy(true);
    try {
      const r = await ensurePushSubscription(true);
      setMode(r === "granted" ? "hidden" : r === "denied" ? "blocked" : "hidden");
    } catch {
      setMode("hidden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      {mode === "ios" ? <Share className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">
          {mode === "ios" ? t("push.iosTitle") : mode === "blocked" ? t("push.blockedTitle") : t("push.askTitle")}
        </p>
        <p className="text-xs text-muted-foreground">
          {mode === "ios" ? t("push.iosBody") : mode === "blocked" ? (variant === "office" ? t("push.officeBlockedBody") : t("push.blockedBody")) : (variant === "office" ? t("push.officeAskBody") : t("push.askBody"))}
        </p>
        {mode === "ask" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={enable} disabled={busy}>
              {t("push.enable")}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {t("push.notNow")}
            </Button>
          </div>
        )}
      </div>
      {mode !== "ask" && (
        <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground" aria-label={t("chat.dismiss")}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
