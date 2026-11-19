"use client";

// Supplier price lists — one list per season / price level, with a validity range.
// Rules: docs/map/11-business-rules.md › Supplier price lists.
//  - An ended list is read-only (kept for review); extend its end date to change it.
//  - Suppliers move between lists from a date (backdated too): their jobs are re-costed from then;
//    posted (settled) costs are left and listed for a manual adjustment.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, Download, Lock, Plus, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoutePriceGrid, RoutePriceGridData, RoutePriceCellEdit, downloadXlsx } from "@/components/route-price-grid";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { useAuthStore } from "@/stores/auth-store";
import { localDateStr } from "@/lib/utils";
import { RecalcReportDialog, type RecalcReport } from "@/components/recalc-report-dialog";

interface PriceList {
  id: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  status: "CURRENT" | "ENDED" | "UPCOMING";
  readOnly: boolean;
  isDefaultForNew: boolean;
  isOwnCarList: boolean;
  itemCount: number;
  suppliers: { id: string; legalName: string; tradeName: string | null }[];
}
interface Grid extends RoutePriceGridData {
  list: PriceList;
}
interface Alert {
  listId: string;
  name: string;
  endedOn: string;
  suppliers: string[];
  ownCar: boolean;
}
interface SupplierRow {
  id: string;
  legalName: string;
  tradeName: string | null;
  priceList?: { id: string; name: string } | null;
}

