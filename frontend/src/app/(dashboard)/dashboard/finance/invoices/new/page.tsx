"use client";

// Create Invoice — its own page (was a modal on /dashboard/finance).
// Agent invoices: pick agent + job period, fetch jobs, price them, issue one invoice
// (PDF + Excel download right after). Customer invoices: pick customer + period, fetch
// COMPLETED uninvoiced jobs (priced from the customer route price list), generate.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate, localDateStr } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { formatMoney } from "@/lib/format";

/* ─── Types ─────────────────────────────────── */

interface PartyOption {
  id: string;
  legalName: string;
  creditDays?: number | null;
}

interface FetchedJob {
  id: string;
  internalRef: string;
  agentRef?: string | null;
  jobDate: string;
  serviceType: string;
  paxCount: number;
  jobExtras?: { name: string; qty: number }[];
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  originAirport?: { code: string; name: string } | null;
  destinationAirport?: { code: string; name: string } | null;
  originHotel?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  assignment?: { vehicle?: { vehicleType?: { name: string } | null } | null } | null;
  // Client-side:
  selected: boolean;
  unitPrice: number;
  description: string;
}

interface CustomerJob {
  id: string;
  internalRef: string;
  jobDate: string;
  serviceType: string;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  originAirport?: { code: string } | null;
  destinationAirport?: { code: string } | null;
  originHotel?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  assignment?: { vehicle?: { vehicleType?: { name: string } | null } | null } | null;
  // Client-side:
  selected: boolean;
  transferPrice: number;
}

const VAT_RATE = 14;

/* ─── Helpers ───────────────────────────────── */

/**
 * One money format everywhere (UI review 3b): 23,160.00. Totals can arrive as text (Prisma
 * decimals), which toLocaleString left as "23160" next to "23,160.00".
 */
function fmtNum(n: number | string | null | undefined, _locale?: string) {
  return formatMoney(n);
}

function routeOf(job: FetchedJob | CustomerJob, sep: string) {
  const from = job.originAirport?.code || job.fromZone?.name || job.originHotel?.name || "?";
  const to = job.destinationAirport?.code || job.toZone?.name || job.destinationHotel?.name || "?";
  return `${from}${sep}${to}`;
}

function buildJobDescription(job: FetchedJob): string {
  const vehicle = job.assignment?.vehicle?.vehicleType?.name || "";
  const ref = job.agentRef || job.internalRef;
  return `${job.serviceType}: ${routeOf(job, " → ")}${vehicle ? ` (${vehicle})` : ""} – ${ref}`;
}

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

