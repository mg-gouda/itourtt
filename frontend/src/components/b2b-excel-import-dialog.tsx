"use client";

// B2B "Import from Excel" — the traffic team's daily sheet → B2B jobs.
// The server parses the file on every step (preview and commit read the same
// bytes), so this component only drives the steps and renders the results.
// Rules: backend/src/b2b-excel-import/b2b-excel-import.service.ts and
// docs/map/11-business-rules.md › B2B Excel import.

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableCombobox } from "@/components/searchable-combobox";
import api from "@/lib/api";

type RowStatus = "NEW" | "CHANGED" | "UNCHANGED" | "SKIPPED";
type AliasKind = "CUSTOMER" | "SUPPLIER" | "DRIVER";

interface RowResult {
  rowNo: number;
  date: string | null;
  route: string;
  carNo: string;
  customer: string;
  orderNo: string;
  carrierName: string;
  notes: string;
  status: RowStatus;
  reasons: string[];
  warnings: string[];
  unmatched: { kind: AliasKind; name: string }[];
  jobRef?: string;
  changes?: { field: string; from: string; to: string }[];
  display?: { route: string; car: string; carrier: string; source: "OWN" | "SUPPLIER" };
}

interface CommitResult {
  counts: { rows: number; created: number; updated: number; unchanged: number; changedNotUpdated: number; skipped: number; failed: number };
  created: { rowNo: number; jobRef: string }[];
  updated: { rowNo: number; jobRef: string }[];
  skipped: RowResult[];
  failed: { rowNo: number; reason: string }[];
}

const STATUS_STYLE: Record<RowStatus, string> = {
  NEW: "bg-emerald-600 text-white",
  CHANGED: "bg-amber-500 text-white",
  UNCHANGED: "bg-muted text-muted-foreground",
  SKIPPED: "bg-destructive text-white",
};
const STATUS_LABEL: Record<RowStatus, string> = {
  NEW: "New",
  CHANGED: "Changed",
  UNCHANGED: "Unchanged",
  SKIPPED: "Will be skipped",
};
const KIND_LABEL: Record<AliasKind, string> = { CUSTOMER: "Customer", SUPPLIER: "Supplier", DRIVER: "Driver" };

