"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, FileMinus, Ban, Receipt } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useT } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-permission";
import { APP_TZ } from "@/lib/utils";
import {
  type AgentAdjustment,
  ADJUSTMENT_STATUS_META,
  formatMoney,
} from "@/lib/complaints";

const LIMIT = 20;

type DialogMode = "invoice" | "creditNote" | "waive" | null;

export default function AgentAdjustmentsPage() {
  const t = useT();

  const canOnInvoice = usePermission("finance.agentAdjustments.onInvoice");
  const canCreditNote = usePermission("finance.agentAdjustments.creditNote");
  const canWaive = usePermission("finance.agentAdjustments.waive");

  const [rows, setRows] = useState<AgentAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");

  const [mode, setMode] = useState<DialogMode>(null);
  const [active, setActive] = useState<AgentAdjustment | null>(null);
  const [reason, setReason] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoices, setInvoices] = useState<ComboboxItem[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await api.get(`/agent-adjustments?${params.toString()}`);
      setRows(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch {
      toast.error(t("agentAdjustments.loadFailed") || "Failed to load adjustments");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  /** Draft invoices for the same agent are the only valid targets. */
  const openInvoiceDialog = async (row: AgentAdjustment) => {
    setActive(row);
    setInvoiceId("");
    setMode("invoice");
    try {
      const res = await api.get(
        `/finance/invoices?agentId=${row.agentId}&status=DRAFT&limit=100`,
      );
      const list = res.data?.data ?? [];
      setInvoices(
        list.map((inv: Record<string, string>) => ({
          value: inv.id,
          label: inv.invoiceNumber,
          sub: `${inv.currency} ${inv.total}`,
        })),
      );
    } catch {
      setInvoices([]);
      toast.error("Could not load this agent's draft invoices");
    }
  };

  const closeDialog = () => {
    setMode(null);
    setActive(null);
    setReason("");
    setInvoiceId("");
  };

  const handleConfirm = async () => {
    if (!active) return;
    setSaving(true);
    try {
      if (mode === "invoice") {
        if (!invoiceId) {
          toast.error("Pick the draft invoice to add it to.");
          setSaving(false);
          return;
        }
        await api.post(`/agent-adjustments/${active.id}/attach`, { invoiceId });
        toast.success("Adjustment added to the invoice");
      } else if (mode === "creditNote") {
        await api.post(`/agent-adjustments/${active.id}/disposition`, {
          disposition: "CREDIT_NOTE",
        });
        toast.success("Credit note issued");
      } else {
        if (!reason.trim()) {
          toast.error("Say why this is being waived.");
          setSaving(false);
          return;
        }
        await api.post(`/agent-adjustments/${active.id}/disposition`, {
          disposition: "WAIVE",
          reason: reason.trim(),
        });
        toast.success("Adjustment waived");
      }
      closeDialog();
      await fetchAdjustments();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "The action failed");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("agentAdjustments.title") || "Agent Adjustments"}
        description={
          t("agentAdjustments.description") ||
          "Money owed to agents from lost complaints — put it on an invoice, issue a credit note, or waive it"
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by adjustment # or description…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(ADJUSTMENT_STATUS_META).map(([value, meta]) => (
              <SelectItem key={value} value={value}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adjustment #</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Complaint</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Settle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Nothing outstanding.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.adjustmentNo}</TableCell>
                  <TableCell className="text-sm">
                    {row.agent?.tradeName || row.agent?.legalName || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{row.complaint?.complaintNo ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm">
                    {row.description}
                  </TableCell>
                  <TableCell>{formatMoney(row.amount, row.currency)}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(row.createdAt).toLocaleDateString("en-GB", {
                      timeZone: APP_TZ,
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Badge variant={ADJUSTMENT_STATUS_META[row.status].variant}>
                        {ADJUSTMENT_STATUS_META[row.status].label}
                      </Badge>
                      {row.creditNote && (
                        <span className="text-xs text-muted-foreground">
                          {row.creditNote.invoiceNumber}
                        </span>
                      )}
                      {row.status === "WAIVED" && row.waivedReason && (
                        <span className="text-xs text-muted-foreground">
                          {row.waivedReason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        {canOnInvoice && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openInvoiceDialog(row)}
                          >
                            <Receipt className="mr-1 h-3.5 w-3.5" />
                            Invoice
                          </Button>
                        )}
                        {canCreditNote && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActive(row);
                              setMode("creditNote");
                            }}
                          >
                            <FileMinus className="mr-1 h-3.5 w-3.5" />
                            Credit note
                          </Button>
                        )}
                        {canWaive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActive(row);
                              setMode("waive");
                            }}
                          >
                            <Ban className="mr-1 h-3.5 w-3.5" />
                            Waive
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Settled</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={mode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "invoice"
                ? "Add to a draft invoice"
                : mode === "creditNote"
                  ? "Issue a credit note"
                  : "Waive this adjustment"}
            </DialogTitle>
            <DialogDescription>
              {mode === "invoice"
                ? "The adjustment goes on as a negative, untaxed line and the invoice is re-totalled. Editing that invoice's lines later releases it back to pending."
                : mode === "creditNote"
                  ? "A standalone credit note is created for this agent. It exports to Odoo as an out_refund on the Credit Notes journal."
                  : "The agent is not paid and the adjustment is closed. Record why."}
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{active.adjustmentNo}</span> ·{" "}
              {formatMoney(active.amount, active.currency)} ·{" "}
              {active.agent?.tradeName || active.agent?.legalName}
            </div>
          )}

          {mode === "invoice" && (
            <div>
              <Label>Draft invoice</Label>
              <div className="mt-1">
                <SearchableCombobox
                  items={invoices}
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="Select a draft invoice…"
                  emptyText="This agent has no draft invoices."
                />
              </div>
            </div>
          )}

          {mode === "waive" && (
            <div>
              <Label>Reason *</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why we are not paying this"
                className="mt-1"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
