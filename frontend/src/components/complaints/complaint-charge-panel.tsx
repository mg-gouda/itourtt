"use client";

import { useState } from "react";
import { Loader2, Banknote, Undo2, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermission } from "@/hooks/use-permission";
import {
  type Complaint,
  type ComplaintCharge,
  type ComplaintParty,
  CURRENCIES,
  CHARGEABLE_PARTIES,
  chargeForParty,
  responsibleDetails,
  CHARGE_STATUS_META,
  ADJUSTMENT_STATUS_META,
  PARTY_LABELS,
  formatMoney,
} from "@/lib/complaints";

interface Props {
  complaint: Complaint;
  /** Refetch the complaint after any charge action. */
  onChanged: () => void;
}

/** One line of the panel: a party blamed, and the deduction against them. */
interface PartyLine {
  party: ComplaintParty;
  /** Who the complaint already named — nobody picks this. */
  personId: string | null;
  personName: string | null;
  charge: ComplaintCharge | null;
}

/**
 * The money a complaint moves, in two halves: what we deduct from the parties
 * that caused it, and what we owe the agent. Neither happens implicitly — each
 * charge is raised, approved and posted as three separate acts.
 *
 * A complaint blames several people at once, so this is a line per blamed party,
 * each with its own deduction. A line whose amount was already typed on the
 * dispatch grid opens with that amount filled in, and it can be overridden here
 * until it is approved.
 */
