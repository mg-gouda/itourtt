"use client";

// Editable route × car-type price grid — shared by supplier price lists,
// customer prices and the driver-tip table. Rows are routes ("EN | AR"),
// columns the traffic sheets' car types; an empty cell means "no price".

import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const cellKey = (r: string, v: string) => `${r}|${v}`;

export function RoutePriceGrid({
  data,
  canEdit,
  onSave,
  emptyHint = "empty cell = no price",
}: {
  data: RoutePriceGridData;
  canEdit: boolean;
  onSave: (cells: RoutePriceCellEdit[]) => Promise<void>;
  emptyHint?: string;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    data.prices.forEach((p) => m.set(cellKey(p.jobServiceTypeId, p.vehicleTypeId), p.price));
    return m;
  }, [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.routes.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [data, search]);
  const dirty = Object.keys(edits).length;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        Object.entries(edits).map(([k, v]) => {
          const [jobServiceTypeId, vehicleTypeId] = k.split("|");
          const n = Number(v);
          return { jobServiceTypeId, vehicleTypeId, price: v.trim() === "" || !(n > 0) ? null : n };
        }),
      );
      setEdits({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search routes…" className="h-8 w-72" />
        <span className="text-xs text-muted-foreground">{data.prices.length} prices · {emptyHint}</span>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={save} disabled={saving || dirty === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save {dirty > 0 ? `(${dirty})` : ""}
          </Button>
        )}
      </div>
      <div className="rounded border overflow-auto max-h-[65vh]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[320px]">Route</TableHead>
              {data.columns.map((c) => (
                <TableHead key={c.vehicleTypeId} className="text-right w-28">
                  {c.header}
                  {c.header !== c.vehicleType && <div className="text-[10px] font-normal text-muted-foreground">{c.vehicleType}</div>}
                  {c.note && <div className="text-[10px] font-normal text-muted-foreground">{c.note}</div>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs" dir="auto">{r.name}</TableCell>
                {data.columns.map((c) => {
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
