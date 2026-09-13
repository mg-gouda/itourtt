"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  type Complaint,
  type ComplaintParty,
  CURRENCIES,
  CHARGE_STATUS_META,
  COMPLAINT_STATUS_META,
  PARTY_LABELS,
  chargeForParty,
  responsibleParties,
  formatMoney,
} from "@/lib/complaints";

/** What the dispatch grid already knows about a complaint on a job. */
export interface JobComplaintRef {
  id: string;
  complaintNo: string;
  subject?: string;
  status?: string;
  responsibleParties?: ComplaintParty[];
  responsibleParty?: ComplaintParty | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every complaint logged against the job, newest first. */
  complaints: JobComplaintRef[];
  /** Which party the grid was showing — the fleet grid means the driver. */
  defaultParty: ComplaintParty;
  jobRef: string;
  driverName?: string | null;
  repName?: string | null;
  /** Refresh the day view, so a second open reads the saved amount back. */
  onSaved?: () => void;
}

/**
 * Deducting from the driver or the rep without leaving the dispatch grid.
 *
 * The deduction is not a new kind of record: it is the complaint's own party
 * charge, raised here instead of on the complaints screen, so it lands in the
 * same place — a PENDING charge that still has to be approved and posted before
 * it reaches anybody's pay. Re-opening the dialog reads back what was typed,
 * and the complaints screen can override it while it is still pending.
 */
export function JobDeductionDialog({
  open,
  onOpenChange,
  complaints,
  defaultParty,
  jobRef,
  driverName,
  repName,
  onSaved,
}: Props) {
  const [complaintId, setComplaintId] = useState(complaints[0]?.id ?? "");
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState<ComplaintParty>(defaultParty);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setComplaintId(complaints[0]?.id ?? "");
      setParty(defaultParty);
    }
  }, [open, complaints, defaultParty]);

  // The grid is deliberately told nothing about money: the amounts live behind
  // complaints.financial.viewAmounts, and GET /complaints/:id is the one place
  // that redaction is applied.
  const fetchComplaint = useCallback(async () => {
    if (!open || !complaintId) {
      setComplaint(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/complaints/${complaintId}`);
      setComplaint(res.data.data);
    } catch {
      setComplaint(null);
      toast.error("Could not load the complaint");
    } finally {
      setLoading(false);
    }
  }, [open, complaintId]);

  useEffect(() => {
    fetchComplaint();
  }, [fetchComplaint]);

  // Only the parties this complaint blames, and only those with someone in the
  // seat — nobody can be deducted from for a job they were not on.
  const chargeable: { party: ComplaintParty; name: string; personId: string }[] = [];
  if (complaint) {
    const blamed = responsibleParties(complaint);
    if (blamed.includes("DRIVER") && complaint.responsibleDriverId) {
      chargeable.push({
        party: "DRIVER",
        name: complaint.responsibleDriver?.name ?? driverName ?? "Driver",
        personId: complaint.responsibleDriverId,
      });
    }
    if (blamed.includes("REP") && complaint.responsibleRepId) {
      chargeable.push({
        party: "REP",
        name: complaint.responsibleRep?.name ?? repName ?? "Rep",
        personId: complaint.responsibleRepId,
      });
    }
  }

  const selected = chargeable.find((c) => c.party === party) ?? chargeable[0] ?? null;
  const existing = complaint && selected ? chargeForParty(complaint, selected.party) : null;

  // Whatever is already on the row is what the form opens with, so the dialog
  // shows the standing deduction rather than a blank slate.
  useEffect(() => {
    setAmount(existing ? String(existing.amount) : "");
    setCurrency(existing?.currency ?? complaint?.currency ?? "EGP");
    setReason(existing?.reason ?? "");
  }, [existing, complaint?.currency]);

  const locked = existing != null && existing.status !== "PENDING";

  const handleSave = async () => {
    if (!complaint || !selected) return;
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("Enter the amount to deduct.");
      return;
    }

    setSaving(true);
    try {
      if (existing) {
        await api.patch(`/complaints/${complaint.id}/charge/${existing.id}`, {
          amount: value,
          currency,
          reason: reason.trim() || "",
        });
        toast.success("Deduction updated");
      } else {
        await api.post(`/complaints/${complaint.id}/charge`, {
          party: selected.party,
          driverId: selected.party === "DRIVER" ? selected.personId : undefined,
          repId: selected.party === "REP" ? selected.personId : undefined,
          amount: value,
          currency,
          reason: reason.trim() || undefined,
        });
        toast.success("Deduction recorded");
      }
      await fetchComplaint();
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "The deduction could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const active = complaints.find((c) => c.id === complaintId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[92vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Deduction
            {active && (
              <Link
                href={`/dashboard/complaints?complaint=${active.id}`}
                className="inline-flex items-center gap-1 font-mono text-sm text-primary underline underline-offset-4"
              >
                {active.complaintNo}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </DialogTitle>
          <DialogDescription>
            Job {jobRef}
            {active?.subject ? ` — ${active.subject}` : ""}
          </DialogDescription>
        </DialogHeader>

        {complaints.length > 1 && (
          <div>
            <Label>Complaint</Label>
            <Select value={complaintId} onValueChange={setComplaintId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {complaints.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.complaintNo}
                    {c.subject ? ` — ${c.subject}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !complaint ? (
          <p className="py-4 text-sm text-muted-foreground">
            This complaint could not be loaded.
          </p>
        ) : chargeable.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {complaint.complaintNo} does not blame a driver or a rep who worked
            this job, so there is nobody here to deduct from.
          </p>
        ) : (
          <div className="space-y-4">
            {complaint.status && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant={
                    COMPLAINT_STATUS_META[complaint.status]?.variant ?? "secondary"
                  }
                >
                  {COMPLAINT_STATUS_META[complaint.status]?.label ?? complaint.status}
                </Badge>
                {existing && (
                  <>
                    <Badge variant={CHARGE_STATUS_META[existing.status].variant}>
                      {CHARGE_STATUS_META[existing.status].label}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatMoney(existing.amount, existing.currency)} already on
                      this complaint
                    </span>
                  </>
                )}
              </div>
            )}

            <div>
              <Label>Related to</Label>
              <Select
                value={selected?.party ?? ""}
                onValueChange={(v) => setParty(v as ComplaintParty)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chargeable.map((c) => (
                    <SelectItem key={c.party} value={c.party}>
                      {PARTY_LABELS[c.party]} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Deduction amount</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  disabled={locked}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={locked}>
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
            </div>

            <div>
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={reason}
                disabled={locked}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why the money is being taken…"
                className="mt-1"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {locked
                ? "This deduction has been approved, so it can no longer be changed here. Void it on the complaint to start again."
                : "The deduction is recorded against the complaint. It still has to be approved and posted on the complaints screen before it reaches their fees."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!locked && chargeable.length > 0 && (
            <Button disabled={saving || loading} onClick={handleSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existing ? "Update deduction" : "Save deduction"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
