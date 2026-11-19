"use client";

// System Parameters › Routes — the "EN | AR" routes (JobServiceType) used by B2B jobs, the B2B Excel
// import, customer / supplier price lists and driver tips. Rules: docs/map/11-business-rules.md › Routes.
//  - A route in use (jobs, tariffs, prices or tips) can't be deleted — deleting would strip it from
//    those jobs and wipe its prices. It is deactivated instead: hidden from dropdowns, history kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, Plus, Power, Search, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableCombobox } from "@/components/searchable-combobox";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { SERVICE_TYPE_DROPDOWN_OPTIONS, serviceTypeDropdownLabel } from "@/lib/service-types";

interface RouteRow {
  id: string;
  name: string;
  isActive: boolean;
  defaultServiceType?: string | null;
  fromZone?: { id: string; name: string } | null;
  toZone?: { id: string; name: string } | null;
  fromAirport?: { id: string; code: string; name: string } | null;
  toAirport?: { id: string; code: string; name: string } | null;
  usage: { jobs: number; tariffs: number; customerPrices: number; supplierPrices: number; tips: number };
}

interface Zone { id: string; name: string; city?: { name: string } }
interface Airport { id: string; name: string; code: string }

type Filter = "active" | "inactive" | "incomplete" | "all";

const endValue = (a?: { id: string } | null, z?: { id: string } | null) => (a ? `airport:${a.id}` : z ? `zone:${z.id}` : "");
const endLabel = (a?: { code: string } | null, z?: { name: string } | null) => (a ? `${a.code} airport` : z?.name ?? "—");
const splitName = (name: string) => {
  const i = name.indexOf(" | ");
  return i === -1 ? { en: name, ar: "" } : { en: name.slice(0, i), ar: name.slice(i + 3) };
};
const inUse = (r: RouteRow) => Object.values(r.usage).some((n) => n > 0);
const complete = (r: RouteRow) => !!r.defaultServiceType && !!(r.fromAirport || r.fromZone) && !!(r.toAirport || r.toZone);