async function downloadBlob(path: string, filename: string) {
  const { data } = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Page ──────────────────────────────────── */

export default function NewInvoicePage() {
  const t = useT();
  const locale = useLocaleId();
  const router = useRouter();
  const canApplyVat = usePermission("finance.invoices.detail.applyVat");

  const today = localDateStr(new Date());
  const firstOfMonth = (() => {
    const n = new Date();
    return localDateStr(new Date(n.getFullYear(), n.getMonth(), 1));
  })();

  const [createType, setCreateType] = useState<"agent" | "customer">("agent");
  const [agentOptions, setAgentOptions] = useState<PartyOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<PartyOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => addDays(today, 30));

  // Agent invoice
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentDateFrom, setAgentDateFrom] = useState(firstOfMonth);
  const [agentDateTo, setAgentDateTo] = useState(today);
  const [fetchedJobs, setFetchedJobs] = useState<FetchedJob[]>([]);
  const [jobsFetching, setJobsFetching] = useState(false);
  const [jobsFetched, setJobsFetched] = useState(false);
  const [applyVat, setApplyVat] = useState(false);

  // Customer invoice
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerDateFrom, setCustomerDateFrom] = useState(firstOfMonth);
  const [customerDateTo, setCustomerDateTo] = useState(today);
  const [customerJobs, setCustomerJobs] = useState<CustomerJob[]>([]);
  const [customerJobsFetching, setCustomerJobsFetching] = useState(false);
  const [customerJobsFetched, setCustomerJobsFetched] = useState(false);

  useEffect(() => {
    (async () => {
      const [agentRes, customerRes] = await Promise.allSettled([
        api.get("/finance/agent-options"),
        api.get("/finance/customer-options"),
      ]);
      if (agentRes.status === "fulfilled") {
        setAgentOptions(
          (agentRes.value.data.data || []).map((a: any) => ({
            id: a.id,
            legalName: a.legalName,
            creditDays: a.creditTerms?.creditDays ?? null,
          }))
        );
      }
      if (customerRes.status === "fulfilled") {
        setCustomerOptions(
          (customerRes.value.data.data || []).map((c: any) => ({
            id: c.id,
            legalName: c.legalName,
            creditDays: c.creditDays,
          }))
        );
      }
      setOptionsLoading(false);
    })();
  }, []);

  function applyCreditDays(options: PartyOption[], id: string) {
    const party = options.find((o) => o.id === id);
    if (party?.creditDays) setDueDate(addDays(issueDate, party.creditDays));
  }

  /* ─── Agent ───────────────────────────────── */

  async function fetchAgentJobs() {
    if (!selectedAgentId) return toast.error(t("finance.selectAgent"));
    if (!agentDateFrom || !agentDateTo) return toast.error(t("finance.selectDateRange"));
    setJobsFetching(true);
    try {
      const { data } = await api.get("/finance/agent-jobs", {
        params: { agentId: selectedAgentId, dateFrom: agentDateFrom, dateTo: agentDateTo },
      });
      const jobs: FetchedJob[] = (data.data || []).map((j: any) => ({
        ...j,
        selected: true,
        unitPrice: j.suggestedUnitPrice || j.jobTransferPrice || 0,
        description: buildJobDescription(j),
      }));
      setFetchedJobs(jobs);
      setJobsFetched(true);
      if (jobs.length === 0) toast.info(t("finance.noJobsFound"));
    } catch {
      toast.error(t("finance.failedFetchJobs"));
    } finally {
      setJobsFetching(false);
    }
  }

  const agentTotals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    for (const j of fetchedJobs.filter((x) => x.selected)) {
      subtotal += j.unitPrice;
      if (applyVat) taxAmount += parseFloat(((j.unitPrice * VAT_RATE) / 100).toFixed(2));
    }
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      total: parseFloat((subtotal + taxAmount).toFixed(2)),
    };
  }, [fetchedJobs, applyVat]);

  /* ─── Customer ────────────────────────────── */

  async function fetchCustomerJobs() {
    if (!selectedCustomerId) return toast.error(t("finance.selectCustomer"));
    if (!customerDateFrom || !customerDateTo) return toast.error(t("finance.selectDateRange"));
    setCustomerJobsFetching(true);
    try {
      const { data } = await api.get("/finance/customer-jobs", {
        params: { customerId: selectedCustomerId, dateFrom: customerDateFrom, dateTo: customerDateTo },
      });
      const jobs: CustomerJob[] = (data.data || []).map((j: any) => ({
        ...j,
        selected: true,
        transferPrice: j.suggestedTransferPrice || 0,
      }));
      setCustomerJobs(jobs);
      setCustomerJobsFetched(true);
      if (jobs.length === 0) toast.info(t("finance.noJobsFound"));
    } catch {
      toast.error(t("finance.failedFetchJobs"));
    } finally {
      setCustomerJobsFetching(false);
    }
  }

  const customerTotals = useMemo(() => {
    let transfers = 0;
    for (const j of customerJobs.filter((x) => x.selected)) transfers += j.transferPrice;
    return { transfers };
  }, [customerJobs]);

  /* ─── Submit ──────────────────────────────── */

  async function submit() {
    if (createType === "agent") {
      if (!selectedAgentId) return toast.error(t("finance.selectAgent"));
      const selected = fetchedJobs.filter((j) => j.selected);
      if (selected.length === 0) return toast.error(t("finance.noJobsSelected"));
      if (selected.some((j) => j.unitPrice <= 0)) return toast.error(t("finance.invalidLines"));
      setSubmitting(true);
      try {
        const { data } = await api.post("/finance/invoices", {
          agentId: selectedAgentId,
          issueDate,
          dueDate,
          lines: selected.map((j) => ({
            trafficJobId: j.id,
            description: j.description,
            unitPrice: j.unitPrice,
            quantity: 1,
            taxRate: applyVat ? VAT_RATE : 0,
          })),
        });
        toast.success(t("finance.invoiceCreated"));
        const invoiceId = data?.data?.id;
        if (invoiceId) {
          await Promise.allSettled([
            downloadBlob(`/finance/invoices/${invoiceId}/pdf`, `invoice_${invoiceId}.pdf`),
            downloadBlob(`/finance/invoices/${invoiceId}/excel`, `invoice_${invoiceId}.xlsx`),
          ]);
        }
        router.push("/dashboard/finance");
      } catch (err: any) {
        toast.error(err?.response?.data?.message || t("finance.failedCreateInvoice"));
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!selectedCustomerId) return toast.error(t("finance.selectCustomer"));
      const selected = customerJobs.filter((j) => j.selected);
      if (selected.length === 0) return toast.error(t("finance.noJobsSelected"));
      setSubmitting(true);
      try {
        await api.post("/finance/customer-invoices/generate", {
          customerId: selectedCustomerId,
          issueDate,
          dueDate: dueDate || undefined,
          jobs: selected.map((j) => ({
            trafficJobId: j.id,
            transferPrice: j.transferPrice,
          })),
        });
        toast.success(t("finance.customerInvoicesGenerated"));
        router.push("/dashboard/finance");
      } catch (err: any) {
        toast.error(err?.response?.data?.message || t("finance.failedCreateInvoice"));
      } finally {
        setSubmitting(false);
      }
    }
  }

  /* ─── Render ──────────────────────────────── */

  const hasSelection =
    createType === "agent"
      ? fetchedJobs.some((j) => j.selected)
      : customerJobs.some((j) => j.selected);

  const datesBlock = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("finance.issueDate")} *</Label>
        <Input className="h-9" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("finance.dueDate")} *</Label>
        <Input className="h-9" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/dashboard/finance" aria-label={t("common.back")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{t("finance.createInvoice")}</h1>
      </div>

      {optionsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="space-y-5 border-border p-4 sm:p-6">
          {/* Entity type */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("finance.entityType")}</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={createType === "agent" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setCreateType("agent")}
              >
                {t("finance.agentInvoice")}
              </Button>
              <Button
                size="sm"
                variant={createType === "customer" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setCreateType("customer")}
              >
                {t("finance.customerInvoice")}
              </Button>
            </div>
          </div>

          {createType === "agent" ? (
            <>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-5">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.selectAgent")} *</Label>
                  <Select
                    value={selectedAgentId}
                    onValueChange={(v) => {
                      setSelectedAgentId(v);
                      setFetchedJobs([]);
                      setJobsFetched(false);
                      applyCreditDays(agentOptions, v);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("finance.selectAgent")} />
                    </SelectTrigger>
                    <SelectContent>
                      {agentOptions.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.legalName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodFrom")}</Label>
                  <Input className="h-9" type="date" value={agentDateFrom} onChange={(e) => setAgentDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodTo")}</Label>
                  <Input className="h-9" type="date" value={agentDateTo} onChange={(e) => setAgentDateTo(e.target.value)} />
                </div>
                <Button className="h-9 gap-1.5 text-xs" onClick={fetchAgentJobs} disabled={jobsFetching || !selectedAgentId}>
                  {jobsFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  {t("finance.fetchJobs")}
                </Button>
              </div>

              {jobsFetched && (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">
                      {fetchedJobs.filter((j) => j.selected).length} / {fetchedJobs.length} {t("finance.jobsSelected")}
                    </h4>
                    {canApplyVat && (
                      <div className="flex items-center gap-2">
                        <Checkbox id="create-vat" checked={applyVat} onCheckedChange={(c) => setApplyVat(!!c)} />
                        <Label htmlFor="create-vat" className="cursor-pointer text-xs text-muted-foreground">
                          {t("finance.applyVat")}
                        </Label>
                      </div>
                    )}
                  </div>

                  {fetchedJobs.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.noJobsFound")}</p>
                  ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="w-10 text-xs">
                              <Checkbox
                                checked={fetchedJobs.every((j) => j.selected)}
                                onCheckedChange={() => {
                                  const all = fetchedJobs.every((j) => j.selected);
                                  setFetchedJobs((p) => p.map((j) => ({ ...j, selected: !all })));
                                }}
                              />
                            </TableHead>
                            <TableHead className="text-xs">{t("common.date")}</TableHead>
                            <TableHead className="text-xs">Agent Ref</TableHead>
                            <TableHead className="text-xs">{t("jobs.serviceType")}</TableHead>
                            <TableHead className="text-xs">{t("finance.route")}</TableHead>
                            <TableHead className="text-xs">Pax</TableHead>
                            <TableHead className="text-xs">{t("finance.vehicleType")}</TableHead>
                            <TableHead className="text-xs">Extras</TableHead>
                            <TableHead className="w-28 text-xs">{t("finance.unitPrice")} *</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fetchedJobs.map((job) => {
                            const extras = (job.jobExtras || [])
                              .filter((e) => e.qty > 0)
                              .map((e) => `${e.name} ×${e.qty}`)
                              .join(", ");
                            return (
                              <TableRow key={job.id} className={`border-border ${job.selected ? "bg-primary/5" : ""}`}>
                                <TableCell>
                                  <Checkbox
                                    checked={job.selected}
                                    onCheckedChange={() =>
                                      setFetchedJobs((p) => p.map((j) => (j.id === job.id ? { ...j, selected: !j.selected } : j)))
                                    }
                                  />
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(job.jobDate)}</TableCell>
                                <TableCell className="font-mono text-xs">{job.agentRef || "-"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{job.serviceType}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{routeOf(job, " > ")}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{job.paxCount}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {job.assignment?.vehicle?.vehicleType?.name || "-"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{extras || "-"}</TableCell>
                                <TableCell>
                                  <Input
                                    className="h-7 w-24 text-xs"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={job.unitPrice || ""}
                                    placeholder="0.00"
                                    onChange={(e) => {
                                      const price = parseFloat(e.target.value) || 0;
                                      setFetchedJobs((p) => p.map((j) => (j.id === job.id ? { ...j, unitPrice: price } : j)));
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {datesBlock}

                  <div className="ml-auto max-w-xs space-y-1 border-t border-border pt-3">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("finance.subtotal")}</span>
                      <span className="font-mono font-medium">{fmtNum(agentTotals.subtotal, locale)}</span>
                    </div>
                    {agentTotals.taxAmount > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("finance.taxAmount")}</span>
                        <span className="font-mono font-medium">{fmtNum(agentTotals.taxAmount, locale)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-medium text-foreground">
                      <span>{t("common.total")}</span>
                      <span className="font-mono font-medium">{fmtNum(agentTotals.total, locale)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-5">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.selectCustomer")} *</Label>
                  <Select
                    value={selectedCustomerId}
                    onValueChange={(v) => {
                      setSelectedCustomerId(v);
                      setCustomerJobs([]);
                      setCustomerJobsFetched(false);
                      applyCreditDays(customerOptions, v);
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("finance.selectCustomer")} />
                    </SelectTrigger>
                    <SelectContent>
                      {customerOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.legalName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodFrom")}</Label>
                  <Input className="h-9" type="date" value={customerDateFrom} onChange={(e) => setCustomerDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodTo")}</Label>
                  <Input className="h-9" type="date" value={customerDateTo} onChange={(e) => setCustomerDateTo(e.target.value)} />
                </div>
                <Button
                  className="h-9 gap-1.5 text-xs"
                  onClick={fetchCustomerJobs}
                  disabled={customerJobsFetching || !selectedCustomerId}
                >
                  {customerJobsFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                  {t("finance.fetchJobs")}
                </Button>
              </div>

              {customerJobsFetched && (
                <div className="space-y-4 border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-foreground">
                    {customerJobs.filter((j) => j.selected).length} / {customerJobs.length} {t("finance.jobsSelected")}
                  </h4>

                  {customerJobs.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">{t("finance.noJobsFound")}</p>
                  ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border">
                            <TableHead className="w-10 text-xs">
                              <Checkbox
                                checked={customerJobs.every((j) => j.selected)}
                                onCheckedChange={() => {
                                  const all = customerJobs.every((j) => j.selected);
                                  setCustomerJobs((p) => p.map((j) => ({ ...j, selected: !all })));
                                }}
                              />
                            </TableHead>
                            <TableHead className="text-xs">Ref</TableHead>
                            <TableHead className="text-xs">{t("common.date")}</TableHead>
                            <TableHead className="text-xs">{t("jobs.serviceType")}</TableHead>
                            <TableHead className="text-xs">{t("finance.route") || "Route"}</TableHead>
                            <TableHead className="text-xs">{t("finance.vehicleType")}</TableHead>
                            <TableHead className="w-28 text-xs">{t("finance.transferPrice") || "Transfer Price"} *</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerJobs.map((job) => {
                            const toggle = () =>
                              setCustomerJobs((p) => p.map((j) => (j.id === job.id ? { ...j, selected: !j.selected } : j)));
                            const setField = (field: "transferPrice", value: string) =>
                              setCustomerJobs((p) =>
                                p.map((j) => (j.id === job.id ? { ...j, [field]: parseFloat(value) || 0 } : j))
                              );
                            return (
                              <TableRow
                                key={job.id}
                                className={`cursor-pointer border-border ${job.selected ? "bg-primary/10" : ""}`}
                                onClick={toggle}
                              >
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={job.selected} onCheckedChange={toggle} />
                                </TableCell>
                                <TableCell className="font-mono text-xs">{job.internalRef}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(job.jobDate)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{job.serviceType}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{routeOf(job, " → ")}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {job.assignment?.vehicle?.vehicleType?.name || "—"}
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={job.transferPrice}
                                    onChange={(e) => setField("transferPrice", e.target.value)}
                                    className="h-7 w-24 border-border bg-card text-xs"
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {customerJobs.some((j) => j.selected) && (
                    <>
                      {datesBlock}
                      <div className="ml-auto max-w-xs space-y-1 border-t border-border pt-3">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t("finance.transferPrice") || "Transfer Price"}</span>
                          <span className="font-mono font-medium">{fmtNum(customerTotals.transfers, locale)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" className="text-xs" onClick={() => router.push("/dashboard/finance")}>
              {t("common.cancel")}
            </Button>
            <Button className="text-xs" onClick={submit} disabled={submitting || !hasSelection}>
              {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t("finance.createInvoice")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
