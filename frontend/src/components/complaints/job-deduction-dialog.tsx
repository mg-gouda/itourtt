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
  type ComplaintCharge,
  type ComplaintParty,
  CURRENCIES,
  CHARGE_STATUS_META,
  PARTY_LABELS,
  formatMoney,
} from "@/lib/complaints";

/** What the dispatch grid knows about a complaint already logged on a job. */
export interface JobComplaintRef {
  id: string;
  complaintNo: string;
  subject?: string;
  status?: string;
}

/** A deduction as the grid reads it back — it may not belong to a complaint yet. */
interface JobCharge extends ComplaintCharge {
  trafficJobId: string;
  complaint?: { id: string; complaintNo: string; subject: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobRef: string;
  /** Which party the grid was showing — the fleet grid means the driver. */
  defaultParty: ComplaintParty;
  driver?: { id: string; name: string } | null;
  rep?: { id: string; name: string } | null;
  /** Complaints already logged against the job, newest first. May be empty. */
  complaints?: JobComplaintRef[];
  /** Refresh the day view, so a second open reads the saved amount back. */
  onSaved?: () => void;
}

/**
 * Deducting from the driver or the rep without leaving the dispatch grid.
 *
 * The deduction belongs to the **job**, not to a complaint — it is raised the
 * moment something goes wrong, long before anyone writes the complaint up. A
 * complaint logged against the same job afterwards adopts it, and from then on
 * it is that complaint's party charge, overridable there while still pending.
 * Either way it is one PENDING charge that has to be approved and posted before
 * it reaches anybody's pay.
 */
export function JobDeductionDialog({
  open,
  onOpenChange,
  jobId,
  jobRef,
  defaultParty,
  driver,
  rep,
  complaints = [],
  onSaved,
}: Props) {
  const [charges, setCharges] = useState<JobCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState<ComplaintParty>(defaultParty);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [reason, setReason] = useState("");

  // Money can only be taken from someone who actually worked the job, so the
  // options are the people on its own assignment. An external driver has no
  // Driver row and therefore no fee to deduct from.
  const people: { party: ComplaintParty; id: string; name: string }[] = [];
  if (driver?.id) people.push({ party: "DRIVER", id: driver.id, name: driver.name });
  if (rep?.id) people.push({ party: "REP", id: rep.id, name: rep.name });

  const selected = people.find((p) => p.party === party) ?? people[0] ?? null;
  const existing = selected
    ? (charges.find((c) => c.party === selected.party && c.status !== "VOID") ?? null)
    : null;

  const fetchCharges = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await api.get(`/complaint-charges?trafficJobId=${jobId}`);
      setCharges(res.data.data ?? []);
    } catch {
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, [open, jobId]);

  useEffect(() => {
    if (open) setParty(defaultParty);
  }, [open, defaultParty]);

  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  // Whatever is already on the row is what the form opens with, so the dialog
  // shows the standing deduction rather than a blank slate.
  useEffect(() => {
    setAmount(existing ? String(existing.amount) : "");
    setCurrency(existing?.currency ?? "EGP");
    setReason(existing?.reason ?? "");
  }, [existing]);

  const locked = existing != null && existing.status !== "PENDING";

  // The complaint the deduction already belongs to, if one has adopted it;
  // otherwise the newest complaint on the job, which is what it would join.
  const linked = existing?.complaint ?? complaints[0] ?? null;

  const handleSave = async () => {
    if (!selected) return;
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("Enter the amount to deduct.");
      return;
    }

    setSaving(true);
    try {
      if (existing) {
        await api.patch(`/complaint-charges/${existing.id}`, {
          amount: value,
          currency,
          reason: reason.trim() || "",
        });
        toast.success("Deduction updated");
      } else {
        await api.post(`/complaint-charges`, {
          trafficJobId: jobId,
          party: selected.party,
          driverId: selected.party === "DRIVER" ? selected.id : undefined,
          repId: selected.party === "REP" ? selected.id : undefined,
          amount: value,
          currency,
          reason: reason.trim() || undefined,
        });
        toast.success("Deduction recorded");
      }
      await fetchCharges();
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "The deduction could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[92vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Deduction — <span className="font-mono">{jobRef}</span>
            {linked && (
              <Link
                href={`/dashboard/complaints?complaint=${linked.id}`}
                className="inline-flex items-center gap-1 font-mono text-sm text-primary underline underline-offset-4"
              >
                {linked.complaintNo}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </DialogTitle>
          <DialogDescription>
            {existing?.complaint
              ? `Part of complaint ${existing.complaint.complaintNo}.`
              : complaints.length > 0
                ? "The complaint on this job will pick this deduction up."
                : "No complaint has been logged yet — the first one written up for this job will adopt this deduction."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : people.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nobody with a fee is assigned to this job yet, so there is nothing to
            deduct from.
          </p>
        ) : (
          <div className="space-y-4">
            {existing && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={CHARGE_STATUS_META[existing.status].variant}>
                  {CHARGE_STATUS_META[existing.status].label}
                </Badge>
                <span className="text-muted-foreground">
                  {formatMoney(existing.amount, existing.currency)} already standing
                  against this {PARTY_LABELS[existing.party].toLowerCase()}
                </span>
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
                  {people.map((p) => (
                    <SelectItem key={p.party} value={p.party}>
                      {PARTY_LABELS[p.party]} — {p.name}
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
                : "Recorded as pending. It still has to be approved and posted on the complaints screen before it reaches their fees."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!locked && people.length > 0 && (
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
