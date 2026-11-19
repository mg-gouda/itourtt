"use client";

// System Parameters › Driver Tariffs — two route × car-type grids in the traffic sheets' layout:
//  - Driver tariffs: what a driver earns per trip (one table for every driver).
//  - Driver tips: the tip billed to customers on their invoices (one table for every customer).
// Rules: docs/map/11-business-rules.md › Driver tariffs and driver tips.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Calculator, Download, Loader2, Settings2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoutePriceGrid, downloadXlsx, type RoutePriceCellEdit, type RoutePriceGridData } from "@/components/route-price-grid";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { useAuthStore } from "@/stores/auth-store";
import { localDateStr } from "@/lib/utils";

type Kind = "tariffs" | "tips";

const ENDPOINTS: Record<Kind, { grid: string; save: string; export: string; import: string; file: string; label: string }> = {
  tariffs: {
    grid: "/driver-tariffs/grid",
    save: "/driver-tariffs/grid",
    export: "/driver-tariffs/export",
    import: "/driver-tariffs/import",
    file: "driver-tariffs.xlsx",
    label: "tariff",
  },
  tips: {
    grid: "/route-prices/driver-tips",
    save: "/route-prices/driver-tips",
    export: "/route-prices/driver-tips/export",
    import: "/route-prices/driver-tips/import",
    file: "driver-tips.xlsx",
    label: "tip",
  },
};

export default function DriverTariffsPage() {
  const canEdit = usePermission("driver-tariffs.upsert");
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const [grids, setGrids] = useState<Partial<Record<Kind, RoutePriceGridData>>>({});
  const [tab, setTab] = useState<Kind>("tariffs");

  // Recalculate driver fees (completed jobs in a date range)
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [to, setTo] = useState(() => localDateStr(new Date()));
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async (kind: Kind) => {
    try {
      const { data } = await api.get(ENDPOINTS[kind].grid);
      setGrids((g) => ({ ...g, [kind]: data.data }));
    } catch {
      toast.error(`Failed to load driver ${ENDPOINTS[kind].label}s`);
    }
  }, []);

  useEffect(() => {
    load("tariffs");
    load("tips");
  }, [load]);

  async function save(kind: Kind, cells: RoutePriceCellEdit[]) {
    try {
      const { data } = await api.put(ENDPOINTS[kind].save, { cells });
      toast.success(`Saved ${data.data.saved} ${ENDPOINTS[kind].label}(s)${data.data.cleared ? `, cleared ${data.data.cleared}` : ""}`);
      await load(kind);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save");
      throw e; // the grid keeps the edits pending
    }
  }

  async function importSheet(kind: Kind, file?: File) {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(ENDPOINTS[kind].import, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = data.data;
      toast.success(`Imported: ${r.pricesSaved} set, ${r.pricesCleared} cleared`);
      const missing = (r.unmatchedOperations ?? []).map((u: { operation: string }) => u.operation);
      if (missing.length) toast.warning(`Routes not found: ${missing.join(", ")}`, { duration: 20000 });
      await load(kind);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Import failed");
    }
  }

  async function recalculate() {
    setRecalculating(true);
    try {
      const { data } = await api.post("/traffic-jobs/recalculate-driver-fees", { from, to });
      const r = data.data;
      toast.success(`Driver fees: ${r.created} created, ${r.repriced} re-priced, ${r.skipped} left as they were`);
      setRecalcOpen(false);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Recalculation failed");
    } finally {
      setRecalculating(false);
    }
  }

  const toolbar = (kind: Kind) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {kind === "tariffs"
          ? "What a driver earns per trip: the job's route × the car's type. Same for every driver."
          : "The tip billed to customers on their invoices. Same for every customer."}
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => downloadXlsx(() => api.get(ENDPOINTS[kind].export, { responseType: "blob" }), ENDPOINTS[kind].file)}>
          <Download className="mr-1.5 h-4 w-4" />
          Export
        </Button>
        {canEdit && (
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { importSheet(kind, e.target.files?.[0]); e.target.value = ""; }} />
            <span className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm">
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </span>
          </label>
        )}
        {kind === "tariffs" && isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setRecalcOpen(true)}>
            <Calculator className="mr-1.5 h-4 w-4" />
            Recalculate driver fees
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Driver Tariffs" description="Driver trip fees and driver tips, by route and car type." />
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/routes">
            <Settings2 className="mr-1.5 h-4 w-4" />
            Routes
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)} className="space-y-3">
        <TabsList>
          <TabsTrigger value="tariffs">Driver Tariffs</TabsTrigger>
          <TabsTrigger value="tips">Driver Tips</TabsTrigger>
        </TabsList>
        {(["tariffs", "tips"] as Kind[]).map((kind) => (
          <TabsContent key={kind} value={kind} className="space-y-3">
            {toolbar(kind)}
            {grids[kind] ? (
              <RoutePriceGrid
                data={grids[kind]!}
                canEdit={canEdit}
                onSave={(cells) => save(kind, cells)}
                emptyHint={kind === "tariffs" ? "empty cell = no tariff (fee 0)" : "empty cell = no tip"}
              />
            ) : (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={recalcOpen} onOpenChange={(o) => !o && !recalculating && setRecalcOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recalculate driver fees</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            For completed jobs in this period: creates missing trip fees and re-prices unposted ones from the
            tariffs above. Posted fees, fees edited by hand and complaint deductions are left as they are.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecalcOpen(false)} disabled={recalculating}>Cancel</Button>
            <Button onClick={recalculate} disabled={recalculating || !from || !to} className="gap-1.5">
              {recalculating && <Loader2 className="h-4 w-4 animate-spin" />}
              Recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
