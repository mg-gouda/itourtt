"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, Plus, Download, Upload, Pencil, Save, Trash2, Copy, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { usePermission } from "@/hooks/use-permission";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Zone   { id: string; name: string }
interface VType  { id: string; name: string; seatCapacity: number }

interface PriceRow {
  id: string;
  serviceType: string;
  transferType: string;
  fromZoneId: string;
  toZoneId: string;
  vehicleTypeId: string;
  price: number;
  currency: string;
  fromZone?: { name: string };
  toZone?: { name: string };
  vehicleType?: { name: string };
}

interface EditState {
  serviceTypes: string[];   // multi for new rows, single for edits
  transferType: string;
  fromZoneId: string;
  toZoneId: string;
  vehicleTypeId: string;
  price: string;
  currency: string;
}

const CURRENCIES  = ["EGP", "USD", "EUR", "GBP", "SAR"];
const SERVICE_OPTS = [
  { value: "ARR", label: "Arrival" },
  { value: "DEP", label: "Departure" },
  { value: "CITY_TO_CITY", label: "City-to-City" },
  { value: "TWO_WAY_TRANSFER", label: "2-Way (override)" },
];
// Label + colour per service type. 2-Way is an OPTIONAL explicit round-trip
// price; leave it unset and the quote sums the Arrival + Departure legs.
const SERVICE_META: Record<string, { label: string; badge: string; on: string }> = {
  ARR:              { label: "Arrival",        badge: "bg-green-100 text-green-700",  on: "bg-green-100 border-green-400 text-green-700" },
  DEP:              { label: "Departure",      badge: "bg-blue-100 text-blue-700",    on: "bg-blue-100 border-blue-400 text-blue-700" },
  CITY_TO_CITY:     { label: "City-to-City",   badge: "bg-teal-100 text-teal-700",    on: "bg-teal-100 border-teal-400 text-teal-700" },
  TWO_WAY_TRANSFER: { label: "2-Way",          badge: "bg-orange-100 text-orange-700", on: "bg-orange-100 border-orange-400 text-orange-700" },
};
const TRANSFER_OPTS = [
  { value: "PRIVATE", label: "Private" },
  { value: "SHARED",  label: "Shared"  },
];

const BLANK_EDIT: EditState = {
  serviceTypes: [],
  transferType: "PRIVATE",
  fromZoneId: "",
  toZoneId: "",
  vehicleTypeId: "",
  price: "",
  currency: "EGP",
};

// ─── Badge helpers ───────────────────────────────────────────────────────────

function ServiceBadge({ type }: { type: string }) {
  const meta = SERVICE_META[type] ?? { label: type, badge: "bg-gray-100 text-gray-700", on: "" };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function TransferBadge({ type }: { type: string }) {
  const cls = type === "PRIVATE"
    ? "bg-purple-100 text-purple-700"
    : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {type === "PRIVATE" ? "Private" : "Shared"}
    </span>
  );
}

// ─── Multi-select service type ───────────────────────────────────────────────

