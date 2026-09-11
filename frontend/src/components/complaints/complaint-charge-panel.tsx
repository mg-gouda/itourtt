"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Banknote, Undo2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  type ComplaintParty,
  CURRENCIES,
  CHARGEABLE_PARTIES,
  responsibleParties,
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

/**
 * The money a complaint moves, in two halves: what we deduct from the party
 * that caused it, and what we owe the agent. Neither happens implicitly —
 * the charge is raised, approved and posted as three separate acts.
 */
export function ComplaintChargePanel({ complaint, onChanged }: Props) {
  const canCreate = usePermission("complaints.charge.create");
  const canApprove = usePermission("complaints.charge.approve");
  const canPost = usePermission("complaints.charge.post");
  const canVoid = usePermission("complaints.charge.void");

  const charge = complaint.charge ?? null;
  const adjustments = complaint.adjustments ?? [];

  const [working, setWorking] = useState(false);
  // A charge lands on one party. Default to the first party the complaint
  // blames that actually has a fee table to deduct from.
  const [party, setParty] = useState<ComplaintParty>(
    responsibleParties(complaint).find((p) => CHARGEABLE_PARTIES.includes(p)) ??
      "DRIVER",
  );
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState(
    complaint.lossAmount != null ? String(complaint.lossAmount) : "",
  );
  const [currency, setCurrency] = useState(complaint.currency ?? "EGP");
  const [people, setPeople] = useState<ComboboxItem[]>([]);

  // Pre-select whoever the complaint already blames, so the common case is
  // a single click on a form that is already filled in.
  useEffect(() => {
    const preset =
      party === "DRIVER"
        ? complaint.responsibleDriverId
        : party === "REP"
          ? complaint.responsibleRepId
          : complaint.responsibleSupplierId;
    setPartyId(preset ?? "");
  }, [party, complaint.responsibleDriverId, complaint.responsibleRepId, complaint.responsibleSupplierId]);

  const fetchPeople = useCallback(async () => {
    if (charge) return;
    const path =
      party === "DRIVER" ? "/drivers" : party === "REP" ? "/reps" : "/suppliers";
    try {
      const res = await api.get(`${path}?limit=1000`);
      const rows = res.data?.data ?? [];
      setPeople(
        rows.map((r: Record<string, string>) => ({
          value: r.id,
          label: r.name || r.tradeName || r.legalName,
        })),
      );
    } catch {
      setPeople([]);
    }
  }, [party, charge]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const act = async (
    path: string,
    body: Record<string, unknown> | undefined,
    success: string,
  ) => {
    setWorking(true);
    try {
      await api.post(`/complaints/${complaint.id}/${path}`, body ?? {});
      toast.success(success);
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "The charge action failed");
    } finally {
      setWorking(false);
    }
  };

  const handleRaise = () => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("Enter the amount to deduct.");
      return;
    }
    if (!partyId) {
      toast.error(`Pick which ${PARTY_LABELS[party].toLowerCase()} is being charged.`);
      return;
    }

    act(
      "charge",
      {
        party,
        driverId: party === "DRIVER" ? partyId : undefined,
        repId: party === "REP" ? partyId : undefined,
        supplierId: party === "SUPPLIER" ? partyId : undefined,
        amount: value,
        currency,
      },
      "Charge raised",
    );
  };

  const handleVoid = () => {
    const reason = window.prompt("Why is this charge being reversed?");
    if (!reason?.trim()) return;
    act("charge/void", { reason: reason.trim() }, "Charge voided");
  };

  const chargedName =
    charge?.driver?.name ||
    charge?.rep?.name ||
    charge?.supplier?.tradeName ||
    charge?.supplier?.legalName ||
    "—";

  return (
    <>
      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Banknote className="h-4 w-4" />
          Party charge
        </div>

        {charge ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={CHARGE_STATUS_META[charge.status].variant}>
                {CHARGE_STATUS_META[charge.status].label}
              </Badge>
              <span className="text-sm">
                {formatMoney(charge.amount, charge.currency)} against{" "}
                {PARTY_LABELS[charge.party]} — {chargedName}
              </span>
            </div>

            {charge.status === "POSTED" && (
              <p className="text-xs text-muted-foreground">
                A negative fee row was written against this job. It is unposted, so the usual
                period close still governs when it is paid out.
              </p>
            )}
            {charge.status === "VOID" && charge.voidReason && (
              <p className="text-xs text-muted-foreground">Voided: {charge.voidReason}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {charge.status === "PENDING" && canApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() => act("charge/approve", undefined, "Charge approved")}
                >
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve
                </Button>
              )}
              {charge.status === "APPROVED" && canPost && (
                <Button
                  size="sm"
                  disabled={working}
                  onClick={() => act("charge/post", undefined, "Charge posted")}
                >
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Post to fees
                </Button>
              )}
              {charge.status !== "VOID" && canVoid && (
                <Button size="sm" variant="ghost" disabled={working} onClick={handleVoid}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Void
                </Button>
              )}
            </div>
          </div>
        ) : canCreate ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label>Party</Label>
                <Select
                  value={party}
                  onValueChange={(v) => setParty(v as ComplaintParty)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGEABLE_PARTIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PARTY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Who</Label>
                <div className="mt-1">
                  <SearchableCombobox
                    items={people}
                    value={partyId}
                    onChange={setPartyId}
                    placeholder={`Select a ${PARTY_LABELS[party].toLowerCase()}…`}
                  />
                </div>
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
            </div>

            <div className="flex items-end gap-3">
              <div className="max-w-[180px]">
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
              <Button variant="outline" disabled={working} onClick={handleRaise}>
                {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Raise charge
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Raising a charge records the intent only. It still has to be approved and posted
              before anything reaches the party&apos;s pay.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No charge raised on this complaint.</p>
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
