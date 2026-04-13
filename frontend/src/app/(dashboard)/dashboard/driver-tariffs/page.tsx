"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Pencil, Trash2, Receipt, Copy, Check, ChevronsUpDown, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { SearchableCombobox } from "@/components/searchable-combobox";
import api from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";

interface Zone {
  id: string;
  name: string;
  city?: { name: string };
}

interface VehicleType {
  id: string;
  name: string;
  seatCapacity?: number;
}

interface JobServiceType {
  id: string;
  name: string;
  fromZone?: { id: string; name: string } | null;
  toZone?: { id: string; name: string } | null;
}

interface Tariff {
  id: string;
  fromZone: Zone;
  toZone: Zone;
  vehicleType: VehicleType;
  jobServiceType?: JobServiceType | null;
  amount: number;
  currency: string;
  notes: string | null;
  isActive: boolean;
}

const EMPTY_FORM = {
  jobServiceTypeId: "",
  fromZoneId: "",
  toZoneId: "",
  vehicleTypeId: "",
  amount: "",
  currency: "EGP",
  notes: "",
};

// ── Creatable Combobox (for Service Type) ─────────────────────────────────────

function CreatableCombobox({
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  searchPlaceholder,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  onCreate: (name: string) => Promise<{ id: string; name: string } | null>;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = items.find((i) => i.value === value);
  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));
  const canCreate = query.trim() && !items.some((i) => i.label.toLowerCase() === query.toLowerCase());

  const handleCreate = async () => {
    if (!query.trim()) return;
    setCreating(true);
    const created = await onCreate(query.trim());
    setCreating(false);
    if (created) {
      onChange(created.id);
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate text-left">
            {selected ? selected.label : <span className="text-muted-foreground">{placeholder ?? "Select…"}</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder ?? "Search or type new…"}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {filtered.length === 0 && !canCreate && (
              <CommandEmpty>No results.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={() => { onChange(item.value); setOpen(false); setQuery(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === item.value ? "opacity-100" : "opacity-0")} />
                  {item.label}
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value="__create__"
                  onSelect={handleCreate}
                  disabled={creating}
                  className="text-primary font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? "Creating…" : `Create "${query.trim()}"`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DriverTariffsPage() {
  const canUpsert = usePermission("driver-tariffs.upsert");
  const canDelete = usePermission("driver-tariffs.delete");

  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [jobServiceTypes, setJobServiceTypes] = useState<JobServiceType[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importResult, setImportResult] = useState<{
    open: boolean; imported: number; errors: string[];
  }>({ open: false, imported: 0, errors: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tariffsRes, zonesRes, vtRes, jstRes] = await Promise.all([
        api.get("/driver-tariffs"),
        api.get("/locations/zones"),
        api.get("/vehicles/types"),
        api.get("/job-service-types"),
      ]);
      setTariffs(
        (tariffsRes.data.data || tariffsRes.data || []).map((t: any) => ({
          ...t,
          amount: Number(t.amount),
        }))
      );
      setZones(zonesRes.data.data || zonesRes.data || []);
      setVehicleTypes(vtRes.data.data || vtRes.data || []);
      setJobServiceTypes(jstRes.data.data || jstRes.data || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const zoneItems = useMemo(() =>
    zones.map((z) => ({ value: z.id, label: z.name, sub: z.city?.name })),
    [zones]
  );

  const vehicleTypeItems = useMemo(() =>
    vehicleTypes.map((vt) => ({
      value: vt.id,
      label: vt.name,
      sub: vt.seatCapacity ? `${vt.seatCapacity} seats` : undefined,
    })),
    [vehicleTypes]
  );

  const serviceTypeItems = useMemo(() =>
    jobServiceTypes.map((s) => ({ value: s.id, label: s.name })),
    [jobServiceTypes]
  );

  // When a service type is selected, auto-fill zones if it has mappings
  const handleServiceTypeChange = (id: string) => {
    const st = jobServiceTypes.find((s) => s.id === id);
    setForm((f) => ({
      ...f,
      jobServiceTypeId: id,
      ...(st?.fromZone ? { fromZoneId: st.fromZone.id } : {}),
      ...(st?.toZone ? { toZoneId: st.toZone.id } : {}),
    }));
  };

  const handleCreateServiceType = async (name: string) => {
    try {
      const res = await api.post("/job-service-types", { name });
      const newSt: JobServiceType = res.data.data || res.data;
      setJobServiceTypes((prev) => [...prev, newSt]);
      toast.success(`Service type "${name}" created`);
      return newSt;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create service type");
      return null;
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (t: Tariff) => {
    setEditingId(t.id);
    setForm({
      jobServiceTypeId: t.jobServiceType?.id ?? "",
      fromZoneId: t.fromZone.id,
      toZoneId: t.toZone.id,
      vehicleTypeId: t.vehicleType.id,
      amount: String(t.amount),
      currency: t.currency,
      notes: t.notes ?? "",
    });
    setDialogOpen(true);
  };

  const openCopy = (t: Tariff) => {
    setEditingId(null); // null = new record
    setForm({
      jobServiceTypeId: t.jobServiceType?.id ?? "",
      fromZoneId: t.fromZone.id,
      toZoneId: t.toZone.id,
      vehicleTypeId: t.vehicleType.id,
      amount: String(t.amount),
      currency: t.currency,
      notes: t.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.fromZoneId || !form.toZoneId || !form.vehicleTypeId || !form.amount) {
      toast.error("From zone, to zone, vehicle type, and amount are required");
      return;
    }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) {
      toast.error("Amount must be a valid non-negative number");
      return;
    }
    setSaving(true);
    try {
      await api.post("/driver-tariffs", {
        fromZoneId: form.fromZoneId,
        toZoneId: form.toZoneId,
        vehicleTypeId: form.vehicleTypeId,
        amount: amt,
        currency: form.currency,
        notes: form.notes || undefined,
        jobServiceTypeId: form.jobServiceTypeId || undefined,
      });
      toast.success(editingId ? "Tariff updated" : "Tariff added");
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save tariff");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/driver-tariffs/${deleteId}`);
      toast.success("Tariff deleted");
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error("Failed to delete tariff");
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await api.get("/driver-tariffs/import/template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "driver_tariffs_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/driver-tariffs/import/excel", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = res.data.data;
      setImportResult({ open: true, imported: result.imported, errors: result.errors });
      if (result.imported > 0) fetchData();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to import file";
      toast.error(message);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Driver Tariffs"
          description="Rate card for driver trip fees by route and vehicle type. Used to auto-calculate driver fees when a job is completed."
        />
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {downloadingTemplate ? "Downloading…" : "Template"}
          </Button>
          {canUpsert && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {importing ? "Importing…" : "Import"}
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Tariff
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading tariffs…</div>
      ) : tariffs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground text-sm border rounded-lg">
          <Receipt className="h-8 w-8 opacity-30" />
          <p>No tariffs configured yet.</p>
          {canUpsert && (
            <Button variant="outline" size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" /> Add your first tariff
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Type</TableHead>
                <TableHead>From Zone</TableHead>
                <TableHead>To Zone</TableHead>
                <TableHead>Vehicle Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Notes</TableHead>
                {(canUpsert || canDelete) && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.map((t) => (
                <TableRow key={t.id} className={!t.isActive ? "opacity-50" : undefined}>
                  <TableCell className="font-medium text-primary">
                    {t.jobServiceType?.name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {t.fromZone.name}
                    {t.fromZone.city && <span className="text-muted-foreground text-xs ml-1">({t.fromZone.city.name})</span>}
                  </TableCell>
                  <TableCell>
                    {t.toZone.name}
                    {t.toZone.city && <span className="text-muted-foreground text-xs ml-1">({t.toZone.city.name})</span>}
                  </TableCell>
                  <TableCell>
                    {t.vehicleType.name}
                    {t.vehicleType.seatCapacity && <span className="text-muted-foreground text-xs ml-1">({t.vehicleType.seatCapacity} seats)</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {t.amount.toLocaleString("en-EG", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>{t.currency}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.notes || "—"}</TableCell>
                  {(canUpsert || canDelete) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canUpsert && (
                          <>
                            <Button variant="ghost" size="icon" title="Copy" onClick={() => openCopy(t)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteId(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit / Copy Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[80vw] max-w-[80vw]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Driver Tariff" : "Add Driver Tariff"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* 1. Service Type — tab order 1, creatable */}
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <CreatableCombobox
                items={serviceTypeItems}
                value={form.jobServiceTypeId}
                onChange={handleServiceTypeChange}
                onCreate={handleCreateServiceType}
                placeholder="Select or create service type…"
                searchPlaceholder="Search or type to create…"
              />
            </div>

            {/* 2. Zones */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label>From Zone <span className="text-destructive">*</span></Label>
                <SearchableCombobox
                  items={zoneItems}
                  value={form.fromZoneId}
                  onChange={(v) => setForm((f) => ({ ...f, fromZoneId: v }))}
                  placeholder="Select zone…"
                  searchPlaceholder="Search zones…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>To Zone <span className="text-destructive">*</span></Label>
                <SearchableCombobox
                  items={zoneItems}
                  value={form.toZoneId}
                  onChange={(v) => setForm((f) => ({ ...f, toZoneId: v }))}
                  placeholder="Select zone…"
                  searchPlaceholder="Search zones…"
                />
              </div>
            </div>

            {/* 3. Vehicle Type */}
            <div className="space-y-1.5">
              <Label>Vehicle Type <span className="text-destructive">*</span></Label>
              <SearchableCombobox
                items={vehicleTypeItems}
                value={form.vehicleTypeId}
                onChange={(v) => setForm((f) => ({ ...f, vehicleTypeId: v }))}
                placeholder="Select vehicle type…"
                searchPlaceholder="Search vehicle types…"
              />
            </div>

            {/* 4. Amount + Currency */}
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-1.5">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">EGP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 5. Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result */}
      <AlertDialog open={importResult.open} onOpenChange={(o) => !o && setImportResult((r) => ({ ...r, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Complete</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-medium text-green-600">{importResult.imported}</span> tariff{importResult.imported !== 1 ? "s" : ""} imported successfully.
                </p>
                {importResult.errors.length > 0 && (
                  <div>
                    <p className="font-medium text-destructive mb-1">{importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""}:</p>
                    <ul className="max-h-48 overflow-y-auto space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportResult((r) => ({ ...r, open: false }))}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o: boolean) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tariff</AlertDialogTitle>
            <AlertDialogDescription>
              This tariff will be removed. Existing driver trip fees already recorded will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
