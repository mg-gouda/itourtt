"use client";

// Editable route × car-type price grid — shared by supplier price lists, customer prices, driver
// tariffs and driver tips. Rows are routes ("EN | AR"), columns the traffic sheets' car types; an
// empty cell means "no price". It is a DataSheet (Access-style datasheet): keyboard navigation,
// paste from Excel, and a row is saved when you leave it — the Save button saves everything pending.

import { useMemo, useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataSheet, type DSColumn } from "@/components/data-sheet";

export interface RoutePriceGridData {
  columns: { header: string; vehicleType: string; vehicleTypeId: string; note?: string }[];
  routes: { id: string; name: string }[];
  prices: { jobServiceTypeId: string; vehicleTypeId: string; price: number }[];
}
export interface RoutePriceCellEdit {
  jobServiceTypeId: string;
  vehicleTypeId: string;
  price: number | null;
}

type Route = RoutePriceGridData["routes"][number];
const cellKey = (r: string, v: string) => `${r}|${v}`;

export function RoutePriceGrid({
  data,
  canEdit,
  onSave,
  emptyHint = "empty cell = no price",
}: {
  data: RoutePriceGridData;
  canEdit: boolean;
  /** Persist cells; must throw on failure so the edits stay pending. */
  onSave: (cells: RoutePriceCellEdit[]) => Promise<void>;
  emptyHint?: string;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(new Set<string>());

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    data.prices.forEach((p) => m.set(cellKey(p.jobServiceTypeId, p.vehicleTypeId), p.price));
    return m;
  }, [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.routes.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [data, search]);
  const dirtyCount = Object.keys(edits).length;

  const toCells = (keys: string[]) =>
    keys.map((k) => {
      const [jobServiceTypeId, vehicleTypeId] = k.split("|");
      const v = (edits[k] ?? "").replace(/,/g, "").trim();
      const n = Number(v);
      return { jobServiceTypeId, vehicleTypeId, price: v === "" || !(n > 0) ? null : n };
    });

  /** Save the given cells; on success drop them from the pending edits, on failure keep them. */
  const persist = async (keys: string[], routeIds: string[]) => {
    const fresh = keys.filter((k) => !inFlight.current.has(k));
    if (!fresh.length) return;
    fresh.forEach((k) => inFlight.current.add(k));
    try {
      await onSave(toCells(fresh));
      setEdits((p) => {
        const n = { ...p };
        fresh.forEach((k) => delete n[k]);
        return n;
      });
      setErrors((p) => {
        const n = { ...p };
        routeIds.forEach((id) => delete n[id]);
        return n;
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || "Not saved";
      setErrors((p) => ({ ...p, ...Object.fromEntries(routeIds.map((id) => [id, msg])) }));
    } finally {
      fresh.forEach((k) => inFlight.current.delete(k));
    }
  };

  const saveRow = (r: Route) => {
    const keys = Object.keys(edits).filter((k) => k.startsWith(`${r.id}|`));
    if (keys.length) void persist(keys, [r.id]);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const keys = Object.keys(edits);
      await persist(keys, [...new Set(keys.map((k) => k.split("|")[0]))]);
    } finally {
      setSaving(false);
    }
  };

  const columns: DSColumn<Route>[] = useMemo(
    () => [
      { key: "route", title: "Route", width: 320, type: "readonly", get: (r) => r.name },
      ...data.columns.map<DSColumn<Route>>((c) => ({
        key: c.vehicleTypeId,
        width: 96,
        type: "number",
        align: "right",
        title: (
          <span className="leading-tight">
            {c.header}
            {c.header !== c.vehicleType && <span className="block text-[10px] font-normal text-muted-foreground">{c.vehicleType}</span>}
            {c.note && <span className="block text-[10px] font-normal text-muted-foreground">{c.note}</span>}
          </span>
        ),
        editable: () => canEdit,
        get: (r) => {
          const k = cellKey(r.id, c.vehicleTypeId);
          if (k in edits) return edits[k];
          const p = priceMap.get(k);
          return p !== undefined ? String(p) : "";
        },
        cellClassName: (r) => (cellKey(r.id, c.vehicleTypeId) in edits ? "bg-amber-50 dark:bg-amber-950/30" : undefined),
      })),
    ],
    [data.columns, edits, priceMap, canEdit],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search routes…" className="h-8 w-72" />
        <span className="text-xs text-muted-foreground">
          {data.prices.length} prices · {emptyHint} · arrows / Tab to move, type to edit, paste from Excel; a row saves when you leave it
        </span>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={saveAll} disabled={saving || dirtyCount === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
          </Button>
        )}
      </div>
      <DataSheet
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        onChange={(r, col, value) => {
          const k = cellKey(r.id, col);
          const saved = priceMap.get(k);
          setEdits((p) => {
            const n = { ...p };
            if ((saved !== undefined ? String(saved) : "") === value.trim()) delete n[k];
            else n[k] = value;
            return n;
          });
        }}
        onRowLeave={canEdit ? saveRow : undefined}
        isDirty={(r) => Object.keys(edits).some((k) => k.startsWith(`${r.id}|`))}
        rowError={(r) => errors[r.id]}
        emptyText="No routes match"
      />
    </div>
  );
}

/** Downloads an xlsx endpoint (blob) under the given file name. */
export async function downloadXlsx(get: () => Promise<{ data: Blob }>, fileName: string) {
  const res = await get();
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