export default function RoutesPage() {
  const canUpsert = usePermission("driver-tariffs.upsert");
  const canDelete = usePermission("driver-tariffs.delete");

  const [rows, setRows] = useState<RouteRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [defaultType, setDefaultType] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RouteRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Excel
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, z, a] = await Promise.all([
        api.get("/job-service-types/manage"),
        api.get("/locations/zones"),
        api.get("/locations/airports"),
      ]);
      setRows(r.data.data || []);
      setZones(z.data.data || z.data || []);
      setAirports(a.data.data || a.data || []);
    } catch {
      toast.error("Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const endItems = useMemo(
    () => [
      ...airports.map((a) => ({ value: `airport:${a.id}`, label: `${a.code} – ${a.name}`, sub: "Airport" })),
      ...zones.map((z) => ({ value: `zone:${z.id}`, label: z.name, sub: z.city?.name })),
    ],
    [airports, zones]
  );

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.isActive).length,
      inactive: rows.filter((r) => !r.isActive).length,
      incomplete: rows.filter((r) => r.isActive && !complete(r)).length,
      all: rows.length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "active" && !r.isActive) return false;
      if (filter === "inactive" && r.isActive) return false;
      if (filter === "incomplete" && (!r.isActive || complete(r))) return false;
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  function openAdd() {
    setEditing(null);
    setNameEn(""); setNameAr(""); setFromLoc(""); setToLoc(""); setDefaultType("");
    setFormOpen(true);
  }

  function openEdit(r: RouteRow) {
    const n = splitName(r.name);
    setEditing(r);
    setNameEn(n.en); setNameAr(n.ar);
    setFromLoc(endValue(r.fromAirport, r.fromZone));
    setToLoc(endValue(r.toAirport, r.toZone));
    setDefaultType(r.defaultServiceType ?? "");
    setFormOpen(true);
  }

  async function save() {
    const en = nameEn.trim().replace(/\s*\|\s*/g, " ");
    const ar = nameAr.trim().replace(/\s*\|\s*/g, " ");
    if (!en) return toast.error("English name is required");
    const [ft, fid] = fromLoc ? fromLoc.split(":") : ["", ""];
    const [tt, tid] = toLoc ? toLoc.split(":") : ["", ""];
    const body = {
      name: ar ? `${en} | ${ar}` : en,
      fromZoneId: ft === "zone" ? fid : null,
      fromAirportId: ft === "airport" ? fid : null,
      toZoneId: tt === "zone" ? tid : null,
      toAirportId: tt === "airport" ? tid : null,
      defaultServiceType: defaultType || null,
    };
    setSaving(true);
    try {
      if (editing) await api.patch(`/job-service-types/${editing.id}`, body);
      else await api.post("/job-service-types", body);
      toast.success(editing ? "Route updated" : "Route added");
      setFormOpen(false);
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(r: RouteRow, isActive: boolean) {
    setBusyId(r.id);
    try {
      await api.patch(`/job-service-types/${r.id}`, { isActive });
      toast.success(isActive ? "Route reactivated" : "Route deactivated — hidden from dropdowns, history kept");
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.delete(`/job-service-types/${deleteTarget.id}`);
      toast.success("Route deleted");
      setDeleteTarget(null);
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await api.get("/job-service-types/import/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "routes_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/job-service-types/import/excel", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const r = data.data;
      if (r.errors?.length) toast.warning(`${r.imported} imported, ${r.errors.length} skipped: ${r.errors.slice(0, 3).join("; ")}`);
      else toast.success(`${r.imported} routes imported`);
      load();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Import failed");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  const usageText = (r: RouteRow) => {
    const u = r.usage;
    const prices = u.customerPrices + u.supplierPrices + u.tips;
    return [u.jobs && `${u.jobs} jobs`, prices && `${prices} prices`, u.tariffs && `${u.tariffs} tariffs`].filter(Boolean).join(" · ") || "—";
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "incomplete", label: "Missing defaults" },
    { key: "inactive", label: "Inactive" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Routes"
          description="Routes used by B2B jobs, the Excel import, price lists and driver tips (English | Arabic)."
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
            <Download className="h-4 w-4" /> Template
          </Button>
          {canUpsert && (
            <>
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing} className="gap-1.5">
                <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import"}
              </Button>
              <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
              <Button size="sm" onClick={openAdd} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add route
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search routes (English or Arabic)…" className="pl-9 pr-9" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="inline-flex flex-wrap rounded-md border border-border p-0.5">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "ghost"} className="h-8 px-3 text-xs" onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key]})
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden border-border p-0">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Default type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Used by</TableHead>
                {(canUpsert || canDelete) && <TableHead className="w-32 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : visible.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No routes match.</TableCell></TableRow>
              ) : (
                visible.map((r) => {
                  const n = splitName(r.name);
                  return (
                    <TableRow key={r.id} className={r.isActive ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="font-medium">{n.en}</div>
                        {n.ar && <div dir="rtl" className="text-right text-xs text-muted-foreground">{n.ar}</div>}
                        <div className="mt-0.5 flex gap-1">
                          {!r.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                          {r.isActive && !complete(r) && (
                            <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-600 dark:text-amber-400" title="The B2B Excel import skips rows on a route without a default type, From and To.">
                              Missing defaults
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.defaultServiceType ? serviceTypeDropdownLabel(r.defaultServiceType) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{endLabel(r.fromAirport, r.fromZone)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{endLabel(r.toAirport, r.toZone)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{usageText(r)}</TableCell>
                      {(canUpsert || canDelete) && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canUpsert && (
                              <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canUpsert && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={r.isActive ? "Deactivate (hide from dropdowns, keep history)" : "Reactivate"}
                                disabled={busyId === r.id}
                                onClick={() => setActive(r, !r.isActive)}
                              >
                                <Power className={r.isActive ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-green-600"} />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title={inUse(r) ? "In use — deactivate it instead" : "Delete"}
                                disabled={inUse(r) || busyId === r.id}
                                onClick={() => setDeleteTarget(r)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / edit */}
      <Dialog open={formOpen} onOpenChange={(o) => !o && !saving && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit route" : "Add route"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>English name <span className="text-destructive">*</span></Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. ARR-HRG" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Arabic name</Label>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مثال: وصول داخلي" />
            </div>
            <p className="text-xs text-muted-foreground">
              Saved as “English | Arabic”. The English part is the code the traffic sheets use (Excel import,
              price lists, driver tips) — renaming it moves remembered sheet spellings with it.
            </p>
            <div className="space-y-1.5">
              <Label>Default type</Label>
              <SearchableCombobox items={SERVICE_TYPE_DROPDOWN_OPTIONS} value={defaultType} onChange={setDefaultType} placeholder="Select type…" searchPlaceholder="Search…" />
            </div>
            <div className="space-y-1.5">
              <Label>From <span className="text-xs text-muted-foreground">(airport or zone)</span></Label>
              <SearchableCombobox items={endItems} value={fromLoc} onChange={setFromLoc} placeholder="Select airport or zone…" searchPlaceholder="Search airports and zones…" />
            </div>
            <div className="space-y-1.5">
              <Label>To <span className="text-xs text-muted-foreground">(airport or zone)</span></Label>
              <SearchableCombobox items={endItems} value={toLoc} onChange={setToLoc} placeholder="Select airport or zone…" searchPlaceholder="Search airports and zones…" />
            </div>
            <p className="text-xs text-muted-foreground">Default type, From and To are copied onto jobs by the B2B Excel import; a route missing any of them is skipped there.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (unused routes only) */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete route?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> has no jobs, prices or tips and will be removed permanently.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busyId === deleteTarget?.id}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
