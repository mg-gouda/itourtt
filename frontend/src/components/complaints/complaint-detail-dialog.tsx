"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import { usePermission } from "@/hooks/use-permission";
import { APP_TZ } from "@/lib/utils";
import {
  type Complaint,
  type ComplaintStatus,
  CURRENCIES,
  COMPLAINT_STATUS_META,
  STAGE_LABELS,
  SOURCE_LABELS,
  PARTY_LABELS,
  NEXT_STATUSES,
  TRANSITION_PERMISSION,
  formatSlaCountdown,
  formatMoney,
} from "@/lib/complaints";
import { ComplaintChargePanel } from "@/components/complaints/complaint-charge-panel";

interface Props {
  complaintId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called after any change so the list behind the dialog refreshes. */
  onChanged: () => void;
}

/** Outcomes that need an amount before the backend will accept the move. */
const LOSS_STATUSES: ComplaintStatus[] = ["LOST", "PARTIALLY_LOST"];

interface UserOption {
  id: string;
  name: string;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    timeZone: APP_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export function ComplaintDetailDialog({ complaintId, onOpenChange, onChanged }: Props) {
  const canAssign = usePermission("complaints.assign");
  const canViewAmounts = usePermission("complaints.financial.viewAmounts");
  const canViewAttachments = usePermission("complaints.attachments.view");

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  // Outcome form — only shown once a loss-bearing status is picked.
  const [target, setTarget] = useState<ComplaintStatus | null>(null);
  const [note, setNote] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [lossAmount, setLossAmount] = useState("");
  const [currency, setCurrency] = useState<string>("EGP");
  const [exchangeRate, setExchangeRate] = useState("1");

  const [users, setUsers] = useState<UserOption[]>([]);

  const resetOutcome = useCallback(() => {
    setTarget(null);
    setNote("");
    setClaimedAmount("");
    setLossAmount("");
    setCurrency("EGP");
    setExchangeRate("1");
  }, []);

  const fetchComplaint = useCallback(async () => {
    if (!complaintId) return;
    setLoading(true);
    try {
      const res = await api.get(`/complaints/${complaintId}`);
      const data: Complaint = res.data.data;
      setComplaint(data);
      setClaimedAmount(data.claimedAmount != null ? String(data.claimedAmount) : "");
      setCurrency(data.currency ?? "EGP");
      setExchangeRate(data.exchangeRate != null ? String(data.exchangeRate) : "1");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load the complaint");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [complaintId, onOpenChange]);

  useEffect(() => {
    if (complaintId) {
      resetOutcome();
      fetchComplaint();
    } else {
      setComplaint(null);
    }
  }, [complaintId, fetchComplaint, resetOutcome]);

  // The users list is ADMIN-only server-side; if it 403s we simply drop the
  // assign control rather than showing a broken dropdown.
  useEffect(() => {
    if (!complaintId || !canAssign || users.length > 0) return;
    api
      .get("/users?limit=200")
      .then((res) => setUsers(res.data?.data ?? []))
      .catch(() => setUsers([]));
  }, [complaintId, canAssign, users.length]);

  const handleTransition = async () => {
    if (!complaint || !target) return;

    const body: Record<string, unknown> = { status: target };
    if (note.trim()) body.note = note.trim();

    if (LOSS_STATUSES.includes(target)) {
      const loss = Number(lossAmount);
      if (!lossAmount || Number.isNaN(loss) || loss <= 0) {
        toast.error("Enter the amount we conceded before recording a loss.");
        return;
      }
      body.lossAmount = loss;
      if (claimedAmount) body.claimedAmount = Number(claimedAmount);
      body.currency = currency;
      body.exchangeRate = Number(exchangeRate) || 1;
    }

    setWorking(true);
    try {
      await api.post(`/complaints/${complaint.id}/transition`, body);
      toast.success(`Complaint marked ${COMPLAINT_STATUS_META[target].label}`);
      resetOutcome();
      await fetchComplaint();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not change the status");
    } finally {
      setWorking(false);
    }
  };

  const handleAssign = async (value: string) => {
    if (!complaint) return;
    setWorking(true);
    try {
      await api.patch(`/complaints/${complaint.id}/assign`, {
        assignedToId: value === "none" ? null : value,
      });
      toast.success("Owner updated");
      await fetchComplaint();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not assign the complaint");
    } finally {
      setWorking(false);
    }
  };

  const handleChanged = useCallback(async () => {
    await fetchComplaint();
    onChanged();
  }, [fetchComplaint, onChanged]);

  const sla = complaint ? formatSlaCountdown(complaint) : null;
  const nextStatuses = complaint ? NEXT_STATUSES[complaint.status] : [];
  const responsibleName =
    complaint?.responsibleDriver?.name ||
    complaint?.responsibleRep?.name ||
    complaint?.responsibleSupplier?.tradeName ||
    complaint?.responsibleSupplier?.legalName ||
    null;

  return (
    <Dialog open={!!complaintId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[92vw] max-w-5xl overflow-y-auto">
        {loading || !complaint ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {complaint.complaintNo}
                <Badge variant={COMPLAINT_STATUS_META[complaint.status].variant}>
                  {COMPLAINT_STATUS_META[complaint.status].label}
                </Badge>
                {complaint.slaBreached && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    SLA breached
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>{complaint.subject}</DialogDescription>
            </DialogHeader>

            {/* Reply window */}
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                sla?.tone === "danger"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : sla?.tone === "warning"
                    ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
            >
              {sla?.tone === "ok" && complaint.repliedAt ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 shrink-0" />
              )}
              <span>
                {sla?.label} · reply due {formatDateTime(complaint.replyDueAt)} (
                {complaint.slaHours}h from receipt)
              </span>
            </div>

            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Job">
                {complaint.trafficJob ? (
                  <a
                    href={`/dashboard/traffic-jobs?search=${complaint.trafficJob.internalRef}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {complaint.trafficJob.internalRef}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Agent">
                {complaint.agent?.tradeName || complaint.agent?.legalName || "—"}
              </Field>
              <Field label="Job date">
                {complaint.trafficJob
                  ? new Date(complaint.trafficJob.jobDate).toLocaleDateString("en-GB", {
                      timeZone: APP_TZ,
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </Field>

              <Field label="Category">{complaint.category?.nameEn ?? "—"}</Field>
              <Field label="Stage">{STAGE_LABELS[complaint.stage] ?? complaint.stage}</Field>
              <Field label="Source">{SOURCE_LABELS[complaint.source] ?? complaint.source}</Field>

              <Field label="Received">{formatDateTime(complaint.complaintDate)}</Field>
              <Field label="Replied">{formatDateTime(complaint.repliedAt)}</Field>
              <Field label="Resolved">{formatDateTime(complaint.resolvedAt)}</Field>

              <Field label="Responsible">
                {complaint.responsibleParty
                  ? `${PARTY_LABELS[complaint.responsibleParty]}${
                      responsibleName ? ` — ${responsibleName}` : ""
                    }`
                  : "—"}
              </Field>
              <Field label="Score penalty">
                {complaint.scorePenaltyApplied > 0
                  ? `−${complaint.scorePenaltyApplied} pts`
                  : "None"}
              </Field>
              <Field label="Logged by">{complaint.createdBy?.name ?? "—"}</Field>
            </div>

            {complaint.scorePenaltyNote && (
              <p className="text-xs text-muted-foreground">{complaint.scorePenaltyNote}</p>
            )}

            <Separator />

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Description
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{complaint.description}</p>
            </div>

            {/* Money — the backend omits these fields entirely without viewAmounts */}
            {canViewAmounts && (
              <>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Claimed">
                    {formatMoney(complaint.claimedAmount, complaint.currency)}
                  </Field>
                  <Field label="Loss conceded">
                    {formatMoney(complaint.lossAmount, complaint.currency)}
                  </Field>
                  <Field label="Exchange rate">{complaint.exchangeRate ?? "—"}</Field>
                </div>
              </>
            )}

            {/* Charge and adjustments live behind viewAmounts — the backend
                strips both from the payload without it. */}
            {canViewAmounts && (
              <ComplaintChargePanel complaint={complaint} onChanged={handleChanged} />
            )}

            {canViewAttachments && complaint.attachments && complaint.attachments.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Attachments
                  </div>
                  <ul className="mt-1 space-y-1">
                    {complaint.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span>{a.fileName}</span>
                        <span className="text-xs text-muted-foreground">({a.kind})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Ownership */}
            {canAssign && users.length > 0 && (
              <>
                <Separator />
                <div className="max-w-sm">
                  <Label>Owner</Label>
                  <Select
                    value={complaint.assignedToId ?? "none"}
                    onValueChange={handleAssign}
                    disabled={working}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Status changes */}
            <Separator />
            {nextStatuses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This complaint is {COMPLAINT_STATUS_META[complaint.status].label.toLowerCase()} and
                can no longer be changed.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Move to
                </div>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <TransitionButton
                      key={s}
                      status={s}
                      active={target === s}
                      onSelect={() => setTarget(target === s ? null : s)}
                    />
                  ))}
                </div>

                {target && (
                  <div className="space-y-3 rounded-md border p-3">
                    {LOSS_STATUSES.includes(target) && (
                      <>
                        {!canViewAmounts && (
                          <p className="text-xs text-muted-foreground">
                            Recording a loss requires the amount we conceded.
                          </p>
                        )}
                        <div className="grid gap-3 sm:grid-cols-4">
                          <div>
                            <Label>Claimed</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={claimedAmount}
                              onChange={(e) => setClaimedAmount(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>Loss conceded *</Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={lossAmount}
                              onChange={(e) => setLossAmount(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label>Currency</Label>
                            <Select value={currency} onValueChange={setCurrency}>
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
                              value={exchangeRate}
                              onChange={(e) => setExchangeRate(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        {target === "PARTIALLY_LOST" && (
                          <p className="text-xs text-muted-foreground">
                            A partial loss needs both a claimed amount and a smaller conceded
                            amount.
                          </p>
                        )}
                      </>
                    )}

                    <div>
                      <Label>Note</Label>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What was agreed, and with whom"
                        rows={2}
                        className="mt-1"
                      />
                    </div>

                    <Button onClick={handleTransition} disabled={working}>
                      {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Mark {COMPLAINT_STATUS_META[target].label}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One status button, hidden entirely when the role cannot make that move —
 * the backend gates each target status with its own permission key.
 */
function TransitionButton({
  status,
  active,
  onSelect,
}: {
  status: ComplaintStatus;
  active: boolean;
  onSelect: () => void;
}) {
  const allowed = usePermission(TRANSITION_PERMISSION[status]);
  if (!allowed) return null;

  const meta = COMPLAINT_STATUS_META[status];
  return (
    <Button
      size="sm"
      variant={active ? "default" : meta.variant === "destructive" ? "destructive" : "outline"}
      onClick={onSelect}
    >
      {meta.label}
    </Button>
  );
}
