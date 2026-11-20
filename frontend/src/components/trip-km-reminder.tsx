"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gauge } from "lucide-react";

interface Summary {
  date: string;
  trips: number;
  flagged: number;
  notExported: number;
  totalKm: number;
  missingReadings: number;
}

const KEY = "tripKmReminderShown";

/**
 * Morning pop-up for the Transportation Accountant (permission trip-km.reminder): the first time
 * they open the system after 08:00 Cairo, yesterday's odometer readings to check and export to Odoo.
 * Once per day per browser (dismissing counts).
 */
export function TripKmReminder() {
  const allowed = usePermission("trip-km.reminder");
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!allowed) return;
    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
    const hour = Number(now.toLocaleString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }));
    if (hour < 8) return;
    try {
      if (localStorage.getItem(KEY) === today) return;
    } catch {
      /* storage blocked: show it */
    }
    api
      .get("/trip-km/summary")
      .then(({ data }) => setSummary(data.data))
      .catch(() => {});
  }, [allowed]);

  const close = () => {
    try {
      localStorage.setItem(KEY, new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }));
    } catch {
      /* ignore */
    }
    setSummary(null);
  };

  if (!summary) return null;
  const day = new Date(`${summary.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Yesterday&apos;s trip kilometres
          </DialogTitle>
          <DialogDescription>{day} — check the odometer readings and export them to Odoo.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border p-3">
            <div className="text-2xl font-bold">{summary.trips}</div>
            <div className="text-muted-foreground">trips read</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-2xl font-bold">{summary.totalKm.toLocaleString()}</div>
            <div className="text-muted-foreground">km driven</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className={`text-2xl font-bold ${summary.flagged ? "text-amber-600" : ""}`}>{summary.flagged}</div>
            <div className="text-muted-foreground">to check</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-2xl font-bold">{summary.notExported}</div>
            <div className="text-muted-foreground">not exported yet</div>
          </div>
        </div>
        {summary.missingReadings > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {summary.missingReadings} completed job(s) in owned cars have no odometer reading.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Later
          </Button>
          <Button
            onClick={() => {
              close();
              router.push(`/dashboard/trip-km?from=${summary.date}&to=${summary.date}`);
            }}
          >
            Open &amp; export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
