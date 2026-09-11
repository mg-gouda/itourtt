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
import { MultiSelect } from "@/components/multi-select";
import { usePermission } from "@/hooks/use-permission";
import {
  type Complaint,
  type ComplaintCategory,
  type ComplaintOutcome,
  type ComplaintParty,
  CURRENCIES,
  STAGE_LABELS,
  SELECTABLE_STAGES,
  SOURCE_LABELS,
  PARTY_LABELS,
  ASSIGNABLE_PARTIES,
  TERMINAL_STATUSES,
  describeReplyWindow,
} from "@/lib/complaints";
import { ComplaintOutcomeRadios } from "@/components/complaints/complaint-outcome-radios";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint | null;
  categories: ComplaintCategory[];
  onSaved: () => void;
  /** Pre-selected job, used when logging from the job detail screen. */
  lockedJob?: { id: string; internalRef: string } | null;
}

/** Who the selected job is actually assigned to — the responsible people. */
interface JobAssignment {
  driver?: { id: string; name: string } | null;
  rep?: { id: string; name: string } | null;
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
}

const emptyForm = {
  trafficJobId: "",
  categoryIds: [] as string[],
  stage: "DURING_JOB",
  source: "AGENT",
  agentId: "",
  subject: "",
  description: "",
  complaintDate: "",
  slaHours: 48,
  repliedAt: "",
  outcome: "" as "" | ComplaintOutcome,
  claimedAmount: "",
  lossAmount: "",
  currency: "EGP",
  responsibleParties: [] as ComplaintParty[],
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
  const [jobSearching, setJobSearching] = useState(false);
  const [agents, setAgents] = useState<ComboboxItem[]>([]);
  const [jobOptions, setJobOptions] = useState<ComboboxItem[]>([]);
  const [assignment, setAssignment] = useState<JobAssignment | null>(null);

  // The countdown is derived from the dates in the form, so it has to re-render
  // on its own while the dialog sits open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [open]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── prefill ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (complaint) {
      setForm({
        trafficJobId: complaint.trafficJobId,
        // The set the complaint was saved with, primary first.
        categoryIds: complaint.categoryIds?.length
          ? complaint.categoryIds
          : [complaint.categoryId],
        stage: complaint.stage,
        source: complaint.source,
        agentId: complaint.agentId ?? "",
        subject: complaint.subject,
        description: complaint.description,
        complaintDate: toLocalInput(complaint.complaintDate),
        slaHours: complaint.slaHours,
        repliedAt: complaint.repliedAt ? toLocalInput(complaint.repliedAt) : "",
        outcome: complaint.outcome ?? "",
        claimedAmount:
          complaint.claimedAmount != null ? String(complaint.claimedAmount) : "",
        lossAmount: complaint.lossAmount != null ? String(complaint.lossAmount) : "",
        currency: complaint.currency ?? "EGP",
        responsibleParties: complaint.responsibleParties?.length
          ? complaint.responsibleParties
          : complaint.responsibleParty && complaint.responsibleParty !== "NONE"
            ? [complaint.responsibleParty]
            : [],
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
    if (!term || term.trim().length < 2) return;
    setJobSearching(true);
    try {
      const res = await api.get(
        `/traffic-jobs?search=${encodeURIComponent(term.trim())}&limit=20`,
      );
      const jobs = res.data.data || [];
      const found: ComboboxItem[] = jobs.map((j: any) => ({
        value: j.id,
        label: j.internalRef,
        sub:
          [j.agentRef, j.clientName, j.jobDate ? String(j.jobDate).slice(0, 10) : null]
            .filter(Boolean)
            .join(" · ") || undefined,
      }));

      // Keep whatever is already selected in the list, or the trigger would
      // fall back to showing the raw id once the results replace it.
      setJobOptions((prev) => {
        const selected = prev.find((o) => o.value === form.trafficJobId);
        return selected && !found.some((f) => f.value === selected.value)
          ? [selected, ...found]
          : found;
      });
    } catch (err: any) {
      // Don't fail silently: a 403 from /traffic-jobs looks exactly like
      // "no such job" in the dropdown, which is what made this hard to spot.
      setJobOptions([]);
      toast.error(
        err?.response?.status === 403
          ? "You don't have permission to search jobs."
          : err?.response?.data?.message || "Job search failed.",
      );
    } finally {
      setJobSearching(false);
    }
  }, [form.trafficJobId]);

  useEffect(() => {
    const id = setTimeout(() => searchJobs(jobQuery), 300);
    return () => clearTimeout(id);
  }, [jobQuery, searchJobs]);

  // ── agents, loaded once the source says an agent raised it ──────────
  useEffect(() => {
    if (!open || form.source !== "AGENT" || agents.length > 0) return;
    api
      .get("/agents/lookup")
      .then((res) => {
        const rows = res.data?.data ?? [];
        setAgents(
          rows.map((a: any) => ({
            value: a.id,
            label: a.tradeName || a.legalName,
            sub: a.tradeName && a.legalName !== a.tradeName ? a.legalName : undefined,
          })),
        );
      })
      .catch(() => setAgents([]));
  }, [open, form.source, agents.length]);

  // Picking a job fetches it once, for two things: the agent that booked it
  // (the usual complainant) and who it was assigned to — the driver, rep and
  // supplier a complaint can blame. The agent is only pre-filled on new
  // complaints and only while nothing has been chosen, so it never overwrites
  // a deliberate pick; the assignment is always read, because the form shows
  // who blaming a party will actually name.
  useEffect(() => {
    if (!open || !form.trafficJobId) {
      setAssignment(null);
      return;
    }

    let cancelled = false;
    api
      .get(`/traffic-jobs/${form.trafficJobId}`)
      .then((res) => {
        if (cancelled) return;
        const job = res.data?.data ?? res.data;
        setAssignment(job?.assignment ?? null);
        if (!isEdit && !form.agentId && job?.agentId) set("agentId", job.agentId);
      })
      .catch(() => {
        if (!cancelled) setAssignment(null);
      });

    return () => {
      cancelled = true;
    };
    // form.agentId is deliberately not a dependency: it changes as a result of
    // this effect, and re-running would refetch the job for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.trafficJobId, isEdit]);

  /**
   * Ticking categories pre-fills the responsible party from the first category
   * that declares one — on new complaints only, and only while nobody has been
   * blamed yet, so it never argues with a deliberate choice.
   */
  const onCategoriesChange = (categoryIds: string[]) => {
    setForm((f) => {
      const defaultParty = categoryIds
        .map((id) => categories.find((c) => c.id === id)?.defaultParty)
        .find((p): p is ComplaintParty => Boolean(p) && p !== "NONE");

      return {
        ...f,
        categoryIds,
        responsibleParties:
          !isEdit && f.responsibleParties.length === 0 && defaultParty
            ? [defaultParty]
            : f.responsibleParties,
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.trafficJobId) return toast.error("Pick the job this complaint is about.");
    if (form.categoryIds.length === 0)
      return toast.error("Pick at least one complaint category.");
    if (!form.subject.trim()) return toast.error("Enter a subject.");
    if (!form.description.trim()) return toast.error("Enter a description.");
    if (!form.complaintDate) return toast.error("Enter when the complaint was received.");

    const payload: Record<string, unknown> = {
      // The first tick is the primary category; the backend stores both.
      categoryIds: form.categoryIds,
      stage: form.stage,
      source: form.source,
      // Only meaningful when an agent raised it; otherwise the backend
      // keeps the job's own agent.
      agentId: form.source === "AGENT" && form.agentId ? form.agentId : undefined,
      subject: form.subject.trim(),
      description: form.description.trim(),
      complaintDate: new Date(form.complaintDate).toISOString(),
      slaHours: Number(form.slaHours) || 48,
      // Null clears a reply that was logged by mistake and restarts the countdown.
      repliedAt: form.repliedAt ? new Date(form.repliedAt).toISOString() : null,
      outcome: form.outcome || null,
      // No person ids: the backend names the driver, rep and supplier from the
      // job's own assignment, so the complaint can only ever blame whoever
      // actually worked it.
      responsibleParties: form.responsibleParties,
    };

    // Only send money fields when the user is allowed to set them, so a
    // read-only user's PATCH is never rejected for touching them — and only
    // for a lost case, since that is the only outcome that costs anything.
    if (canEditAmounts && form.outcome === "LOST") {
      if (form.claimedAmount !== "") payload.claimedAmount = Number(form.claimedAmount);
      if (form.lossAmount !== "") payload.lossAmount = Number(form.lossAmount);
      payload.currency = form.currency;
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

  // Deadline maths mirrors computeReplyDueAt on the backend: received + window.
  const replyDueAt = form.complaintDate
    ? new Date(
        new Date(form.complaintDate).getTime() + (Number(form.slaHours) || 48) * 3_600_000,
      )
    : null;
  const replyWindow =
    replyDueAt && !Number.isNaN(replyDueAt.getTime())
      ? describeReplyWindow(replyDueAt, form.repliedAt || null, now)
      : null;

  const replyWindowClass =
    replyWindow?.tone === "danger"
      ? "text-destructive"
      : replyWindow?.tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  // A complaint already settled through a transition keeps the outcome that
  // settlement wrote — the backend rejects an edit that contradicts it.
  const outcomeLocked =
    !!complaint &&
    TERMINAL_STATUSES.includes(complaint.status) &&
    complaint.status !== "CANCELLED";

  /** Winning concedes nothing, so the loss it may have carried goes with it. */
  const onOutcomeChange = (outcome: ComplaintOutcome) =>
    setForm((f) => ({
      ...f,
      outcome,
      lossAmount: outcome === "WON" ? "" : f.lossAmount,
    }));

  /**
   * Who each blamed party resolves to on the selected job. Nothing is picked
   * here — this only shows what the backend will record, including the case
   * where the job has nobody in that seat yet.
   */
  const assignedNames: Record<string, string | null> = {
    DRIVER: assignment?.driver?.name ?? null,
    REP: assignment?.rep?.name ?? null,
    SUPPLIER:
      assignment?.supplier?.tradeName || assignment?.supplier?.legalName || null,
  };

  const namedParties = form.responsibleParties.filter((p) =>
    ASSIGNABLE_PARTIES.includes(p),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[80vw] max-w-none sm:max-w-none overflow-y-auto">
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
                  onSearchChange={setJobQuery}
                  loading={jobSearching}
                  placeholder="Search a job by reference…"
                  searchPlaceholder="Job ref, agent ref or client name…"
                  emptyText={
                    jobQuery.trim().length < 2
                      ? "Type at least 2 characters."
                      : "No matching jobs."
                  }
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
            <Label>Categories *</Label>
            <div className="mt-1">
              <MultiSelect
                items={categories.map((c) => ({ value: c.id, label: c.nameEn }))}
                value={form.categoryIds}
                onChange={onCategoriesChange}
                placeholder="Select one or more categories"
                searchPlaceholder="Search categories…"
                emptyText="No categories found."
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              One incident is often several things at once. The first pick is the
              main one, and is what reports group by.
            </p>
          </div>

          <div>
            <Label>Stage *</Label>
            <Select value={form.stage} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_STAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {STAGE_LABELS[value]}
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

          {form.source === "AGENT" && (
            <div>
              <Label>Which agent{isEdit ? "" : " *"}</Label>
              <div className="mt-1">
                <SearchableCombobox
                  items={agents}
                  value={form.agentId}
                  onChange={(v) => set("agentId", v)}
                  placeholder="Select the agent…"
                  searchPlaceholder="Search agents…"
                  emptyText="No agents found."
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Anything conceded on this complaint is owed to this agent.
              </p>
            </div>
          )}

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

          <div>
            <Label>Replied on</Label>
            <Input
              type="datetime-local"
              value={form.repliedAt}
              onChange={(e) => set("repliedAt", e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              When the reply actually went out. Leave empty until it has — clearing it
              puts the complaint back inside the countdown.
            </p>
          </div>

          <div>
            <Label>Time left to reply</Label>
            <Input
              value={replyWindow?.label ?? "—"}
              readOnly
              tabIndex={-1}
              className={`mt-1 font-medium ${replyWindowClass}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {replyDueAt && !Number.isNaN(replyDueAt.getTime())
                ? `Deadline ${replyDueAt.toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Set the date received to see the deadline."}
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
            <Label>Responsible parties</Label>
            <div className="mt-1">
              <MultiSelect
                items={Object.entries(PARTY_LABELS)
                  .filter(([value]) => value !== "NONE")
                  .map(([value, label]) => ({ value, label }))}
                value={form.responsibleParties}
                onChange={(v) => set("responsibleParties", v as ComplaintParty[])}
                placeholder="No one"
                searchable={false}
                emptyText="No parties."
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Leave empty when nobody is at fault. More than one can be blamed.
            </p>
          </div>

          {namedParties.length > 0 && (
            <div>
              <Label>Who exactly</Label>
              <div className="mt-1 space-y-1 rounded-md border px-3 py-2 text-sm">
                {namedParties.map((party) => (
                  <div key={party} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{PARTY_LABELS[party]}</span>
                    <span className={assignedNames[party] ? "" : "text-muted-foreground"}>
                      {assignedNames[party] ??
                        (form.trafficJobId
                          ? "Nobody assigned to this job"
                          : "Pick a job first")}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Taken from the job&apos;s own assignment — there is nothing to pick.
              </p>
            </div>
          )}

          <div className="sm:col-span-2 mt-2 border-t pt-3">
            <p className="text-sm font-medium">Outcome</p>
            <p className="text-xs text-muted-foreground">
              Money is only owed on a lost case — the amounts appear once you pick
              Lost.
            </p>
            <div className="mt-2">
              <ComplaintOutcomeRadios
                name="complaint-form-outcome"
                value={form.outcome}
                onChange={onOutcomeChange}
                onClear={() => set("outcome", "")}
                disabled={outcomeLocked}
              />
            </div>
            {outcomeLocked && (
              <p className="mt-1 text-xs text-muted-foreground">
                This complaint was settled as{" "}
                {complaint?.status.toLowerCase().replace("_", " ")}; its outcome can no
                longer be changed.
              </p>
            )}
          </div>

          {canEditAmounts && form.outcome === "LOST" && (
            <>
              <div className="sm:col-span-2">
                <p className="text-sm font-medium">Amounts</p>
                <p className="text-xs text-muted-foreground">
                  What the agent claimed, and what we conceded to settle it. The
                  conceded amount is what the agent is credited.
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
