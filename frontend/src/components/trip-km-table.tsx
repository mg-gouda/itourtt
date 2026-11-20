"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Camera, Check, Download, Loader2, Pencil, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/print-report";

/**
 * Trip kilometres: odometer readings taken when drivers complete jobs in owned cars.
 * Distance = this reading − the same car's previous reading (any driver). Used on the vehicle page
 * (one car) and the fleet-wide Trip Kilometers page. Export = Excel for Odoo Fleet › Odometers.
 */
export interface TripKmRow {
  id: string;
  jobRef: string;
  jobDate: string;
  driverName: string;
  plateNumber: string;
  vehicleName: string;
  readingKm: number;
  previousKm: number | null;
  previousJobRef: string | null;
  previousDriverName: string | null;
  distanceKm: number | null;
  source: string;
  aiReadingKm: number | null;
  flagged: boolean;
  flagNote: string | null;
  confirmedAt: string;
  exportedAt: string | null;
  hasPhoto: boolean;
}

const cairoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function PhotoButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/trip-km/${id}/photo`, { responseType: "blob" });
      window.open(URL.createObjectURL(data as Blob), "_blank", "noopener");
    } catch {
      toast.error("Photo not available");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={open} title="Odometer photo">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
    </Button>
  );
}

export function TripKmTable({
  vehicleId,
  initialFrom,
  initialTo,
  showVehicle = !vehicleId,
}: {
  vehicleId?: string;
  initialFrom?: string;
  initialTo?: string;
  showVehicle?: boolean;
}) {
  const canExport = usePermission("trip-km.export");
  const today = cairoDay(new Date());
  const [from, setFrom] = useState(initialFrom ?? shift(today, -6));
  const [to, setTo] = useState(initialTo ?? today);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [rows, setRows] = useState<TripKmRow[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      const { data } = await api.get("/trip-km", {
        params: { from, to, vehicleId: vehicleId || undefined, flagged: flaggedOnly ? 1 : undefined },
      });
      setRows(data.data ?? []);
    } catch {
      toast.error("Failed to load trip kilometres");
      setRows([]);
    }
  }, [from, to, vehicleId, flaggedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const exportOdoo = async () => {
    setExporting(true);
    try {
      const { data } = await api.get("/trip-km/export", {
        params: { from, to, vehicleId: vehicleId || undefined },
        responseType: "blob",
      });
      downloadBlob(data as Blob, `odoo-odometer_${from}${to !== from ? `_${to}` : ""}.xlsx`);
      toast.success("Exported for Odoo");
      load();
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const saveCorrection = async () => {
    if (!editing) return;
    const km = Number(editing.value);
    if (!Number.isFinite(km) || km <= 0) {
      toast.error("Enter a valid kilometre reading");
      return;
    }
    try {
      await api.patch(`/trip-km/${editing.id}`, { readingKm: km });
      setEditing(null);
      toast.success("Reading corrected");
      load();
    } catch {
      toast.error("Could not save the correction");
    }
  };

  const totalKm = (rows ?? []).reduce((s, r) => s + (r.distanceKm && r.distanceKm > 0 ? r.distanceKm : 0), 0);
  const flagged = (rows ?? []).filter((r) => r.flagged).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button variant={flaggedOnly ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFlaggedOnly((v) => !v)}>
          <AlertTriangle className="mr-1 h-4 w-4" />
          To check{flagged ? ` (${flagged})` : ""}
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {(rows ?? []).length} trips · <span className="font-semibold text-foreground">{totalKm.toLocaleString()} km</span>
          </span>
          {canExport && (
            <Button size="sm" className="h-9" onClick={exportOdoo} disabled={exporting || !rows?.length}>
              {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              Export to Odoo
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Completed</TableHead>
              <TableHead>Job</TableHead>
              {showVehicle && <TableHead>Car</TableHead>}
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Odometer (km)</TableHead>
              <TableHead className="text-right">Previous (km)</TableHead>
              <TableHead className="text-right">Distance (km)</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Check</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  No odometer readings in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const d = new Date(r.confirmedAt);
                return (
                  <TableRow key={r.id} className={r.flagged ? "bg-amber-500/5" : undefined}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {d.toLocaleDateString("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "short" })}{" "}
                      <span className="text-muted-foreground">
                        {d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{r.jobRef}</TableCell>
                    {showVehicle && <TableCell className="text-sm">{r.plateNumber}</TableCell>}
                    <TableCell className="text-sm">{r.driverName}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {editing?.id === r.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            autoFocus
                            value={editing.value}
                            onChange={(e) => setEditing({ id: r.id, value: e.target.value.replace(/[^\d]/g, "") })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveCorrection();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="h-7 w-28 text-right"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveCorrection}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        r.readingKm.toLocaleString()
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {r.previousKm == null ? "—" : r.previousKm.toLocaleString()}
                      {r.previousDriverName && <div className="text-[11px]">by {r.previousDriverName}</div>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {r.distanceKm == null ? (
                        <span className="text-muted-foreground font-normal">first reading</span>
                      ) : (
                        <span className={r.distanceKm < 0 ? "text-destructive" : undefined}>{r.distanceKm.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {r.source === "MANUAL" ? "Typed" : "AI"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {r.flagged ? (
                        <span className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {r.flagNote}
                        </span>
                      ) : r.flagNote ? (
                        <span className="text-muted-foreground">{r.flagNote}</span>
                      ) : null}
                      {r.exportedAt && <div className="text-[11px] text-muted-foreground">exported</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        {r.hasPhoto && <PhotoButton id={r.id} />}
                        {canExport && editing?.id !== r.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Correct the reading"
                            onClick={() => setEditing({ id: r.id, value: String(r.readingKm) })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Distance is measured from the same car&apos;s previous reading, whichever driver took it. The Odoo file&apos;s
        first sheet has the Fleet › Odometers import columns (Vehicle, Date, Odometer Value, Driver); vehicles are named
        Brand/Model/Plate as in Odoo Fleet.
      </p>
    </div>
  );
}
