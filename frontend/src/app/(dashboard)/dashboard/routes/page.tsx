"use client";

// System Parameters › Routes — the "EN | AR" routes (JobServiceType) used by B2B jobs, the B2B Excel
// import, customer / supplier price lists and driver tariffs. Rules: docs/map/11-business-rules.md ›
// Routes; the RMF Hotels tab keeps the Marsa Alam hotel list (components/rmf-hotels-tab).
// An Access-style datasheet: type in the ✱ row (or press Down on the last row) to add a route,
// a row saves when you leave it, Save saves everything pending.
//  - A route in use (jobs, tariffs or prices) can't be deleted — deleting would strip it from those
//    jobs and wipe its prices. It is deactivated instead: hidden from dropdowns, history kept.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Power, Save, Search, Trash2, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataSheet, type DSColumn } from "@/components/data-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RmfHotelsTab } from "@/components/rmf-hotels-tab";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { SERVICE_TYPE_DROPDOWN_OPTIONS } from "@/lib/service-types";

interface ApiRoute {
  id: string;
  name: string;
  isActive: boolean;
  defaultServiceType?: string | null;
  fromZone?: { id: string } | null;
  toZone?: { id: string } | null;
  fromAirport?: { id: string } | null;
  toAirport?: { id: string } | null;
  usage?: { jobs: number; tariffs: number; customerPrices: number; supplierPrices: number };
}

/** One editable datasheet row. */
interface Row {
  key: string; // stable row key (the route id, or "new:n" until saved)
  id: string | null;
  en: string;
  ar: string;
  type: string;
  from: string; // "airport:<id>" | "zone:<id>" | ""
  to: string;
  isActive: boolean;
  usage: NonNullable<ApiRoute["usage"]>;
  dirty: boolean;
  error?: string;
  saving?: boolean;
}

type Filter = "active" | "incomplete" | "inactive" | "all";

const NO_USE = { jobs: 0, tariffs: 0, customerPrices: 0, supplierPrices: 0 };
const endValue = (a?: { id: string } | null, z?: { id: string } | null) => (a ? `airport:${a.id}` : z ? `zone:${z.id}` : "");
const complete = (r: Row) => !!r.type && !!r.from && !!r.to;
const inUse = (r: Row) => Object.values(r.usage).some((n) => n > 0);
const errText = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Not saved";

function toRow(r: ApiRoute): Row {
  const i = r.name.indexOf(" | ");
  return {
    key: r.id,
    id: r.id,
    en: i === -1 ? r.name : r.name.slice(0, i),
    ar: i === -1 ? "" : r.name.slice(i + 3),
    type: r.defaultServiceType ?? "",
    from: endValue(r.fromAirport, r.fromZone),
    to: endValue(r.toAirport, r.toZone),
    isActive: r.isActive,
    usage: r.usage ?? NO_USE,
    dirty: false,
  };
}