export function B2BExcelImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "dates" | "preview" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dates, setDates] = useState<{ date: string; count: number }[]>([]);
  const [undated, setUndated] = useState(0);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [rows, setRows] = useState<RowResult[]>([]);
  const [updateSel, setUpdateSel] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<RowStatus | "ALL">("ALL");
  const [lookups, setLookups] = useState<Record<AliasKind, { id: string; name: string }[]> | null>(null);
  const [aliasPick, setAliasPick] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CommitResult | null>(null);

  const reset = () => {
    setStep("upload"); setFile(null); setDates([]); setUndated(0); setSelectedDates([]);
    setRows([]); setUpdateSel(new Set()); setFilter("ALL"); setAliasPick({}); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

  const errMsg = (e: any) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(", ") : m || e?.message || "Request failed";
  };

  const runPreview = async (f: File, ds: string[]) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("dates", ds.join(","));
    const { data } = await api.post("/traffic-jobs/b2b-excel-import/preview", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data as { dates: { date: string; count: number }[]; undated: number; rows: RowResult[] };
  };

  const loadPreview = async (f: File, ds: string[]) => {
    setBusy(true);
    try {
      const p = await runPreview(f, ds);
      setRows(p.rows);
      setUpdateSel(new Set(p.rows.filter((r) => r.status === "CHANGED").map((r) => r.rowNo)));
      setStep("preview");
      if (!lookups && p.rows.some((r) => r.unmatched.length > 0)) {
        api.get("/traffic-jobs/b2b-excel-import/lookups").then(({ data }) => setLookups(data.data)).catch(() => {});
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setBusy(true);
    try {
      const p = await runPreview(f, []);
      setDates(p.dates);
      setUndated(p.undated);
      if (p.dates.length === 0) {
        toast.error("No dated rows found in this sheet");
        setBusy(false);
        return;
      }
      if (p.dates.length === 1) {
        setSelectedDates([p.dates[0].date]);
        setBusy(false);
        await loadPreview(f, [p.dates[0].date]);
        return;
      }
      setSelectedDates([]);
      setStep("dates");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { NEW: 0, CHANGED: 0, UNCHANGED: 0, SKIPPED: 0 };
    rows.forEach((r) => { c[r.status]++; });
    return c;
  }, [rows]);

  const unmatched = useMemo(() => {
    const m = new Map<string, { kind: AliasKind; name: string; count: number }>();
    rows.forEach((r) => r.unmatched.forEach((u) => {
      const k = `${u.kind}|${u.name}`;
      const e = m.get(k);
      if (e) e.count++; else m.set(k, { ...u, count: 1 });
    }));
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const saveAlias = async (kind: AliasKind, name: string) => {
    const targetId = aliasPick[`${kind}|${name}`];
    if (!targetId || !file) return;
    setBusy(true);
    try {
      await api.post("/traffic-jobs/b2b-excel-import/aliases", { kind, rawName: name, targetId });
      toast.success(`"${name}" will now match automatically`);
      setBusy(false);
      await loadPreview(file, selectedDates);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dates", selectedDates.join(","));
      fd.append("updateRowNos", JSON.stringify([...updateSel]));
      const { data } = await api.post("/traffic-jobs/b2b-excel-import/commit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300000,
      });
      setResult(data.data);
      setStep("result");
      onImported();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = async () => {
    if (!result) return;
    const XLSX = await import("xlsx");
    const lines = [
      ...result.created.map((c) => ({ Row: c.rowNo, Result: "Created", Job: c.jobRef, Reason: "" })),
      ...result.updated.map((c) => ({ Row: c.rowNo, Result: "Updated", Job: c.jobRef, Reason: "" })),
      ...result.skipped.map((s) => ({
        Row: s.rowNo, Result: "Skipped", Job: s.jobRef ?? "", Reason: s.reasons.join("; "),
        Date: s.date ?? "", Route: s.route, Car: s.carNo, Customer: s.customer, "Order No": s.orderNo, Carrier: s.carrierName,
      })),
      ...result.failed.map((f) => ({ Row: f.rowNo, Result: "Failed", Job: "", Reason: f.reason })),
    ].sort((a, b) => a.Row - b.Row);
    const ws = XLSX.utils.json_to_sheet(lines);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import report");
    XLSX.writeFile(wb, `b2b-import-report_${selectedDates.join("_")}.xlsx`);
  };

  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);
  const newCount = counts.NEW;
  const updCount = [...updateSel].filter((n) => rows.find((r) => r.rowNo === n)?.status === "CHANGED").length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="w-[92vw] sm:max-w-[92vw] max-h-[90vh] flex flex-col border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-green-600" /> Import B2B jobs from Excel
          </DialogTitle>
          <DialogDescription>
            Upload the traffic sheet. Each row becomes one COMPLETED job (own or supplier car); rows that can&apos;t be matched are skipped and reported.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 border border-dashed rounded-md">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Traffic sheet (.xlsx) — the day you import can be picked next</p>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        )}

        {step === "dates" && (
          <div className="space-y-3 overflow-y-auto">
            <p className="text-sm">
              <span className="font-medium">{file?.name}</span> has {dates.length} days. Pick the day(s) to import.
              {undated > 0 && <span className="text-muted-foreground"> ({undated} rows without a date are ignored.)</span>}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {dates.map((d) => {
                const on = selectedDates.includes(d.date);
                return (
                  <label key={d.date} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm cursor-pointer ${on ? "border-primary bg-primary/5" : ""}`}>
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        setSelectedDates((s) => (v ? [...s, d.date].sort() : s.filter((x) => x !== d.date)))
                      }
                    />
                    <span>{d.date}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{d.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{file?.name} · {selectedDates.join(", ")}</span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {(["ALL", "NEW", "CHANGED", "UNCHANGED", "SKIPPED"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={filter === k ? "default" : "outline"}
                    onClick={() => setFilter(k)}
                  >
                    {k === "ALL" ? `All ${rows.length}` : `${STATUS_LABEL[k]} ${counts[k]}`}
                  </Button>
                ))}
              </div>
            </div>

            {unmatched.length > 0 && (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 space-y-1.5">
                <p className="text-xs font-medium">
                  Names not found in the system — map one to an existing record and it will match automatically from now on.
                  Unmapped rows are skipped.
                </p>
                <div className="grid gap-1.5 md:grid-cols-2 max-h-40 overflow-y-auto">
                  {unmatched.map((u) => {
                    const key = `${u.kind}|${u.name}`;
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="shrink-0">{KIND_LABEL[u.kind]}</Badge>
                        <span className="truncate" title={u.name}>{u.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{u.count} rows</span>
                        <div className="ml-auto w-56 shrink-0">
                          <SearchableCombobox
                            items={(lookups?.[u.kind] ?? []).map((o) => ({ value: o.id, label: o.name }))}
                            value={aliasPick[key] ?? ""}
                            onChange={(v) => setAliasPick((p) => ({ ...p, [key]: v }))}
                            placeholder="Map to…"
                            searchPlaceholder="Search…"
                          />
                        </div>
                        <Button size="sm" variant="outline" disabled={!aliasPick[key] || busy} onClick={() => saveAlias(u.kind, u.name)}>
                          Save
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      {counts.CHANGED > 0 && (
                        <Checkbox
                          checked={updCount === counts.CHANGED}
                          onCheckedChange={(v) =>
                            setUpdateSel(v ? new Set(rows.filter((r) => r.status === "CHANGED").map((r) => r.rowNo)) : new Set())
                          }
                          title="Update all changed jobs"
                        />
                      )}
                    </TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Car</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Driver / Supplier</TableHead>
                    <TableHead className="min-w-[260px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.rowNo} className={r.status === "SKIPPED" ? "bg-destructive/5" : undefined}>
                      <TableCell>
                        {r.status === "CHANGED" && (
                          <Checkbox
                            checked={updateSel.has(r.rowNo)}
                            onCheckedChange={(v) =>
                              setUpdateSel((s) => {
                                const n = new Set(s);
                                if (v) n.add(r.rowNo); else n.delete(r.rowNo);
                                return n;
                              })
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.rowNo}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.jobRef && <div className="text-[11px] text-muted-foreground mt-0.5">{r.jobRef}</div>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.date ?? "—"}</TableCell>
                      <TableCell className="text-xs" dir="auto">{r.display?.route ?? r.route}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.display?.car ?? r.carNo}</TableCell>
                      <TableCell className="text-xs">{r.customer}</TableCell>
                      <TableCell className="text-xs">{r.orderNo || "—"}</TableCell>
                      <TableCell className="text-xs" dir="auto">{r.display?.carrier ?? r.carrierName}</TableCell>
                      <TableCell className="text-xs space-y-0.5">
                        {r.reasons.map((m, i) => <div key={`r${i}`} className="text-destructive">{m}</div>)}
                        {r.changes?.map((c, i) => (
                          <div key={`c${i}`}>
                            <span className="font-medium">{c.field}:</span>{" "}
                            <span className="line-through text-muted-foreground">{c.from}</span> → <span>{c.to}</span>
                          </div>
                        ))}
                        {r.warnings.map((m, i) => <div key={`w${i}`} className="text-amber-600">{m}</div>)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">No rows</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ["Created", result.counts.created, "text-emerald-600"],
                ["Updated", result.counts.updated, "text-amber-600"],
                ["Unchanged", result.counts.unchanged, "text-muted-foreground"],
                ["Not updated", result.counts.changedNotUpdated, "text-muted-foreground"],
                ["Skipped", result.counts.skipped + result.counts.failed, "text-destructive"],
              ].map(([label, n, cls]) => (
                <div key={label as string} className="rounded border p-2">
                  <div className={`text-2xl font-semibold ${cls}`}>{n as number}</div>
                  <div className="text-xs text-muted-foreground">{label as string}</div>
                </div>
              ))}
            </div>
            {(result.skipped.length > 0 || result.failed.length > 0) && (
              <div className="rounded border">
                <div className="px-3 py-2 text-sm font-medium border-b">
                  Skipped rows — fix the data (or add the missing records) and import the same day again
                </div>
                <div className="max-h-72 overflow-y-auto divide-y text-xs">
                  {result.skipped.map((s) => (
                    <div key={s.rowNo} className="px-3 py-1.5 flex gap-3">
                      <span className="text-muted-foreground w-14 shrink-0">Row {s.rowNo}</span>
                      <span className="text-destructive">{s.reasons.join("; ")}</span>
                    </div>
                  ))}
                  {result.failed.map((f) => (
                    <div key={`f${f.rowNo}`} className="px-3 py-1.5 flex gap-3">
                      <span className="text-muted-foreground w-14 shrink-0">Row {f.rowNo}</span>
                      <span className="text-destructive">{f.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "dates" && (
            <Button onClick={() => file && loadPreview(file, selectedDates)} disabled={busy || selectedDates.length === 0}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Preview {selectedDates.reduce((n, d) => n + (dates.find((x) => x.date === d)?.count ?? 0), 0)} rows
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>Start over</Button>
              <Button onClick={commit} disabled={busy || (newCount === 0 && updCount === 0)}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {newCount} new{updCount > 0 ? ` · update ${updCount}` : ""}
              </Button>
            </>
          )}
          {step === "result" && (
            <>
              <Button variant="outline" onClick={downloadReport}>
                <Download className="h-4 w-4 mr-2" /> Download report
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
