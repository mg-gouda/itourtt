"use client";

import { useState } from "react";
import { Route, MapPin, Plane } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

/**
 * Asked right after IN PLACE (and again until answered): will the rep escort
 * the transfer? Yes → the rep completes at the drop-off (geofenced there, and
 * the drop-off alarm is armed); No → the rep completes at the airport.
 * Not dismissable: the answer decides where COMPLETED is accepted.
 */
export function RepEscortDialog({
  jobId,
  jobRef,
  dropoff,
  onAnswered,
}: {
  jobId: string | null;
  jobRef: string;
  dropoff?: string | null;
  onAnswered: () => void;
}) {
  const t = useT();
  const [saving, setSaving] = useState<boolean | null>(null);

  const answer = async (escort: boolean) => {
    if (!jobId) return;
    setSaving(escort);
    try {
      await api.post(`/rep-portal/jobs/${jobId}/escort`, { escort });
      toast.success(t(escort ? "escort.savedYes" : "escort.savedNo").replace("{ref}", jobRef));
      onAnswered();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t("escort.failed"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={!!jobId} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5 text-sky-500" />
            {t("escort.title")}
          </DialogTitle>
          <DialogDescription>{t("escort.desc").replace("{ref}", jobRef)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              <b>{t("escort.yes")}</b> — {t("escort.yesHint")}
              {dropoff ? ` (${dropoff})` : ""}
            </span>
          </p>
          <p className="flex items-start gap-2">
            <Plane className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <b>{t("escort.no")}</b> — {t("escort.noHint")}
            </span>
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => answer(false)} disabled={saving !== null}>
            {t("escort.no")}
          </Button>
          <Button onClick={() => answer(true)} disabled={saving !== null}>
            {t("escort.yes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