export function ComplaintChargePanel({ complaint, onChanged }: Props) {
  const canCreate = usePermission("complaints.charge.create");
  const canApprove = usePermission("complaints.charge.approve");
  const canPost = usePermission("complaints.charge.post");
  const canVoid = usePermission("complaints.charge.void");

  const adjustments = complaint.adjustments ?? [];

  // Only the parties the complaint actually blames, and only those with a fee
  // table to deduct from. Nobody is picked here: the person is whoever the
  // complaint already named off the job's own assignment.
  const lines: PartyLine[] = responsibleDetails(complaint)
    .filter((d) => CHARGEABLE_PARTIES.includes(d.party))
    .map((d) => ({
      party: d.party,
      personId:
        d.party === "DRIVER"
          ? (complaint.responsibleDriverId ?? null)
          : d.party === "REP"
            ? (complaint.responsibleRepId ?? null)
            : (complaint.responsibleSupplierId ?? null),
      personName: d.names[0] ?? null,
      charge: chargeForParty(complaint, d.party),
    }));

  // Reversed charges are history, not state — they sit below the live lines so
  // the party they were against is chargeable again without losing the trail.
  const voided = (complaint.charges ?? []).filter((c) => c.status === "VOID");

  return (
    <>
      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Banknote className="h-4 w-4" />
          Party charge
          {lines.length > 1 && (
            <span className="normal-case tracking-normal">
              — one deduction per party blamed
            </span>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This complaint blames nobody with a fee to deduct from, so there is
            nothing to charge.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((line) => (
              <ChargeLine
                // Re-seed the inputs when the charge itself changes identity —
                // voided and raised again is a different deduction.
                key={`${line.party}:${line.charge?.id ?? "new"}`}
                complaintId={complaint.id}
                trafficJobId={complaint.trafficJobId}
                defaultCurrency={complaint.currency ?? "EGP"}
                fallbackAmount={complaint.lossAmount}
                line={line}
                can={{ canCreate, canApprove, canPost, canVoid }}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        {voided.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Reversed
            </div>
            {voided.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground"
              >
                <Badge variant={CHARGE_STATUS_META.VOID.variant}>
                  {CHARGE_STATUS_META.VOID.label}
                </Badge>
                <span>
                  {formatMoney(c.amount, c.currency)} against{" "}
                  {PARTY_LABELS[c.party]}
                </span>
                {c.voidReason && <span>— {c.voidReason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {adjustments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Owed to the agent
          </div>
          {adjustments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{a.adjustmentNo}</span>
              <Badge variant={ADJUSTMENT_STATUS_META[a.status].variant}>
                {ADJUSTMENT_STATUS_META[a.status].label}
              </Badge>
              <span>{formatMoney(a.amount, a.currency)}</span>
              {a.creditNote && (
                <span className="text-xs text-muted-foreground">
                  Credit note {a.creditNote.invoiceNumber}
                </span>
              )}
              {a.status === "PENDING" && (
                <span className="text-xs text-muted-foreground">
                  Finance decides how this is settled, on the Agent Adjustments screen.
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface LinePermissions {
  canCreate: boolean;
  canApprove: boolean;
  canPost: boolean;
  canVoid: boolean;
}

/**
 * One party's deduction. An existing charge — including one a dispatcher raised
 * from the grid — opens with its own amount, currency and reason, editable
 * until it is approved; a party with no charge yet opens on the complaint's
 * conceded amount as a starting point.
 */
function ChargeLine({
  complaintId,
  trafficJobId,
  defaultCurrency,
  fallbackAmount,
  line,
  can,
  onChanged,
}: {
  complaintId: string;
  trafficJobId: string;
  defaultCurrency: string;
  fallbackAmount?: number | string | null;
  line: PartyLine;
  can: LinePermissions;
  onChanged: () => void;
}) {
  const { charge } = line;
  const [working, setWorking] = useState(false);
  const [amount, setAmount] = useState(
    charge
      ? String(charge.amount)
      : fallbackAmount != null
        ? String(fallbackAmount)
        : "",
  );
  const [currency, setCurrency] = useState(charge?.currency ?? defaultCurrency);
  const [reason, setReason] = useState(charge?.reason ?? "");

  // Only a charge still awaiting approval may be rewritten. What was approved
  // is what stands; changing it means voiding it and raising another.
  const editable = can.canCreate && (!charge || charge.status === "PENDING");
  const dirty =
    charge != null &&
    (Number(amount) !== Number(charge.amount) ||
      currency !== charge.currency ||
      reason !== (charge.reason ?? ""));

  const call = async (
    method: "post" | "patch",
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setWorking(true);
    try {
      await api[method](`/complaint-charges${path}`, body);
      toast.success(success);
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "The charge action failed");
    } finally {
      setWorking(false);
    }
  };

  const validAmount = (): number | null => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("Enter the amount to deduct.");
      return null;
    }
    return value;
  };

  const handleRaise = () => {
    const value = validAmount();
    if (value === null) return;
    call(
      "post",
      "",
      {
        trafficJobId,
        complaintId,
        party: line.party,
        driverId: line.party === "DRIVER" ? line.personId : undefined,
        repId: line.party === "REP" ? line.personId : undefined,
        supplierId: line.party === "SUPPLIER" ? line.personId : undefined,
        amount: value,
        currency,
        reason: reason.trim() || undefined,
      },
      `Charge raised against the ${PARTY_LABELS[line.party].toLowerCase()}`,
    );
  };

  const handleOverride = () => {
    const value = validAmount();
    if (value === null || !charge) return;
    call(
      "patch",
      `/${charge.id}`,
      { amount: value, currency, reason: reason.trim() || "" },
      "Charge updated",
    );
  };

  const handleVoid = () => {
    if (!charge) return;
    const why = window.prompt("Why is this charge being reversed?");
    if (!why?.trim()) return;
    call("post", `/${charge.id}/void`, { reason: why.trim() }, "Charge voided");
  };

  // The complaint blames this party but the job has nobody in that seat, so
  // there is no one to deduct from.
  if (!line.personId) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        {PARTY_LABELS[line.party]} — nobody was assigned to this job, so there is
        nothing to deduct.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{PARTY_LABELS[line.party]}</Badge>
        <span className="text-sm font-medium">{line.personName ?? "—"}</span>
        {charge && (
          <Badge variant={CHARGE_STATUS_META[charge.status].variant}>
            {CHARGE_STATUS_META[charge.status].label}
          </Badge>
        )}
        {charge && !editable && (
          <span className="text-sm">{formatMoney(charge.amount, charge.currency)}</span>
        )}
      </div>

      {editable ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Amount to deduct</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
            <div className="sm:col-span-2">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why the money is being taken…"
                className="mt-1"
              />
            </div>
          </div>

          {charge ? (
            <p className="text-xs text-muted-foreground">
              Raised from dispatch. Override the amount here if it was wrong — it
              is fixed once approved.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Raising a charge records the intent only. It still has to be approved
              and posted before anything reaches their pay.
            </p>
          )}
        </>
      ) : (
        charge?.reason && (
          <p className="text-xs text-muted-foreground">Reason: {charge.reason}</p>
        )
      )}

      {charge?.status === "POSTED" && (
        <p className="text-xs text-muted-foreground">
          A negative fee row was written against this job. It is unposted, so the
          usual period close still governs when it is paid out.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!charge && can.canCreate && (
          <Button size="sm" variant="outline" disabled={working} onClick={handleRaise}>
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Raise charge
          </Button>
        )}
        {charge && editable && dirty && (
          <Button size="sm" variant="outline" disabled={working} onClick={handleOverride}>
            {working ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save override
          </Button>
        )}
        {charge?.status === "PENDING" && can.canApprove && (
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            onClick={() =>
              call("post", `/${charge.id}/approve`, {}, "Charge approved")
            }
          >
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        )}
        {charge?.status === "APPROVED" && can.canPost && (
          <Button
            size="sm"
            disabled={working}
            onClick={() => call("post", `/${charge.id}/post`, {}, "Charge posted")}
          >
            {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Post to fees
          </Button>
        )}
        {charge && charge.status !== "VOID" && can.canVoid && (
          <Button size="sm" variant="ghost" disabled={working} onClick={handleVoid}>
            <Undo2 className="mr-2 h-4 w-4" />
            Void
          </Button>
        )}
      </div>
    </div>
  );
}