export default function RoutesPage() {
  const canUpsert = usePermission("driver-tariffs.upsert");
  const canDelete = usePermission("driver-tariffs.delete");

  const [rows, setRows] = useState<Row[]>([]);
  const [endOptions, setEndOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [savingAll, setSavingAll] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const newSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const [r, z, a] = await Promise.all([api.get("/job-service-types/manage"), api.get("/locations/zones"), api.get("/locations/airports")]);
      setRows(((r.data.data || []) as ApiRoute[]).map(toRow));
      const zones = (z.data.data || z.data || []) as { id: string; name: string; city?: { name: string } }[];
      const airports = (a.data.data || a.data || []) as { id: string; name: string; code: string }[];
      setEndOptions([
        ...airports.map((x) => ({ value: `airport:${x.id}`, label: `${x.code} – ${x.name} (airport)` })),
        ...zones.map((x) => ({ value: `zone:${x.id}`, label: x.city ? `${x.name} (${x.city.name})` : x.name })),
      ]);
    } catch {
      toast.error("Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.isActive).length,
      incomplete: rows.filter((r) => r.isActive && !complete(r)).length,
      inactive: rows.filter((r) => !r.isActive).length,
      all: rows.length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!r.id) return true; // unsaved new rows always show
      if (filter === "active" && !r.isActive) return false;
      if (filter === "inactive" && r.isActive) return false;
      if (filter === "incomplete" && (!r.isActive || complete(r))) return false;
      return !q || `${r.en} ${r.ar}`.toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  const patchRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Save one row (create or update). */
  const saveRow = useCallback(async (row: Row) => {
    if (!row.dirty || row.saving) return;
    const en = row.en.replace(/\s*\|\s*/g, " ").trim();
    const ar = row.ar.replace(/\s*\|\s*/g, " ").trim();
    if (!en) {
      patchRow(row.key, { error: "English name is required" });
      return;
    }
    const [ft, fid] = row.from ? row.from.split(":") : ["", ""];
    const [tt, tid] = row.to ? row.to.split(":") : ["", ""];
    const body = {
      name: ar ? `${en} | ${ar}` : en,
      defaultServiceType: row.type || null,
      fromZoneId: ft === "zone" ? fid : null,
      fromAirportId: ft === "airport" ? fid : null,
      toZoneId: tt === "zone" ? tid : null,
      toAirportId: tt === "airport" ? tid : null,
    };
    patchRow(row.key, { saving: true, error: undefined });
    try {
      const { data } = row.id ? await api.patch(`/job-service-types/${row.id}`, body) : await api.post("/job-service-types", body);
      const saved = data.data as ApiRoute;
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...toRow({ ...saved, usage: r.usage }), key: r.key } : r)));
    } catch (e) {
      patchRow(row.key, { saving: false, error: errText(e) });
    }
  }, []);

  const saveAll = async () => {
    setSavingAll(true);
    try {
      for (const r of rows.filter((x) => x.dirty)) await saveRow(r);
    } finally {
      setSavingAll(false);
    }
  };

  const setActive = async (r: Row, isActive: boolean) => {
    if (!r.id) return;
    try {
      await api.patch(`/job-service-types/${r.id}`, { isActive });
      patchRow(r.key, { isActive });
      toast.success(isActive ? "Route reactivated" : "Route deactivated — hidden from dropdowns, history kept");
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const deleteRows = async (targets: Row[]) => {
    const unsaved = targets.filter((r) => !r.id);
    const saved = targets.filter((r) => r.id);
    const used = saved.filter(inUse);
    if (used.length) toast.error(`In use, can't be deleted (deactivate instead): ${used.map((r) => r.en).join(", ")}`);
    const deletable = saved.filter((r) => !inUse(r));
    if (unsaved.length) setRows((rs) => rs.filter((r) => !unsaved.includes(r)));
    if (!deletable.length || !canDelete) return;
    if (!confirm(`Delete ${deletable.length} route(s) permanently? ${deletable.map((r) => r.en).join(", ")}`)) return;
    for (const r of deletable) {
      try {
        await api.delete(`/job-service-types/${r.id}`);
        setRows((rs) => rs.filter((x) => x.key !== r.key));
      } catch (e) {
        toast.error(`${r.en}: ${errText(e)}`);
      }
    }
  };

  const columns: DSColumn<Row>[] = useMemo(() => {
    const edit = () => canUpsert;
    return [
      { key: "en", title: "Route (English)", width: 230, get: (r) => r.en, editable: edit, placeholder: "e.g. ARR-HRG" },
      { key: "ar", title: "Arabic", width: 190, get: (r) => r.ar, editable: edit, placeholder: "مثال: وصول داخلي" },
      { key: "type", title: "Default type", width: 140, type: "select", options: SERVICE_TYPE_DROPDOWN_OPTIONS.map((o) => ({ value: o.value, label: o.label })), get: (r) => r.type, editable: edit },
      { key: "from", title: "From", width: 190, type: "select", options: endOptions, get: (r) => r.from, editable: edit },
      { key: "to", title: "To", width: 190, type: "select", options: endOptions, get: (r) => r.to, editable: edit },
      {
        key: "status",
        title: "Status",
        width: 120,
        type: "readonly",
        get: (r) => (r.isActive ? "Active" : "Inactive"),
        display: (r) =>
          !r.id ? (
            <span className="italic">new</span>
          ) : !r.isActive ? (
            <span>Inactive</span>
          ) : !complete(r) ? (
            <span className="text-amber-600 dark:text-amber-400" title="The B2B Excel import skips rows on a route without a default type, From and To.">
              Missing defaults
            </span>
          ) : (
            <span className="text-green-600 dark:text-green-400">Active</span>
          ),
      },
      {
        key: "usage",
        title: "Used by",
        width: 150,
        type: "readonly",
        get: () => "",
        display: (r) => {
          const u = r.usage;
          const prices = u.customerPrices + u.supplierPrices;
          return [u.jobs && `${u.jobs} jobs`, prices && `${prices} prices`, u.tariffs && `${u.tariffs} tariffs`].filter(Boolean).join(" · ") || "—";
        },
      },
      {
        key: "actions",
        title: "",
        width: 64,
        type: "readonly",
        align: "center",
        get: () => "",
        display: (r) =>
          r.saving ? (
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              {canUpsert && r.id && (
                <button type="button" title={r.isActive ? "Deactivate (hide from dropdowns, keep history)" : "Reactivate"} onClick={() => setActive(r, !r.isActive)}>
                  <Power className={r.isActive ? "h-3.5 w-3.5 text-amber-600" : "h-3.5 w-3.5 text-green-600"} />
                </button>
              )}
              {canDelete && (!r.id || !inUse(r)) && (
                <button type="button" title="Delete" onClick={() => deleteRows([r])}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              )}
            </span>
          ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endOptions, canUpsert, canDelete, rows]);

  const downloadTemplate = async () => {
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
  };

  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "incomplete", label: "Missing defaults" },
    { key: "inactive", label: "Inactive" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Routes" description="Routes used by B2B jobs, the Excel import, price lists and driver tariffs (English | Arabic)." />
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
              <Button size="sm" onClick={saveAll} disabled={savingAll || dirtyCount === 0} className="gap-1.5">
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save {dirtyCount ? `(${dirtyCount})` : ""}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="routes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="rmf">RMF Hotels</TabsTrigger>
        </TabsList>
        <TabsContent value="routes" className="space-y-4">
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

      <p className="text-xs text-muted-foreground">
        Arrows / Tab to move, type to edit, Enter for the next field. Down on the last row (✱) adds a route; a row saves when you
        leave it. The English part is the code the traffic sheets use — renaming it moves remembered sheet spellings with it.
        Default type, From and To are copied onto jobs by the B2B Excel import.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataSheet
          rows={visible}
          rowKey={(r) => r.key}
          columns={columns}
          maxHeight="70vh"
          onChange={(r, col, value) => patchRow(r.key, { [col]: value, dirty: true, error: undefined } as Partial<Row>)}
          onCreateRows={
            canUpsert
              ? (values) =>
                  setRows((rs) => [
                    ...rs,
                    ...values.map<Row>((v) => ({
                      key: `new:${++newSeq.current}`,
                      id: null,
                      en: v.en ?? "",
                      ar: v.ar ?? "",
                      type: v.type ?? "",
                      from: v.from ?? "",
                      to: v.to ?? "",
                      isActive: true,
                      usage: NO_USE,
                      dirty: true,
                    })),
                  ])
              : undefined
          }
          onRowLeave={canUpsert ? (r) => void saveRow(rows.find((x) => x.key === r.key) ?? r) : undefined}
          onDeleteRows={canDelete || canUpsert ? (rs) => void deleteRows(rs) : undefined}
          isDirty={(r) => r.dirty}
          rowError={(r) => r.error}
          rowClassName={(r) => !r.isActive && "opacity-60"}
          emptyText="No routes match"
        />
      )}
        </TabsContent>
        <TabsContent value="rmf">
          <RmfHotelsTab canEdit={canUpsert} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
