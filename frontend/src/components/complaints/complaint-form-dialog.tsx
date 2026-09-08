"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableCombobox, type ComboboxItem } from "@/components/searchable-combobox";
import { usePermission } from "@/hooks/use-permission";
import {
  type Complaint,
  type ComplaintCategory,
  type ComplaintParty,
  CURRENCIES,
  STAGE_LABELS,
  SOURCE_LABELS,
  PARTY_LABELS,
} from "@/lib/complaints";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint | null;
  categories: ComplaintCategory[];
  onSaved: () => void;
  /** Pre-selected job, used when logging from the job detail screen. */
  lockedJob?: { id: string; internalRef: string } | null;
}

interface PersonOption {
  id: string;
  name: string;
}

const emptyForm = {
  trafficJobId: "",
  categoryId: "",
  stage: "DURING_JOB",
  source: "AGENT",
  subject: "",
  description: "",
  complaintDate: "",
  slaHours: 48,
  claimedAmount: "",
  lossAmount: "",
  currency: "EGP",
  exchangeRate: "1",
  responsibleParty: "NONE" as ComplaintParty,
  responsibleDriverId: "",
  responsibleRepId: "",
  responsibleSupplierId: "",
};

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ComplaintFormDialog({
  open,
  onOpenChange,
  complaint,
  categories,
  onSaved,
  lockedJob,
}: Props) {
  const isEdit = Boolean(complaint);
  const canEditAmounts = usePermission("complaints.financial.editAmounts");

  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [jobQuery, setJobQuery] = useState("");
  const [jobOptions, setJobOptions] = useState<ComboboxItem[]>([]);
  const [drivers, setDrivers] = useState<PersonOption[]>([]);
  const [reps, setReps] = useState<PersonOption[]>([]);
  const [suppliers, setSuppliers] = useState<PersonOption[]>([]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── prefill ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (complaint) {
      setForm({
        trafficJobId: complaint.trafficJobId,
        categoryId: complaint.categoryId,
        stage: complaint.stage,
        source: complaint.source,
        subject: complaint.subject,
        description: complaint.description,
        complaintDate: toLocalInput(complaint.complaintDate),
        slaHours: complaint.slaHours,
        claimedAmount:
          complaint.claimedAmount != null ? String(complaint.claimedAmount) : "",
        lossAmount: complaint.lossAmount != null ? String(complaint.lossAmount) : "",
        currency: complaint.currency ?? "EGP",
        exchangeRate: complaint.exchangeRate != null ? String(complaint.exchangeRate) : "1",
        responsibleParty: complaint.responsibleParty ?? "NONE",
        responsibleDriverId: complaint.responsibleDriverId ?? "",
        responsibleRepId: complaint.responsibleRepId ?? "",
        responsibleSupplierId: complaint.responsibleSupplierId ?? "",
      });
      if (complaint.trafficJob) {
        setJobOptions([
          {
            value: complaint.trafficJob.id,
            label: complaint.trafficJob.internalRef,
            sub: complaint.trafficJob.clientName ?? undefined,
          },
        ]);
      }
    } else {
      setForm({
        ...emptyForm,
        trafficJobId: lockedJob?.id ?? "",
        complaintDate: toLocalInput(new Date().toISOString()),
      });
      setJobOptions(
        lockedJob ? [{ value: lockedJob.id, label: lockedJob.internalRef }] : [],
      );
    }
  }, [open, complaint, lockedJob]);

  // ── job search ───────────────────────────────────────────────────────
  const searchJobs = useCallback(async (term: string) => {
    if (!term || term.length < 2) return;
    try {
      const res = await api.get(
        `/traffic-jobs?search=${encodeURIComponent(term)}&limit=20`,
      );
      const jobs = res.data.data || [];
      setJobOptions(
        jobs.map((j: any) => ({
          value: j.id,
          label: j.internalRef,
          sub: [j.agentRef, j.clientName].filter(Boolean).join(" · ") || undefined,
        })),
      );
    } catch {
      // Leave the current options in place; the field stays usable.
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => searchJobs(jobQuery), 300);
    return () => clearTimeout(id);
  }, [jobQuery, searchJobs]);

  // ── responsible-person lists, loaded only for the selected party ─────
  useEffect(() => {
    if (!open) return;
    const party = form.responsibleParty;
    const load = async (path: string, setter: (v: PersonOption[]) => void) => {
      try {
        const res = await api.get(`${path}?limit=1000`);
        setter(res.data.data || []);
      } catch {
        setter([]);
      }
    };
    if (party === "DRIVER" && drivers.length === 0) load("/drivers", setDrivers);
    if (party === "REP" && reps.length === 0) load("/reps", setReps);
    if (party === "SUPPLIER" && suppliers.length === 0) load("/suppliers", setSuppliers);
  }, [open, form.responsibleParty, drivers.length, reps.length, suppliers.length]);

  /** Selecting a category with a default party pre-fills it, on new complaints only. */
  const onCategoryChange = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    setForm((f) => ({
      ...f,
      categoryId,
      responsibleParty:
        !isEdit && category?.defaultParty ? category.defaultParty : f.responsibleParty,
    }));
  };

  /** Switching party clears the id that no longer applies — the API rejects a mismatch. */
  const onPartyChange = (party: ComplaintParty) =>
    setForm((f) => ({
      ...f,
      responsibleParty: party,
      responsibleDriverId: party === "DRIVER" ? f.responsibleDriverId : "",
      responsibleRepId: party === "REP" ? f.responsibleRepId : "",
      responsibleSupplierId: party === "SUPPLIER" ? f.responsibleSupplierId : "",
    }));

  const handleSubmit = async () => {
    if (!form.trafficJobId) return toast.error("Pick the job this complaint is about.");
    if (!form.categoryId) return toast.error("Pick a complaint category.");
    if (!form.subject.trim()) return toast.error("Enter a subject.");
    if (!form.description.trim()) return toast.error("Enter a description.");
    if (!form.complaintDate) return toast.error("Enter when the complaint was received.");

    const payload: Record<string, unknown> = {
      categoryId: form.categoryId,
      stage: form.stage,
      source: form.source,
      subject: form.subject.trim(),
      description: form.description.trim(),
      complaintDate: new Date(form.complaintDate).toISOString(),
      slaHours: Number(form.slaHours) || 48,
      responsibleParty: form.responsibleParty,
      responsibleDriverId: form.responsibleDriverId || undefined,
      responsibleRepId: form.responsibleRepId || undefined,
      responsibleSupplierId: form.responsibleSupplierId || undefined,
    };

    // Only send money fields when the user is allowed to set them, so a
    // read-only user's PATCH is never rejected for touching them.
    if (canEditAmounts) {
      if (form.claimedAmount !== "") payload.claimedAmount = Number(form.claimedAmount);
      if (form.lossAmount !== "") payload.lossAmount = Number(form.lossAmount);
      payload.currency = form.currency;
      payload.exchangeRate = Number(form.exchangeRate) || 1;
    }

    setSaving(true);
    try {
      if (isEdit && complaint) {
        await api.patch(`/complaints/${complaint.id}`, payload);
        toast.success("Complaint updated");
      } else {
        await api.post("/complaints", { ...payload, trafficJobId: form.trafficJobId });
        toast.success("Complaint logged");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save complaint");
    } finally {
      setSaving(false);
    }
  };

  const responsibleOptions: PersonOption[] =
    form.responsibleParty === "DRIVER"
      ? drivers
      : form.responsibleParty === "REP"
        ? reps
        : form.responsibleParty === "SUPPLIER"
          ? suppliers
          : [];

  const responsibleValue =
    form.responsibleParty === "DRIVER"
      ? form.responsibleDriverId
      : form.responsibleParty === "REP"
        ? form.responsibleRepId
        : form.responsibleParty === "SUPPLIER"
          ? form.responsibleSupplierId
          : "";

  const setResponsibleId = (id: string) =>
    setForm((f) => ({
      ...f,
      responsibleDriverId: f.responsibleParty === "DRIVER" ? id : "",
      responsibleRepId: f.responsibleParty === "REP" ? id : "",
      responsibleSupplierId: f.responsibleParty === "SUPPLIER" ? id : "",
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Complaint" : "Log Complaint"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "The status is changed from the complaint's detail view, not here."
              : "The reply deadline is calculated from the date received."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Job *</Label>
            {isEdit || lockedJob ? (
              <Input
                value={
                  complaint?.trafficJob?.internalRef ?? lockedJob?.internalRef ?? ""
                }
                disabled
                className="mt-1"
              />
            ) : (
              <div className="mt-1">
                <SearchableCombobox
                  items={jobOptions}
                  value={form.trafficJobId}
                  onChange={(v) => set("trafficJobId", v)}
                  placeholder="Search a job by reference…"
                  searchPlaceholder="Type at least 2 characters…"
                  emptyText="No matching jobs."
                />
              </div>
            )}
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                A complaint stays with the job it was logged against.
              </p>
            )}
          </div>

          <div>
            <Label>Category *</Label>
            <Select value={form.categoryId} onValueChange={onCategoryChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Stage *</Label>
            <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STAGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Source</Label>
            <Select value={form.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Received *</Label>
            <Input
              type="datetime-local"
              value={form.complaintDate}
              onChange={(e) => set("complaintDate", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Reply window (hours)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.slaHours}
              onChange={(e) => set("slaHours", Number(e.target.value))}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Defaults to 48. Stored on the complaint, so changing the policy later
              won&apos;t move old deadlines.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label>Subject *</Label>
            <Input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              maxLength={300}
              className="mt-1"
              placeholder="Short summary of what the client complained about"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Description *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              className="mt-1"
              placeholder="What happened, in the client's words where possible"
            />
          </div>

          <div>
            <Label>Responsible party</Label>
            <Select
              value={form.responsibleParty}
              onValueChange={(v) => onPartyChange(v as ComplaintParty)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PARTY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {responsibleOptions.length > 0 && (
            <div>
              <Label>Who exactly</Label>
              <Select value={responsibleValue} onValueChange={setResponsibleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a person" />
                </SelectTrigger>
                <SelectContent>
                  {responsibleOptions.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name ?? p.tradeName ?? p.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {canEditAmounts && (
            <>
              <div className="sm:col-span-2 mt-2 border-t pt-3">
                <p className="text-sm font-medium">Amounts</p>
                <p className="text-xs text-muted-foreground">
                  The loss amount is normally set when the outcome is decided, not here.
                </p>
              </div>

              <div>
                <Label>Claimed by the agent</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.claimedAmount}
                  onChange={(e) => set("claimedAmount", e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Loss conceded</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.lossAmount}
                  onChange={(e) => set("lossAmount", e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Exchange rate</Label>
                <Input
                  type="number"
                  min={0.0001}
                  step="0.0001"
                  value={form.exchangeRate}
                  onChange={(e) => set("exchangeRate", e.target.value)}
                  className="mt-1"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Log complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