const errMsg = (e: unknown) =>
  (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || "Request failed";

export default function SupplierPriceListsPage() {
  const canEdit = usePermission("supplier-price-lists.edit");
  const canAlerts = usePermission("supplier-price-lists.alerts");
  const isAdmin = useAuthStore((s) => s.user?.role === "ADMIN");
  const [lists, setLists] = useState<PriceList[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RecalcReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // New list
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFrom, setNewFrom] = useState(() => localDateStr(new Date()));
  const [newTo, setNewTo] = useState("");

  // Move suppliers
  const [moveOpen, setMoveOpen] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<SupplierRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveFrom, setMoveFrom] = useState(() => localDateStr(new Date()));
  const [supplierSearch, setSupplierSearch] = useState("");

  const loadLists = useCallback(async () => {
    const { data } = await api.get("/supplier-price-lists");
    const ls: PriceList[] = data.data;
    setLists(ls);
    setActiveId((cur) => (cur && ls.some((l) => l.id === cur) ? cur : ls.find((l) => l.status === "CURRENT")?.id ?? ls[0]?.id ?? ""));
  }, []);

  const loadGrid = useCallback(async (id: string) => {
    if (!id) {
      setGrid(null);
      return;
    }
    const { data } = await api.get(`/supplier-price-lists/${id}/grid`);
    setGrid(data.data);
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const { data } = await api.get("/supplier-price-lists/alerts");
      setAlerts(data.data || []);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    loadLists().catch((e) => toast.error(errMsg(e)));
    loadAlerts();
  }, [loadLists, loadAlerts]);
  useEffect(() => {
    loadGrid(activeId).catch((e) => toast.error(errMsg(e)));
  }, [activeId, loadGrid]);

  const active = lists.find((l) => l.id === activeId);
  const refresh = async () => {
    await Promise.all([loadLists(), loadAlerts(), activeId ? loadGrid(activeId) : Promise.resolve()]);
  };

  const savePrices = async (cells: RoutePriceCellEdit[]) => {
    if (!grid) return;
    try {
      const { data } = await api.put(`/supplier-price-lists/${grid.list.id}/prices`, { cells });
      const rc = data.data.recalc;
      toast.success(`Saved ${data.data.saved} price(s)${data.data.cleared ? `, cleared ${data.data.cleared}` : ""} · ${rc.costed} job(s) re-costed`);
      // Rows save as you leave them: only interrupt when a posted cost is affected.
      if (rc.postedDifferences.length) setReport(rc);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
      throw e; // the grid keeps the edits pending
    }
  };

  const createList = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/supplier-price-lists", { name: newName.trim(), validFrom: newFrom, validTo: newTo || null });
      setNewOpen(false);
      setNewName("");
      setNewTo("");
      await loadLists();
      setActiveId(data.data.id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const patchList = async (body: Record<string, unknown>) => {
    if (!active) return;
    try {
      await api.patch(`/supplier-price-lists/${active.id}`, body);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const deleteList = async () => {
    if (!active || !confirm(`Delete price list "${active.name}" and all its prices?`)) return;
    try {
      await api.delete(`/supplier-price-lists/${active.id}`);
      setActiveId("");
      await loadLists();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const openMove = async () => {
    setPicked(new Set());
    setSupplierSearch("");
    setMoveFrom(active && active.validFrom > localDateStr(new Date()) ? active.validFrom : localDateStr(new Date()));
    setMoveOpen(true);
    try {
      const { data } = await api.get("/suppliers", { params: { limit: 500 } });
      const rows: SupplierRow[] = data.data?.data || data.data || [];
      setAllSuppliers(rows.sort((a, b) => (a.tradeName || a.legalName).localeCompare(b.tradeName || b.legalName)));
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const moveSuppliers = async () => {
    if (!active || picked.size === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post("/supplier-price-lists/move", { supplierIds: [...picked], priceListId: active.id, from: moveFrom });
      toast.success(`${data.data.moved} supplier(s) on ${active.name} from ${moveFrom}`);
      setMoveOpen(false);
      setReport(data.data.recalc);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => downloadXlsx(() => api.get("/supplier-price-lists/export", { responseType: "blob" }), "supplier-price-lists.xlsx");

  const importFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/supplier-price-lists/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = data.data;
      toast.success(`Imported ${r.lists.join(", ")}: ${r.pricesSaved} prices set, ${r.pricesCleared} cleared`);
      if (r.readOnlyLists?.length) toast.warning(`Skipped ended (read-only) lists: ${r.readOnlyLists.join(", ")}`, { duration: 15000 });
      if (r.unmatchedOperations.length) {
        toast.warning(`Not matched to a route: ${r.unmatchedOperations.map((u: { operation: string }) => u.operation).join(", ")}`, { duration: 15000 });
      }
      setReport(r.recalc);
      await refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const visibleSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return allSuppliers.filter((s) => !q || `${s.tradeName ?? ""} ${s.legalName} ${s.priceList?.name ?? ""}`.toLowerCase().includes(q));
  }, [allSuppliers, supplierSearch]);

  const statusBadge = (l: PriceList) =>
    l.status === "ENDED" ? (
      <Badge variant="outline" className="gap-1 border-red-400 text-red-600 dark:text-red-400"><Lock className="h-3 w-3" />Ended · read-only</Badge>
    ) : l.status === "UPCOMING" ? (
      <Badge variant="outline" className="border-sky-400 text-sky-600 dark:text-sky-400">Starts {l.validFrom}</Badge>
    ) : (
      <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Current</Badge>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Price Lists"
        description="One list per season or price level, with a validity range. Suppliers move between lists from a date; their jobs are re-costed from then."
      />

      {(isAdmin || canAlerts) && alerts.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {alerts.map((a) => (
            <div key={a.listId} className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <b>{a.name}</b> ended on {a.endedOn} but is still used
                {a.suppliers.length > 0 && <> by {a.suppliers.length} supplier(s)</>}
                {a.ownCar && <>{a.suppliers.length ? " and" : ""} for own cars</>} — extend its end date or move them to a new list.
              </span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setActiveId(a.listId)}>Open</Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportAll}><Download className="mr-1.5 h-4 w-4" />Export</Button>
        {canEdit && (
          <>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1.5 h-4 w-4" />Import
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New list</Button>
          </>
        )}
        <span className="mx-1 h-5 w-px bg-border" />
        {lists.map((l) => (
          <Button key={l.id} size="sm" variant={l.id === activeId ? "default" : "outline"} onClick={() => setActiveId(l.id)} className={l.status === "ENDED" ? "opacity-70" : ""}>
            {l.status === "ENDED" && <Lock className="mr-1 h-3 w-3" />}
            {l.name}
            <span className="ml-1.5 text-xs opacity-70">{l.suppliers.length}</span>
          </Button>
        ))}
      </div>

      {active && (
        <div className="space-y-3 rounded border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-semibold">{active.name}</span>
            {statusBadge(active)}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Valid from</Label>
              <Input type="date" className="h-8 w-36" value={active.validFrom} disabled={!canEdit} onChange={(e) => e.target.value && patchList({ validFrom: e.target.value })} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">to</Label>
              <Input type="date" className="h-8 w-36" value={active.validTo ?? ""} disabled={!canEdit} onChange={(e) => patchList({ validTo: e.target.value || null })} />
              {!active.validTo && <span className="text-xs text-muted-foreground">(until changed)</span>}
            </div>
            {canEdit && active.status !== "ENDED" && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={openMove}>
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                Move suppliers to this list…
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="def" checked={active.isDefaultForNew} disabled={!canEdit || active.readOnly} onCheckedChange={(v) => patchList({ isDefaultForNew: v })} />
              <Label htmlFor="def">Default for new suppliers</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="own" checked={active.isOwnCarList} disabled={!canEdit || active.readOnly} onCheckedChange={(v) => patchList({ isOwnCarList: v })} />
              <Label htmlFor="own">Own cars are costed from this list in its period</Label>
            </div>
            {canEdit && active.suppliers.length === 0 && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={deleteList}>
                <Trash2 className="mr-1 h-4 w-4" />Delete list
              </Button>
            )}
          </div>
          <div className="text-muted-foreground">
            On this list today: {active.suppliers.length ? active.suppliers.map((s) => s.tradeName || s.legalName).join(", ") : "no suppliers"}
          </div>
          {active.readOnly && (
            <p className="text-xs text-muted-foreground">
              This list has ended and is kept read-only for review. Suppliers still on it keep its prices until they are moved. Extend the end date to change its prices.
            </p>
          )}
        </div>
      )}

      {grid && (
        <RoutePriceGrid
          key={`${grid.list.id}-${active?.readOnly}`}
          data={grid}
          canEdit={canEdit && !active?.readOnly}
          onSave={savePrices}
          emptyHint="empty cell = no price (supplier jobs on that route get no automatic cost)"
        />
      )}
      {lists.length === 0 && <Badge variant="outline">No price lists yet — create one or import your Supplier R-T sheet.</Badge>}

      {/* New list */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New price list</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. List A Summer 2027" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid from</Label>
                <Input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid to (optional)</Label>
                <Input type="date" value={newTo} onChange={(e) => setNewTo(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Then fill its prices (grid or Import) and move suppliers onto it from the date it starts.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createList} disabled={busy || !newName.trim() || !newFrom}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move suppliers */}
      <Dialog open={moveOpen} onOpenChange={(o) => !o && !busy && setMoveOpen(false)}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>Move suppliers to {active?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From date (can be in the past)</Label>
              <Input type="date" value={moveFrom} onChange={(e) => setMoveFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <Input placeholder="Search suppliers or lists…" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} className="h-9 flex-1" />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{picked.size} selected</span>
            <button
              className="underline"
              onClick={() => setPicked((p) => (visibleSuppliers.every((s) => p.has(s.id)) ? new Set() : new Set(visibleSuppliers.map((s) => s.id))))}
            >
              {visibleSuppliers.length && visibleSuppliers.every((s) => picked.has(s.id)) ? "Clear" : "Select all shown"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded border">
            {visibleSuppliers.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-muted">
                <Checkbox
                  checked={picked.has(s.id)}
                  onCheckedChange={(on) =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (on) n.add(s.id);
                      else n.delete(s.id);
                      return n;
                    })
                  }
                />
                <span className="flex-1">{s.tradeName || s.legalName}</span>
                <span className="text-xs text-muted-foreground">{s.priceList?.name ?? "no list"}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Their supplier-car jobs from this date are re-costed on {active?.name}. Posted (settled) costs are not changed — you get a list of any that differ.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={moveSuppliers} disabled={busy || picked.size === 0 || !moveFrom}>Move {picked.size || ""}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecalcReportDialog report={report} onClose={() => setReport(null)} />
    </div>
  );
}