function ServiceTypeMulti({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex gap-1">
      {SERVICE_OPTS.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => toggle(v)}
          className={[
            "rounded px-2 py-0.5 text-[11px] font-semibold border transition",
            value.includes(v)
              ? (SERVICE_META[v]?.on ?? "bg-gray-100 border-gray-400 text-gray-700")
              : "bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-400",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Action icon button ──────────────────────────────────────────────────────

function ActionBtn({
  icon: Icon, tooltip, onClick, variant = "ghost", disabled,
}: {
  icon: React.ElementType;
  tooltip: string;
  onClick: () => void;
  variant?: "ghost" | "danger" | "primary";
  disabled?: boolean;
}) {
  const color = variant === "danger" ? "hover:text-red-600 hover:bg-red-50"
              : variant === "primary" ? "hover:text-blue-600 hover:bg-blue-50"
              : "hover:text-gray-700 hover:bg-gray-100";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={`flex h-7 w-7 items-center justify-center rounded text-gray-400 transition disabled:opacity-30 ${color}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ─── Inline select cell ──────────────────────────────────────────────────────

function CellSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-full border-0 bg-transparent p-0 text-xs shadow-none focus:ring-1 focus:ring-blue-400">
        <SelectValue placeholder={placeholder ?? "—"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PublicPricesPage() {
  const canEdit   = usePermission("public-prices.bulk");
  const canDelete = usePermission("public-prices.delete");

  const [rows,      setRows]      = useState<PriceRow[]>([]);
  const [zones,     setZones]     = useState<Zone[]>([]);
  const [vTypes,    setVTypes]    = useState<VType[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState<string | null>(null);   // null = no edit, "new" = add row
  const [editState, setEditState] = useState<EditState>(BLANK_EDIT);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prRes, vtRes, zRes] = await Promise.all([
        api.get("/public-prices"),
        api.get("/vehicles/types"),
        api.get("/locations/zones"),
      ]);
      setRows(
        (prRes.data.data || prRes.data || []).map((r: any) => ({
          ...r,
          price: Number(r.price),
        }))
      );
      setVTypes(vtRes.data.data || vtRes.data || []);
      setZones(zRes.data.data || zRes.data || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Helpers ───────────────────────────────────────────────

  const zoneName   = (id: string) => zones.find((z) => z.id === id)?.name  ?? id;
  const vtypeName  = (id: string) => vTypes.find((v) => v.id === id)?.name ?? id;
  const zoneOpts   = zones.map((z) => ({ value: z.id, label: z.name }));
  const vtypeOpts  = vTypes.map((v) => ({ value: v.id, label: v.name }));

  const setF = (k: keyof EditState, v: EditState[typeof k]) =>
    setEditState((s) => ({ ...s, [k]: v }));

  const startEdit = (row: PriceRow) => {
    setEditId(row.id);
    setEditState({
      serviceTypes: [row.serviceType],
      transferType: row.transferType,
      fromZoneId:   row.fromZoneId,
      toZoneId:     row.toZoneId,
      vehicleTypeId: row.vehicleTypeId,
      price:        String(row.price),
      currency:     row.currency,
    });
  };

  const startNew = () => {
    setEditId("new");
    setEditState(BLANK_EDIT);
  };

  const cancelEdit = () => { setEditId(null); };

  // ── Save (edit existing row) ───────────────────────────────

  const saveEdit = async (rowId: string) => {
    if (!editState.fromZoneId || !editState.toZoneId || !editState.vehicleTypeId || !editState.price) {
      toast.error("Fill all required fields"); return;
    }
    setSaving(true);
    try {
      await api.patch(`/public-prices/${rowId}`, {
        serviceType:  editState.serviceTypes[0],
        transferType: editState.transferType,
        fromZoneId:   editState.fromZoneId,
        toZoneId:     editState.toZoneId,
        vehicleTypeId: editState.vehicleTypeId,
        price:        Number(editState.price),
        currency:     editState.currency,
      });
      toast.success("Saved");
      setEditId(null);
      await fetchAll();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Add new rows ───────────────────────────────────────────

  const saveNew = async () => {
    const { serviceTypes, transferType, fromZoneId, toZoneId, vehicleTypeId, price, currency } = editState;
    if (!serviceTypes.length || !fromZoneId || !toZoneId || !vehicleTypeId || !price) {
      toast.error("Fill all required fields"); return;
    }
    setSaving(true);
    try {
      await api.post("/public-prices/bulk", {
        items: serviceTypes.map((st) => ({
          serviceType:  st,
          transferType,
          fromZoneId,
          toZoneId,
          vehicleTypeId,
          price: Number(price),
          currency,
        })),
      });
      toast.success(`${serviceTypes.length} row(s) saved`);
      setEditId(null);
      await fetchAll();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Copy row ──────────────────────────────────────────────

  const copyRow = (row: PriceRow) => {
    setEditId("new");
    setEditState({
      serviceTypes: [row.serviceType],
      transferType: row.transferType,
      fromZoneId:   row.fromZoneId,
      toZoneId:     row.toZoneId,
      vehicleTypeId: row.vehicleTypeId,
      price:        String(row.price),
      currency:     row.currency,
    });
  };

  // ── Delete ────────────────────────────────────────────────

  const deleteRow = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/public-prices/${id}`);
      toast.success("Deleted");
      await fetchAll();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  // ── Excel template download (generated server-side with dropdowns) ──

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/public-prices/export/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement("a");
      a.href     = url;
      a.download = "public_prices_template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  };

  // ── Excel import ──────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets["Prices"] ?? wb.Sheets[wb.SheetNames[0]];
      const rawParsed = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: "" });
      // Strip asterisks from header keys (template uses "service_type*" etc.)
      const raw = rawParsed.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/\*/g, ""), v]))
      ) as Record<string, string | number>[];

      const items: any[] = [];
      const errors: string[] = [];

      raw.forEach((r, i) => {
        const row = i + 2;
        const st  = String(r["service_type"]  ?? "").trim().toUpperCase();
        const tt  = String(r["transfer_type"] ?? "").trim().toUpperCase();
        const fz  = zones.find((z) => z.name.toLowerCase() === String(r["from_zone"]).trim().toLowerCase());
        const tz  = zones.find((z) => z.name.toLowerCase() === String(r["to_zone"]).trim().toLowerCase());
        const vt  = vTypes.find((v) => v.name.toLowerCase() === String(r["car_type"]).trim().toLowerCase());
        const pr  = Number(r["price"]);
        const cur = String(r["currency"] ?? "EGP").trim().toUpperCase();

        if (!["ARR","DEP","CITY_TO_CITY","TWO_WAY_TRANSFER"].includes(st)) { errors.push(`Row ${row}: invalid service_type "${st}"`); return; }
        if (!["PRIVATE","SHARED"].includes(tt))   { errors.push(`Row ${row}: invalid transfer_type "${tt}"`); return; }
        if (!fz)  { errors.push(`Row ${row}: unknown from_zone "${r["from_zone"]}"`); return; }
        if (!tz)  { errors.push(`Row ${row}: unknown to_zone "${r["to_zone"]}"`); return; }
        if (!vt)  { errors.push(`Row ${row}: unknown car_type "${r["car_type"]}"`); return; }
        if (isNaN(pr) || pr < 0) { errors.push(`Row ${row}: invalid price`); return; }

        items.push({ serviceType: st, transferType: tt, fromZoneId: fz.id, toZoneId: tz.id, vehicleTypeId: vt.id, price: pr, currency: cur });
      });

      if (errors.length) { toast.error(errors.slice(0, 3).join("\n")); return; }
      if (!items.length) { toast.error("No valid rows found"); return; }

      await api.post("/public-prices/bulk", { items });
      toast.success(`Imported ${items.length} row(s)`);
      await fetchAll();
    } catch {
      toast.error("Import failed");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        <PageHeader
          title="Public Prices (B2C)"
          description="Manage transfer prices for direct guest bookings"
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button size="sm" onClick={startNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Row
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-1.5">
            <Download className="h-4 w-4" /> Download Template
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5">
                <Upload className="h-4 w-4" /> Import Excel
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} row(s)</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 text-left">Service Type</th>
                <th className="px-3 py-2.5 text-left">Car Type</th>
                <th className="px-3 py-2.5 text-left">Transfer</th>
                <th className="px-3 py-2.5 text-left">Origin</th>
                <th className="px-3 py-2.5 text-left">Destination</th>
                <th className="px-3 py-2.5 text-right">Price</th>
                <th className="px-3 py-2.5 text-left">Currency</th>
                <th className="px-3 py-2.5 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody>

              {/* ── New row form ── */}
              {editId === "new" && (
                <tr className="border-b border-blue-100 bg-blue-50/60">
                  <td className="px-3 py-2">
                    <ServiceTypeMulti
                      value={editState.serviceTypes}
                      onChange={(v) => setF("serviceTypes", v)}
                    />
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <CellSelect value={editState.vehicleTypeId} onChange={(v) => setF("vehicleTypeId", v)}
                      options={vtypeOpts} placeholder="Car type" />
                  </td>
                  <td className="px-3 py-2 min-w-[100px]">
                    <CellSelect value={editState.transferType} onChange={(v) => setF("transferType", v)}
                      options={TRANSFER_OPTS} />
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <CellSelect value={editState.fromZoneId} onChange={(v) => setF("fromZoneId", v)}
                      options={zoneOpts} placeholder="From zone" />
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <CellSelect value={editState.toZoneId} onChange={(v) => setF("toZoneId", v)}
                      options={zoneOpts} placeholder="To zone" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" min={0} step="0.01"
                      value={editState.price}
                      onChange={(e) => setF("price", e.target.value)}
                      className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2 min-w-[80px]">
                    <CellSelect value={editState.currency} onChange={(v) => setF("currency", v)}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <ActionBtn icon={saving ? Loader2 : Check} tooltip="Save" onClick={saveNew}
                        variant="primary" disabled={saving} />
                      <ActionBtn icon={X} tooltip="Cancel" onClick={cancelEdit} />
                    </div>
                  </td>
                </tr>
              )}

              {/* ── Existing rows ── */}
              {rows.length === 0 && editId !== "new" && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">
                    No price rows yet. Click <strong>Add Row</strong> or import an Excel file.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const isEditing = editId === row.id;
                return (
                  <tr key={row.id}
                    className={[
                      "border-b border-border transition-colors",
                      isEditing ? "bg-yellow-50/60" : "hover:bg-muted/30",
                    ].join(" ")}
                  >
                    {isEditing ? (
                      <>
                        {/* service type single-select in edit mode */}
                        <td className="px-3 py-2 min-w-[130px]">
                          <CellSelect
                            value={editState.serviceTypes[0] ?? ""}
                            onChange={(v) => setF("serviceTypes", [v])}
                            options={SERVICE_OPTS}
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <CellSelect value={editState.vehicleTypeId} onChange={(v) => setF("vehicleTypeId", v)}
                            options={vtypeOpts} />
                        </td>
                        <td className="px-3 py-2 min-w-[100px]">
                          <CellSelect value={editState.transferType} onChange={(v) => setF("transferType", v)}
                            options={TRANSFER_OPTS} />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <CellSelect value={editState.fromZoneId} onChange={(v) => setF("fromZoneId", v)}
                            options={zoneOpts} />
                        </td>
                        <td className="px-3 py-2 min-w-[120px]">
                          <CellSelect value={editState.toZoneId} onChange={(v) => setF("toZoneId", v)}
                            options={zoneOpts} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number" min={0} step="0.01"
                            value={editState.price}
                            onChange={(e) => setF("price", e.target.value)}
                            className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-3 py-2 min-w-[80px]">
                          <CellSelect value={editState.currency} onChange={(v) => setF("currency", v)}
                            options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <ActionBtn icon={saving ? Loader2 : Save} tooltip="Save" onClick={() => saveEdit(row.id)}
                              variant="primary" disabled={saving} />
                            <ActionBtn icon={X} tooltip="Cancel" onClick={cancelEdit} />
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5"><ServiceBadge type={row.serviceType} /></td>
                        <td className="px-3 py-2.5 text-xs">{row.vehicleType?.name ?? vtypeName(row.vehicleTypeId)}</td>
                        <td className="px-3 py-2.5"><TransferBadge type={row.transferType} /></td>
                        <td className="px-3 py-2.5 text-xs">{row.fromZone?.name ?? zoneName(row.fromZoneId)}</td>
                        <td className="px-3 py-2.5 text-xs">{row.toZone?.name  ?? zoneName(row.toZoneId)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{row.price.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-xs">{row.currency}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-0.5">
                            {canEdit && (
                              <ActionBtn icon={Pencil} tooltip="Edit" onClick={() => startEdit(row)} />
                            )}
                            {canEdit && (
                              <ActionBtn icon={Copy} tooltip="Copy row" onClick={() => copyRow(row)} />
                            )}
                            {canDelete && (
                              <ActionBtn
                                icon={deleting === row.id ? Loader2 : Trash2}
                                tooltip="Delete"
                                onClick={() => deleteRow(row.id)}
                                variant="danger"
                                disabled={deleting === row.id}
                              />
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
