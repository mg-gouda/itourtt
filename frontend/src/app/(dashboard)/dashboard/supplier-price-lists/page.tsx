"use client";

// Supplier price lists (List A, B, C…): one price per route × car type.
// Suppliers are assigned to a list on their own page; supplier-car jobs are
// costed from it automatically (backend/src/supplier-price-lists).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";

interface PriceList {
  id: string;
  name: string;
  isDefaultForNew: boolean;
  isOwnCarList: boolean;
  itemCount: number;
  suppliers: { id: string; legalName: string; tradeName: string | null }[];
}
interface Grid {
  list: PriceList;
  columns: { header: string; vehicleType: string; vehicleTypeId: string }[];
  routes: { id: string; name: string }[];
  prices: { jobServiceTypeId: string; vehicleTypeId: string; price: number }[];
}

const cellKey = (r: string, v: string) => `${r}|${v}`;

export default function SupplierPriceListsPage() {
  const canEdit = usePermission("supplier-price-lists.edit");
  const [lists, setLists] = useState<PriceList[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const errMsg = (e: any) => e?.response?.data?.message || e?.message || "Request failed";

  const loadLists = useCallback(async () => {
    const { data } = await api.get("/supplier-price-lists");
    const ls: PriceList[] = data.data;
    setLists(ls);
    setActiveId((cur) => (cur && ls.some((l) => l.id === cur) ? cur : ls[0]?.id ?? ""));
  }, []);

  const loadGrid = useCallback(async (id: string) => {
    if (!id) { setGrid(null); return; }
    const { data } = await api.get(`/supplier-price-lists/${id}/grid`);
    setGrid(data.data);
    setEdits({});
  }, []);

  useEffect(() => { loadLists().catch((e) => toast.error(errMsg(e))); }, [loadLists]);
  useEffect(() => { loadGrid(activeId).catch((e) => toast.error(errMsg(e))); }, [activeId, loadGrid]);

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    grid?.prices.forEach((p) => m.set(cellKey(p.jobServiceTypeId, p.vehicleTypeId), p.price));
    return m;
  }, [grid]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (grid?.routes ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [grid, search]);

  const dirty = Object.keys(edits).length;
  const active = lists.find((l) => l.id === activeId);

  const save = async () => {
    if (!grid || dirty === 0) return;
    setBusy(true);
    try {
      const cells = Object.entries(edits).map(([k, v]) => {
        const [jobServiceTypeId, vehicleTypeId] = k.split("|");
        const n = Number(v);
        return { jobServiceTypeId, vehicleTypeId, price: v.trim() === "" || !(n > 0) ? null : n };
      });
      const { data } = await api.put(`/supplier-price-lists/${grid.list.id}/prices`, { cells });
      toast.success(`Saved ${data.data.saved} price(s)${data.data.cleared ? `, cleared ${data.data.cleared}` : ""}`);
      await Promise.all([loadGrid(grid.list.id), loadLists()]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const createList = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/supplier-price-lists", { name: newName.trim() });
      setNewName("");
      await loadLists();
      setActiveId(data.data.id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const setFlag = async (flag: "isDefaultForNew" | "isOwnCarList", value: boolean) => {
    if (!active) return;
    try {
      await api.patch(`/supplier-price-lists/${active.id}`, { [flag]: value });
      await loadLists();
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

  const exportAll = async () => {
    const res = await api.get("/supplier-price-lists/export", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "supplier-price-lists.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/supplier-price-lists/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = data.data;
      toast.success(`Imported ${r.lists.join(", ")}: ${r.pricesSaved} prices set, ${r.pricesCleared} cleared`);
      if (r.unmatchedOperations.length) {
        toast.warning(`Not matched to a route: ${r.unmatchedOperations.map((u: any) => u.operation).join(", ")}`, { duration: 15000 });
      }
      await loadLists();
      if (activeId) await loadGrid(activeId);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Price Lists"
        description="One price per route and car type. Each supplier is assigned one list on its page; supplier-car jobs are costed from it automatically."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportAll}><Download className="h-4 w-4 mr-1.5" />Export</Button>
        {canEdit && (
          <>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-1.5" />Import
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
          </>
        )}
        <span className="mx-1 h-5 w-px bg-border" />
        {lists.map((l) => (
          <Button key={l.id} size="sm" variant={l.id === activeId ? "default" : "outline"} onClick={() => setActiveId(l.id)}>
            {l.name}
            <span className="ml-1.5 text-xs opacity-70">{l.suppliers.length} suppliers</span>
          </Button>
        ))}
        {canEdit && (
          <div className="flex items-center gap-1.5 ml-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New list name" className="h-8 w-40" />
            <Button size="sm" variant="outline" onClick={createList} disabled={busy || !newName.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-4 rounded border p-3 text-sm">
          <div className="flex items-center gap-2">
            <Switch id="def" checked={active.isDefaultForNew} disabled={!canEdit} onCheckedChange={(v) => setFlag("isDefaultForNew", v)} />
            <Label htmlFor="def">Default for new suppliers</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="own" checked={active.isOwnCarList} disabled={!canEdit} onCheckedChange={(v) => setFlag("isOwnCarList", v)} />
            <Label htmlFor="own">Own cars are costed from this list (profit report)</Label>
          </div>
          <div className="text-muted-foreground">
            Suppliers: {active.suppliers.length ? active.suppliers.map((s) => s.tradeName || s.legalName).join(", ") : "none"}
          </div>
          {canEdit && (
            <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={deleteList}>
              <Trash2 className="h-4 w-4 mr-1" />Delete list
            </Button>
          )}
        </div>
      )}

      {grid && (
        <>
          <div className="flex items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search routes…" className="h-8 w-72" />
            <span className="text-xs text-muted-foreground">{grid.prices.length} prices · empty cell = no price (supplier jobs on that route get no automatic cost)</span>
            {canEdit && (
              <Button size="sm" className="ml-auto" onClick={save} disabled={busy || dirty === 0}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save {dirty > 0 ? `(${dirty})` : ""}
              </Button>
            )}
          </div>
          <div className="rounded border overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[320px]">Route</TableHead>
                  {grid.columns.map((c) => (
                    <TableHead key={c.vehicleTypeId} className="text-right w-28">
                      {c.header}
                      {c.header !== c.vehicleType && <div className="text-[10px] font-normal text-muted-foreground">{c.vehicleType}</div>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs" dir="auto">{r.name}</TableCell>
                    {grid.columns.map((c) => {
                      const k = cellKey(r.id, c.vehicleTypeId);
                      const saved = priceMap.get(k);
                      const val = edits[k] ?? (saved !== undefined ? String(saved) : "");
                      return (
                        <TableCell key={k} className="p-1">
                          <Input
                            type="number"
                            min={0}
                            value={val}
                            disabled={!canEdit}
                            onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
                            className={`h-7 text-right text-xs ${k in edits ? "border-amber-500" : ""}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {lists.length === 0 && <Badge variant="outline">No price lists yet — create one or import your Supplier R-T sheet.</Badge>}
    </div>
  );
}
