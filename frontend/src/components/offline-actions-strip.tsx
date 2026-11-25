"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import api, { backgroundPoll } from "@/lib/api";
import { useT } from "@/lib/i18n";

/**
 * Office strip (6.9.0): "N offline actions need approval — Review". Shown to users who may approve
 * (the list endpoint answers 403 to everyone else, who then never see it). Polls every minute.
 */
export function OfflineActionsStrip() {
  const t = useT();
  const pathname = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api.get("/offline-actions", { ...backgroundPoll, params: { status: "PENDING" } })
        .then(({ data }) => !stop && setN((data.data ?? []).length))
        .catch((e) => { if ((e as { response?: { status?: number } })?.response?.status === 403) stop = true; });
    load();
    const id = setInterval(() => !stop && load(), 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  if (!n || pathname.startsWith("/dashboard/offline-actions")) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-950 px-4 py-1.5 text-sm text-amber-100">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{t("offlineActions.strip").replace("{n}", String(n))}</span>
      <Link href="/dashboard/offline-actions" className="font-semibold underline underline-offset-2">{t("offlineActions.review")}</Link>
    </div>
  );
}
