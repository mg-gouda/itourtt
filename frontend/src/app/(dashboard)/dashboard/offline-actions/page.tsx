"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MapPin, RefreshCw, WifiOff, XCircle } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { formatDateLong, formatTime24 } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OfflineAction {
  id: string;
  role: "REP" | "DRIVER";
  kind: string;
  occurredAt: string;
  receivedAt: string;
  latitude: number | null;
  longitude: number | null;
  imageUrls: string[];
  payload: { status?: string; collected?: boolean } | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FAILED";
  note: string | null;
  personName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  job: { id: string; internalRef: string; serviceType: string; jobDate: string } | null;
}

const FILES = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/api\/?$/, "");
const KIND: Record<string, string> = {
  IN_PLACE: "In place", IN_PROGRESS: "Started trip", COMPLETED: "Completed", NO_SHOW: "No show", STATUS: "Status", COLLECTED: "Cash collected",
};

/**
 * Offline actions (6.9.0): rep / driver actions done without signal that reached the server more
 * than 2 hours later. Approve applies them now, at the time they were done; Reject drops them.
 * The rep / driver is told in chat either way.
 */
export default function OfflineActionsPage() {
  const t = useT();
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");
  const [rows, setRows] = useState<OfflineAction[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    api.get("/offline-actions", { params: { status: tab } })
      .then(({ data }) => setRows(data.data ?? []))
      .catch(() => { setRows([]); toast.error(t("offlineActions.loadFailed")); });
  }, [tab, t]);
  useEffect(load, [load]);

  const decide = async (id: string, how: "approve" | "reject") => {
    let note: string | undefined;
    if (how === "reject") {
      const n = window.prompt(t("offlineActions.rejectReason"));
      if (n === null) return;
      note = n;
    }
    setBusy(id);
    try {
      await api.post(`/offline-actions/${id}/${how}`, how === "reject" ? { note } : {});
      toast.success(how === "approve" ? t("offlineActions.approved") : t("offlineActions.rejected"));
      load();
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(m || t("offlineActions.failed"));
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("offlineActions.title")} description={t("offlineActions.description")} />
      <div className="flex items-center gap-2">
        {(["PENDING", "ALL"] as const).map((k) => (
          <Button key={k} variant={tab === k ? "default" : "outline"} size="sm" onClick={() => setTab(k)}>
            {k === "PENDING" ? t("offlineActions.waiting") : t("offlineActions.all")}
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="ms-auto gap-1.5" onClick={load}>
          <RefreshCw className="h-4 w-4" /> {t("portal.refresh")}
        </Button>
      </div>

      {!rows ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <WifiOff className="h-8 w-8 opacity-50" aria-hidden="true" />
          {tab === "PENDING" ? t("offlineActions.noneWaiting") : t("offlineActions.none")}
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const lateMin = Math.round((new Date(r.receivedAt).getTime() - new Date(r.occurredAt).getTime()) / 60000);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{r.job?.internalRef ?? "—"}</span>
                      <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{KIND[r.kind] ?? r.kind}{r.payload?.status ? ` · ${r.payload.status.replace(/_/g, " ")}` : ""}</span>
                      <span className="text-sm text-muted-foreground">{r.role === "REP" ? t("offlineActions.rep") : t("offlineActions.driver")}: <b className="text-foreground">{r.personName ?? "—"}</b></span>
                      {r.status !== "PENDING" && (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold",
                          r.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-red-500/15 text-red-800 dark:text-red-200")}>
                          {r.status.toLowerCase()}{r.decidedByName ? ` · ${r.decidedByName}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground">
                      {t("offlineActions.doneAt")} <b>{formatDateLong(r.occurredAt)} {formatTime24(r.occurredAt)}</b> · {t("offlineActions.receivedAt")} {formatTime24(r.receivedAt)}
                      <span className="text-muted-foreground"> ({t("offlineActions.late").replace("{h}", (lateMin / 60).toFixed(1))})</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {r.latitude != null && r.longitude != null && (
                        <a className="inline-flex items-center gap-1 text-blue-700 underline dark:text-blue-300" target="_blank" rel="noopener noreferrer"
                          href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}>
                          <MapPin className="h-4 w-4" aria-hidden="true" /> {t("offlineActions.location")}
                        </a>
                      )}
                      {r.imageUrls.map((u, i) => (
                        <a key={u} href={u.startsWith("http") ? u : `${FILES}${u}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline dark:text-blue-300">
                          {t("offlineActions.photo")} {i + 1}
                        </a>
                      ))}
                      {r.note && <span className="text-muted-foreground">— {r.note}</span>}
                    </div>
                  </div>
                  {r.status === "FAILED" && (
                    <Button size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={busy === r.id} onClick={() => void decide(r.id, "approve")}>
                      {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t("offlineActions.retry")}
                    </Button>
                  )}
                  {r.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" className="gap-1.5" disabled={busy === r.id} onClick={() => void decide(r.id, "approve")}>
                        {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t("offlineActions.approve")}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" disabled={busy === r.id} onClick={() => void decide(r.id, "reject")}>
                        <XCircle className="h-4 w-4" /> {t("offlineActions.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
