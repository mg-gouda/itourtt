"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  DollarSign,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Pencil,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { useSortable } from "@/hooks/use-sortable";
import { SortableHeader } from "@/components/sortable-header";
import { TableFilterBar } from "@/components/table-filter-bar";

/* ─── Types ─────────────────────────────────── */

interface AgentOption {
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
  boosterSeat?: boolean;
  boosterSeatQty?: number;
  babySeat?: boolean;
  babySeatQty?: number;
  wheelChair?: boolean;
  wheelChairQty?: number;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  originAirport?: { code: string; name: string } | null;
  destinationAirport?: { code: string; name: string } | null;
  originHotel?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  flight?: { flightNo: string; carrier?: string } | null;
  assignment?: {
    vehicle?: { vehicleType?: { name: string } | null } | null;
  } | null;
  // Client-side computed:
  selected: boolean;
  unitPrice: number;
  description: string;
}

interface CustomerOption {
  id: string;
  legalName: string;
  creditDays?: number;
}

interface TrafficJobOption {
  id: string;
  internalRef: string;
  serviceDate: string;
  serviceType: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: string;
  paidAmount?: number;
  remainingBalance?: number;
  agent?: { id: string; legalName: string } | null;
  customer?: { id: string; legalName: string } | null;
}

interface InvoiceLine {
  id: string;
  trafficJobId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  trafficJob?: { internalRef: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  reference?: string;
}

interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  payments: Payment[];
}

interface EditableLine {
  id?: string;
  trafficJobId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

interface CollectionJob {
  id: string;
  internalRef: string;
  jobDate: string;
  collectionAmount: number;
  collectionCurrency: string;
  collectionCollected: boolean;
  collectionCollectedAt: string | null;
  collectionReceiptNo: string | null;
  collectionLiquidatedAt: string | null;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  assignment?: { driver?: { name: string } | null } | null;
}

interface CreditStatus {
  creditLimit: number;
  creditDays: number;
  outstandingBalance: number;
  availableCredit: number;
  utilizationPercent: number;
}

/* ─── Constants ─────────────────────────────── */

const statusColors: Record<string, string> = {
  DRAFT: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  POSTED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PAID: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
};

const collectionStatusColors: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  COLLECTED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  LIQUIDATED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "finance.methodCash",
  BANK_TRANSFER: "finance.methodBankTransfer",
  CHECK: "finance.methodCheck",
};

/* ─── Helpers ───────────────────────────────── */

function calcLineTax(unitPrice: number, quantity: number, taxRate: number) {
  const net = unitPrice * quantity;
  const taxAmount = taxRate > 0 ? parseFloat((net * taxRate / 100).toFixed(2)) : 0;
  const lineTotal = parseFloat((net + taxAmount).toFixed(2));
  return { taxAmount, lineTotal };
}

function calcTotals(lines: EditableLine[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    subtotal += l.unitPrice * l.quantity;
    taxAmount += l.taxAmount;
  }
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    total: parseFloat((subtotal + taxAmount).toFixed(2)),
  };
}

function fmtNum(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2 });
}

function getCollectionStatus(c: CollectionJob): string {
  if (c.collectionLiquidatedAt) return "LIQUIDATED";
  if (c.collectionCollected) return "COLLECTED";
  return "PENDING";
}

/* ─── Page ──────────────────────────────────── */

export default function FinancePage() {
  const t = useT();
  const locale = useLocaleId();

  // Invoice list
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Detail sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);

  // Line editing
  const [editingLines, setEditingLines] = useState(false);
  const [editLines, setEditLines] = useState<EditableLine[]>([]);
  const [linesSubmitting, setLinesSubmitting] = useState(false);

  // Payment dialog
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Create invoice dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"agent" | "customer">("agent");
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [jobOptions, setJobOptions] = useState<TrafficJobOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [createLines, setCreateLines] = useState<EditableLine[]>([
    { description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 },
  ]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Agent invoice: job fetch workflow
  const [agentJobDateFrom, setAgentJobDateFrom] = useState("");
  const [agentJobDateTo, setAgentJobDateTo] = useState("");
  const [fetchedJobs, setFetchedJobs] = useState<FetchedJob[]>([]);
  const [jobsFetching, setJobsFetching] = useState(false);
  const [jobsFetched, setJobsFetched] = useState(false);

  // Collections
  const [collections, setCollections] = useState<CollectionJob[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionStatusFilter, setCollectionStatusFilter] = useState("ALL");
  const [collectionDateFrom, setCollectionDateFrom] = useState("");
  const [collectionDateTo, setCollectionDateTo] = useState("");
  const [liquidateDialog, setLiquidateDialog] = useState<{ open: boolean; jobId: string; ref: string }>({ open: false, jobId: "", ref: "" });
  const [receiptNo, setReceiptNo] = useState("");
  const [liquidating, setLiquidating] = useState(false);

  /* ─── Data fetching ───────────────────────── */

  const fetchInvoices = useCallback(async () => {
    try {
      const { data } = await api.get("/finance/invoices");
      setInvoices(Array.isArray(data) ? data : data.data || []);
    } catch {
      // no invoices yet is ok
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (collectionStatusFilter !== "ALL") params.status = collectionStatusFilter;
      if (collectionDateFrom) params.dateFrom = collectionDateFrom;
      if (collectionDateTo) params.dateTo = collectionDateTo;
      const { data } = await api.get("/finance/collections", { params });
      setCollections(data.data || data || []);
    } catch {
      toast.error(t("finance.collectionsLoadError") || "Failed to load collections");
    } finally {
      setCollectionsLoading(false);
    }
  }, [collectionStatusFilter, collectionDateFrom, collectionDateTo, t]);

  const handleLiquidate = async () => {
    if (!receiptNo.trim()) {
      toast.error(t("finance.receiptNoRequired") || "Receipt number is required");
      return;
    }
    setLiquidating(true);
    try {
      await api.patch(`/finance/collections/${liquidateDialog.jobId}/liquidate`, { receiptNo: receiptNo.trim() });
      toast.success(t("finance.collectionLiquidated") || "Collection liquidated");
      setLiquidateDialog({ open: false, jobId: "", ref: "" });
      setReceiptNo("");
      fetchCollections();
    } catch {
      toast.error(t("finance.liquidateError") || "Failed to liquidate collection");
    } finally {
      setLiquidating(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filtered = useMemo(() => {
    let result = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.agent?.legalName &&
            inv.agent.legalName.toLowerCase().includes(q)) ||
          (inv.customer?.legalName &&
            inv.customer.legalName.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== "ALL") {
      result = result.filter((inv) => inv.status === statusFilter);
    }
    return result;
  }, [invoices, search, statusFilter]);

  const { sortedData, sortKey, sortDir, onSort } =
    useSortable<Invoice>(filtered);

  /* ─── Detail sheet ────────────────────────── */

  async function openDetail(invoiceId: string) {
    setSheetOpen(true);
    setDetailLoading(true);
    setEditingLines(false);
    setCreditStatus(null);
    try {
      const { data } = await api.get(`/finance/invoices/${invoiceId}`);
      const inv: InvoiceDetail = data.data;
      setDetail(inv);
      // Fetch credit status for agent invoices
      if (inv.agent?.id) {
        try {
          const { data: cs } = await api.get(
            `/agents/${inv.agent.id}/credit-status`
          );
          setCreditStatus(cs.data);
        } catch {
          /* optional */
        }
      }
    } catch {
      toast.error(t("finance.failedLoadDetail"));
      setSheetOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  /* ─── Line editing ────────────────────────── */

  function startEditing() {
    if (!detail) return;
    setEditLines(
      detail.lines.map((l) => ({
        id: l.id,
        trafficJobId: l.trafficJobId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        taxAmount: Number(l.taxAmount),
        lineTotal: Number(l.lineTotal),
      }))
    );
    setEditingLines(true);
  }

  function updateLine(
    idx: number,
    field: keyof EditableLine,
    value: string | number
  ) {
    setEditLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx], [field]: value };
      const { taxAmount, lineTotal } = calcLineTax(
        Number(line.unitPrice),
        Number(line.quantity),
        Number(line.taxRate)
      );
      line.taxAmount = taxAmount;
      line.lineTotal = lineTotal;
      updated[idx] = line;
      return updated;
    });
  }

  function addLine() {
    setEditLines((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 0,
      },
    ]);
  }

  function removeLine(idx: number) {
    setEditLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function applyVat(checked: boolean) {
    const rate = checked ? 14 : 0;
    setEditLines((prev) =>
      prev.map((line) => {
        const { taxAmount, lineTotal } = calcLineTax(
          Number(line.unitPrice),
          Number(line.quantity),
          rate
        );
        return { ...line, taxRate: rate, taxAmount, lineTotal };
      })
    );
  }

  async function saveLines() {
    if (
      editLines.some(
        (l) => !l.description.trim() || Number(l.unitPrice) <= 0
      )
    ) {
      toast.error(t("finance.invalidLines"));
      return;
    }
    setLinesSubmitting(true);
    try {
      const { data } = await api.patch(
        `/finance/invoices/${detail!.id}/lines`,
        {
          lines: editLines.map((l) => ({
            id: l.id,
            trafficJobId: l.trafficJobId,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            taxRate: Number(l.taxRate),
          })),
        }
      );
      setDetail((prev) =>
        prev ? { ...prev, ...data.data, payments: prev.payments } : prev
      );
      setEditingLines(false);
      toast.success(t("finance.linesUpdated"));
      fetchInvoices();
    } catch {
      toast.error(t("finance.failedUpdateLines"));
    } finally {
      setLinesSubmitting(false);
    }
  }

  /* ─── Status actions ──────────────────────── */

  async function updateStatus(status: "POSTED" | "CANCELLED") {
    const msg =
      status === "POSTED"
        ? t("finance.confirmPost")
        : t("finance.confirmCancel");
    if (!confirm(msg)) return;
    try {
      const { data } = await api.patch(
        `/finance/invoices/${detail!.id}/status`,
        { status }
      );
      setDetail((prev) =>
        prev ? { ...prev, ...data.data, payments: prev.payments } : prev
      );
      toast.success(
        status === "POSTED"
          ? t("finance.invoicePosted")
          : t("finance.invoiceCancelled")
      );
      fetchInvoices();
    } catch {
      toast.error(t("finance.failedUpdateStatus"));
    }
  }

  /* ─── Payment dialog ──────────────────────── */

  function openPayment(inv: Invoice) {
    setPaymentInvoice(inv);
    setPaymentAmount("");
    setPaymentMethod("CASH");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentRef("");
    setPaymentOpen(true);
  }

  async function submitPayment() {
    if (!paymentInvoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error(t("finance.paymentFailed"));
      return;
    }
    const remaining = paymentInvoice.remainingBalance ?? paymentInvoice.total;
    if (amount > remaining) {
      toast.error(t("finance.amountExceedsBalance"));
      return;
    }
    setPaymentSubmitting(true);
    try {
      await api.post("/finance/payments", {
        agentInvoiceId: paymentInvoice.id,
        amount,
        paymentDate,
        method: paymentMethod,
        reference: paymentRef || undefined,
      });
      toast.success(t("finance.paymentRecorded"));
      setPaymentOpen(false);
      fetchInvoices();
      // Refresh detail if open
      if (sheetOpen && detail?.id === paymentInvoice.id) {
        openDetail(paymentInvoice.id);
      }
    } catch {
      toast.error(t("finance.paymentFailed"));
    } finally {
      setPaymentSubmitting(false);
    }
  }

  /* ─── Odoo export ─────────────────────────── */

  const exportOdoo = async (type: string) => {
    try {
      const { data } = await api.get(`/export/odoo/${type}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `odoo-${type}-${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type} ${t("finance.exportDownloaded")}`);
    } catch {
      toast.error(t("finance.exportNotAvailable"));
    }
  };

  /* ─── Create invoice dialog ────────────────── */

  async function openCreateDialog() {
    setCreateOpen(true);
    setCreateType("agent");
    setSelectedAgentId("");
    setSelectedCustomerId("");
    setSelectedJobIds([]);
    setFetchedJobs([]);
    setJobsFetched(false);
    setCreateLines([
      { description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 },
    ]);
    setIssueDate(new Date().toISOString().split("T")[0]);
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setDueDate(d.toISOString().split("T")[0]);

    // Default job period: first day of current month to today
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    setAgentJobDateFrom(firstOfMonth.toISOString().split("T")[0]);
    setAgentJobDateTo(now.toISOString().split("T")[0]);

    setOptionsLoading(true);
    const [agentRes, customerRes, jobRes] = await Promise.allSettled([
      api.get("/finance/agent-options"),
      api.get("/customers?limit=200"),
      api.get("/traffic-jobs?status=COMPLETED&limit=500"),
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
    if (jobRes.status === "fulfilled") {
      setJobOptions(
        (jobRes.value.data.data || []).map((j: any) => ({
          id: j.id,
          internalRef: j.internalRef,
          serviceDate: j.serviceDate,
          serviceType: j.serviceType,
        }))
      );
    }
    setOptionsLoading(false);
  }

  function updateCreateLine(
    idx: number,
    field: keyof EditableLine,
    value: string | number
  ) {
    setCreateLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[idx], [field]: value };
      const { taxAmount, lineTotal } = calcLineTax(
        Number(line.unitPrice),
        Number(line.quantity),
        Number(line.taxRate)
      );
      line.taxAmount = taxAmount;
      line.lineTotal = lineTotal;
      updated[idx] = line;
      return updated;
    });
  }

  function addCreateLine() {
    setCreateLines((prev) => [
      ...prev,
      { description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 },
    ]);
  }

  function removeCreateLine(idx: number) {
    setCreateLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function applyCreateVat(checked: boolean) {
    const rate = checked ? 14 : 0;
    setCreateLines((prev) =>
      prev.map((line) => {
        const { taxAmount, lineTotal } = calcLineTax(
          Number(line.unitPrice),
          Number(line.quantity),
          rate
        );
        return { ...line, taxRate: rate, taxAmount, lineTotal };
      })
    );
  }

  function toggleJobSelection(jobId: string) {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  }

  // ─── Agent invoice: job fetch workflow ───────

  function buildJobDescription(job: any): string {
    const origin =
      job.originAirport?.code || job.fromZone?.name || job.originHotel?.name || "?";
    const dest =
      job.destinationAirport?.code || job.toZone?.name || job.destinationHotel?.name || "?";
    const vehicle = job.assignment?.vehicle?.vehicleType?.name || "";
    const ref = job.agentRef || job.internalRef;
    return `${job.serviceType}: ${origin} → ${dest}${vehicle ? ` (${vehicle})` : ""} – ${ref}`;
  }

  async function fetchAgentJobs() {
    if (!selectedAgentId) {
      toast.error(t("finance.selectAgent"));
      return;
    }
    if (!agentJobDateFrom || !agentJobDateTo) {
      toast.error(t("finance.selectDateRange"));
      return;
    }
    setJobsFetching(true);
    try {
      const { data } = await api.get(
        `/finance/agent-jobs?agentId=${selectedAgentId}&dateFrom=${agentJobDateFrom}&dateTo=${agentJobDateTo}`
      );
      const jobs = (data.data || []).map((j: any) => ({
        ...j,
        selected: true,
        unitPrice: j.suggestedUnitPrice || 0,
        description: buildJobDescription(j),
      }));
      setFetchedJobs(jobs);
      setJobsFetched(true);
      if (jobs.length === 0) {
        toast.info(t("finance.noJobsFound"));
      }
    } catch {
      toast.error(t("finance.failedFetchJobs"));
    } finally {
      setJobsFetching(false);
    }
  }

  function toggleFetchedJob(jobId: string) {
    setFetchedJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, selected: !j.selected } : j))
    );
  }

  function toggleAllFetchedJobs() {
    const allSelected = fetchedJobs.every((j) => j.selected);
    setFetchedJobs((prev) => prev.map((j) => ({ ...j, selected: !allSelected })));
  }

  function updateFetchedJobPrice(jobId: string, price: number) {
    setFetchedJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, unitPrice: price } : j))
    );
  }

  async function downloadInvoicePdf(invoiceId: string) {
    try {
      const { data } = await api.get(`/finance/invoices/${invoiceId}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("finance.failedDownloadPdf"));
    }
  }

  async function downloadInvoiceExcel(invoiceId: string) {
    try {
      const { data } = await api.get(`/finance/invoices/${invoiceId}/excel`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${invoiceId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("finance.failedDownloadExcel"));
    }
  }

  /* ─── Create line totals preview ───────────── */
  const createTotals = useMemo(() => calcTotals(createLines), [createLines]);
  const createAllVat = createLines.length > 0 && createLines.every((l) => l.taxRate === 14);

  // ─── Agent invoice totals from fetched jobs ──
  const agentJobTotals = useMemo(() => {
    const selected = fetchedJobs.filter((j) => j.selected);
    const vatRate = createAllVat ? 14 : 0;
    let subtotal = 0;
    let taxAmount = 0;
    for (const j of selected) {
      subtotal += j.unitPrice;
      if (vatRate > 0) {
        taxAmount += parseFloat((j.unitPrice * vatRate / 100).toFixed(2));
      }
    }
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      total: parseFloat((subtotal + taxAmount).toFixed(2)),
    };
  }, [fetchedJobs, createAllVat]);

  async function submitCreateInvoice() {
    if (createType === "agent") {
      if (!selectedAgentId) {
        toast.error(t("finance.selectAgent"));
        return;
      }
      const selectedJobs = fetchedJobs.filter((j) => j.selected);
      if (selectedJobs.length === 0) {
        toast.error(t("finance.noJobsSelected"));
        return;
      }
      if (selectedJobs.some((j) => j.unitPrice <= 0)) {
        toast.error(t("finance.invalidLines"));
        return;
      }
      setCreateSubmitting(true);
      try {
        const vatRate = createAllVat ? 14 : 0;
        const { data } = await api.post("/finance/invoices", {
          agentId: selectedAgentId,
          issueDate,
          dueDate,
          lines: selectedJobs.map((j) => ({
            trafficJobId: j.id,
            description: j.description,
            unitPrice: j.unitPrice,
            quantity: 1,
            taxRate: vatRate,
          })),
        });
        const invoiceId = data?.data?.id;
        toast.success(t("finance.invoiceCreated"));

        // Auto-download both formats
        if (invoiceId) {
          await Promise.allSettled([
            downloadInvoicePdf(invoiceId),
            downloadInvoiceExcel(invoiceId),
          ]);
        }

        setCreateOpen(false);
        fetchInvoices();
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || t("finance.failedCreateInvoice")
        );
      } finally {
        setCreateSubmitting(false);
      }
    } else {
      if (!selectedCustomerId) {
        toast.error(t("finance.selectCustomer"));
        return;
      }
      if (selectedJobIds.length === 0) {
        toast.error(t("finance.noJobsSelected"));
        return;
      }
      setCreateSubmitting(true);
      try {
        await api.post("/finance/customer-invoices/generate", {
          customerId: selectedCustomerId,
          trafficJobIds: selectedJobIds,
          issueDate,
          dueDate: dueDate || undefined,
        });
        toast.success(t("finance.customerInvoicesGenerated"));
        setCreateOpen(false);
        fetchInvoices();
      } catch (err: any) {
        toast.error(
          err?.response?.data?.message || t("finance.failedCreateInvoice")
        );
      } finally {
        setCreateSubmitting(false);
      }
    }
  }

  /* ─── Edit line totals preview ────────────── */
  const editTotals = useMemo(() => calcTotals(editLines), [editLines]);
  const allVat = editLines.length > 0 && editLines.every((l) => l.taxRate === 14);

  /* ─── Render ──────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("finance.title")}
        description={t("finance.description")}
        action={{ label: t("finance.createInvoice"), onClick: openCreateDialog }}
      />

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="invoices"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            {t("finance.invoices")}
          </TabsTrigger>
          <TabsTrigger
            value="exports"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            {t("finance.odooExports")}
          </TabsTrigger>
          <TabsTrigger
            value="collections"
            className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            onClick={() => { if (collections.length === 0) fetchCollections(); }}
          >
            {t("finance.collections") || "Collections"}
          </TabsTrigger>
        </TabsList>

        {/* ─── Invoices Tab ─────────────────── */}
        <TabsContent value="invoices">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="mb-2 h-8 w-8" />
              <p>{t("finance.noInvoices")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {t("finance.invoicesGenerated")}
              </p>
            </div>
          ) : (
            <>
              <TableFilterBar
                search={search}
                onSearchChange={setSearch}
                placeholder={t("common.search") + "..."}
                statusOptions={[
                  { value: "ALL", label: t("common.all") },
                  { value: "DRAFT", label: "Draft" },
                  { value: "POSTED", label: "Posted" },
                  { value: "PAID", label: "Paid" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
                statusValue={statusFilter}
                onStatusChange={setStatusFilter}
                statusPlaceholder={t("common.all")}
              />
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("finance.invoiceNo")} sortKey="invoiceNumber" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <TableHead className="text-white text-xs">{t("jobs.agentCustomer")}</TableHead>
                      <SortableHeader label={t("common.date")} sortKey="invoiceDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <SortableHeader label={t("finance.dueDate")} sortKey="dueDate" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
                      <TableHead className="text-white text-xs">{t("finance.currency")}</TableHead>
                      <SortableHeader label={t("common.total")} sortKey="total" currentKey={sortKey} currentDir={sortDir} onSort={onSort} className="text-right" />
                      <TableHead className="text-white text-xs text-right">{t("finance.remainingBalance")}</TableHead>
                      <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                      <TableHead className="text-white text-xs">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((inv, idx) => (
                      <TableRow
                        key={inv.id}
                        className={`border-border cursor-pointer ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                        onClick={() => openDetail(inv.id)}
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {inv.agent?.legalName || inv.customer?.legalName || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(inv.invoiceDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.currency}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {fmtNum(inv.total, locale)}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {inv.remainingBalance != null
                            ? fmtNum(inv.remainingBalance, locale)
                            : fmtNum(inv.total, locale)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColors[inv.status] || ""}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => openPayment(inv)}
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              {t("finance.recordPayment")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Exports Tab ──────────────────── */}
        <TabsContent value="exports">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: "customers", label: t("finance.exportCustomers") },
              { key: "suppliers", label: t("finance.exportSuppliers") },
              { key: "invoices", label: t("finance.exportInvoices") },
              { key: "vendor-bills", label: t("finance.exportVendorBills") },
              { key: "payments", label: t("finance.exportPayments") },
              { key: "journals", label: t("finance.exportJournals") },
              { key: "collections", label: t("finance.collections") || "Collections" },
            ].map((exp) => (
              <Card
                key={exp.key}
                className="flex items-center justify-between border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {exp.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("finance.xlsxFormat")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportOdoo(exp.key)}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-4 w-4" />
                  {t("common.export")}
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Collections Tab ─────────────────── */}
        <TabsContent value="collections">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex gap-1">
              {["ALL", "PENDING", "COLLECTED", "LIQUIDATED"].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={collectionStatusFilter === s ? "default" : "outline"}
                  onClick={() => setCollectionStatusFilter(s)}
                  className="text-xs"
                >
                  {s === "ALL" ? t("common.all") : t(`finance.collection${s.charAt(0) + s.slice(1).toLowerCase()}`) || s}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("common.from") || "From"}</Label>
              <Input
                type="date"
                value={collectionDateFrom}
                onChange={(e) => setCollectionDateFrom(e.target.value)}
                className="h-8 w-36 text-xs border-border bg-card text-foreground"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("common.to") || "To"}</Label>
              <Input
                type="date"
                value={collectionDateTo}
                onChange={(e) => setCollectionDateTo(e.target.value)}
                className="h-8 w-36 text-xs border-border bg-card text-foreground"
              />
            </div>
            <Button size="sm" onClick={fetchCollections} className="gap-1">
              {collectionsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
              {t("common.search") || "Search"}
            </Button>
          </div>

          {/* Table */}
          {collectionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <DollarSign className="mb-2 h-8 w-8" />
              <p>{t("finance.noCollections") || "No collections found"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                    <TableHead className="text-white text-xs">{t("dispatch.ref") || "Ref"}</TableHead>
                    <TableHead className="text-white text-xs">{t("common.date") || "Date"}</TableHead>
                    <TableHead className="text-white text-xs">{t("jobs.agentCustomer") || "Agent/Customer"}</TableHead>
                    <TableHead className="text-white text-xs">{t("dispatch.driver") || "Driver"}</TableHead>
                    <TableHead className="text-white text-xs text-right">{t("finance.collectionAmount") || "Amount"}</TableHead>
                    <TableHead className="text-white text-xs">{t("finance.currency") || "Currency"}</TableHead>
                    <TableHead className="text-white text-xs">{t("finance.receiptNo") || "Receipt"}</TableHead>
                    <TableHead className="text-white text-xs">{t("common.status") || "Status"}</TableHead>
                    <TableHead className="text-white text-xs">{t("common.actions") || "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collections.map((c, idx) => {
                    const status = getCollectionStatus(c);
                    return (
                      <TableRow
                        key={c.id}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell className="text-foreground font-mono text-xs">{c.internalRef}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(c.jobDate)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{c.agent?.legalName || c.customer?.legalName || "\u2014"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{c.assignment?.driver?.name || "\u2014"}</TableCell>
                        <TableCell className="text-right text-foreground font-mono">{fmtNum(c.collectionAmount, locale)}</TableCell>
                        <TableCell className="text-muted-foreground">{c.collectionCurrency}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{c.collectionReceiptNo || "\u2014"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={collectionStatusColors[status] || ""}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {status === "COLLECTED" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => setLiquidateDialog({ open: true, jobId: c.id, ref: c.internalRef })}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              {t("finance.liquidate") || "Liquidate"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Liquidate Dialog ─────────────────── */}
      <Dialog open={liquidateDialog.open} onOpenChange={(open) => { if (!open) { setLiquidateDialog({ open: false, jobId: "", ref: "" }); setReceiptNo(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance.liquidateCollection") || "Liquidate Collection"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("finance.liquidateDesc") || "Enter receipt number for"} <b>{liquidateDialog.ref}</b>
          </p>
          <div className="space-y-2">
            <Label>{t("finance.receiptNo") || "Receipt No."}</Label>
            <Input
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder={t("finance.receiptNoPlaceholder") || "e.g. REC-001"}
              className="border-border bg-card text-foreground"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLiquidateDialog({ open: false, jobId: "", ref: "" }); setReceiptNo(""); }}>
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button onClick={handleLiquidate} disabled={liquidating}>
              {liquidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("finance.liquidate") || "Liquidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Invoice Detail Sheet ────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t("finance.invoiceDetail")}</SheetTitle>
            <SheetDescription>
              {detail?.invoiceNumber || "..."}
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-4 px-4 pb-4">
              {/* Header info */}
              <Card className="border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {detail.invoiceNumber}
                  </span>
                  <Badge variant="outline" className={statusColors[detail.status] || ""}>
                    {detail.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    {detail.agent
                      ? `${t("finance.agent")}: ${detail.agent.legalName}`
                      : detail.customer
                        ? `${t("finance.customer")}: ${detail.customer.legalName}`
                        : "—"}
                  </div>
                  <div className="text-right">{detail.currency}</div>
                  <div>{t("common.date")}: {formatDate(detail.invoiceDate)}</div>
                  <div className="text-right">
                    {t("finance.dueDate")}: {formatDate(detail.dueDate)}
                  </div>
                </div>
                <div className="flex justify-between text-xs border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">{t("finance.subtotal")}</span>
                  <span className="font-mono text-foreground">{fmtNum(Number(detail.subtotal), locale)}</span>
                </div>
                {Number(detail.taxAmount) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t("finance.taxAmount")}</span>
                    <span className="font-mono text-foreground">{fmtNum(Number(detail.taxAmount), locale)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-medium">
                  <span>{t("common.total")}</span>
                  <span className="font-mono">{fmtNum(Number(detail.total), locale)}</span>
                </div>
                {detail.paidAmount != null && detail.paidAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t("finance.paidAmount")}</span>
                      <span className="font-mono text-emerald-600">{fmtNum(detail.paidAmount, locale)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t("finance.remainingBalance")}</span>
                      <span className="font-mono text-foreground">{fmtNum(detail.remainingBalance ?? 0, locale)}</span>
                    </div>
                  </>
                )}
              </Card>

              {/* Download PDF / Excel */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => downloadInvoicePdf(detail.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("finance.downloadPdf")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => downloadInvoiceExcel(detail.id)}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t("finance.downloadExcel")}
                </Button>
              </div>

              {/* Credit status */}
              {creditStatus && creditStatus.creditLimit > 0 && (
                <Card
                  className={`border p-3 ${
                    creditStatus.utilizationPercent > 80
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    {creditStatus.utilizationPercent > 80 ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    )}
                    {creditStatus.utilizationPercent > 80 && (
                      <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                        {t("finance.nearCreditLimit")}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {t("finance.availableCredit")}:{" "}
                      {fmtNum(creditStatus.availableCredit, locale)} /{" "}
                      {fmtNum(creditStatus.creditLimit, locale)}
                    </span>
                    <span className="text-muted-foreground ml-auto">
                      {creditStatus.utilizationPercent}%
                    </span>
                  </div>
                </Card>
              )}

              {/* Line items */}
              <Card className="border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("finance.lineItems")}
                  </h3>
                  {detail.status === "DRAFT" && !editingLines && (
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={startEditing}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("finance.editLines")}
                    </Button>
                  )}
                </div>

                {editingLines ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        id="apply-vat"
                        checked={allVat}
                        onCheckedChange={(c) => applyVat(!!c)}
                      />
                      <Label htmlFor="apply-vat" className="text-xs text-muted-foreground cursor-pointer">
                        {t("finance.applyVat")}
                      </Label>
                    </div>

                    {editLines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">{t("finance.lineDescription")}</Label>}
                          <Input
                            className="h-8 text-xs"
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                          />
                        </div>
                        <div className="col-span-1">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">{t("finance.quantity")}</Label>}
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, "quantity", parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">{t("finance.unitPrice")}</Label>}
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-1">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">{t("finance.taxRate")}</Label>}
                          <Input
                            className="h-8 text-xs"
                            type="number"
                            min={0}
                            max={100}
                            value={line.taxRate}
                            onChange={(e) => updateLine(idx, "taxRate", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-1 text-right text-xs text-muted-foreground pt-1">
                          {fmtNum(line.taxAmount, locale)}
                        </div>
                        <div className="col-span-2 text-right text-xs font-mono text-foreground pt-1">
                          {fmtNum(line.lineTotal, locale)}
                        </div>
                        <div className="col-span-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={addLine}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("finance.addLine")}
                    </Button>

                    {/* Preview totals */}
                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("finance.subtotal")}</span>
                        <span className="font-mono">{fmtNum(editTotals.subtotal, locale)}</span>
                      </div>
                      {editTotals.taxAmount > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t("finance.taxAmount")}</span>
                          <span className="font-mono">{fmtNum(editTotals.taxAmount, locale)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-medium text-foreground">
                        <span>{t("common.total")}</span>
                        <span className="font-mono">{fmtNum(editTotals.total, locale)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingLines(false)}
                        className="text-xs"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        {t("finance.cancelEdit")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveLines}
                        disabled={linesSubmitting}
                        className="text-xs"
                      >
                        {linesSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {t("finance.saveLines")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-xs">{t("finance.lineDescription")}</TableHead>
                        <TableHead className="text-xs text-center">{t("finance.quantity")}</TableHead>
                        <TableHead className="text-xs text-right">{t("finance.unitPrice")}</TableHead>
                        <TableHead className="text-xs text-right">{t("finance.taxRate")}</TableHead>
                        <TableHead className="text-xs text-right">{t("finance.taxAmount")}</TableHead>
                        <TableHead className="text-xs text-right">{t("finance.lineTotal")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.lines.map((line) => (
                        <TableRow key={line.id} className="border-border">
                          <TableCell className="text-xs text-foreground">{line.description}</TableCell>
                          <TableCell className="text-xs text-center text-muted-foreground">{line.quantity}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{fmtNum(Number(line.unitPrice), locale)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">{Number(line.taxRate)}%</TableCell>
                          <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmtNum(Number(line.taxAmount), locale)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-medium">{fmtNum(Number(line.lineTotal), locale)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              {/* Payments */}
              <Card className="border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">
                    {t("finance.payments")}
                  </h3>
                  {detail.status !== "PAID" && detail.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-xs"
                      onClick={() =>
                        openPayment({
                          ...detail,
                          paidAmount: detail.paidAmount,
                          remainingBalance: detail.remainingBalance,
                        })
                      }
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      {t("finance.recordPayment")}
                    </Button>
                  )}
                </div>
                {detail.payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("finance.noInvoices")}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-xs">{t("finance.paymentDate")}</TableHead>
                        <TableHead className="text-xs">{t("finance.paymentMethod")}</TableHead>
                        <TableHead className="text-xs text-right">{t("finance.paymentAmount")}</TableHead>
                        <TableHead className="text-xs">{t("finance.paymentReference")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.payments.map((p) => (
                        <TableRow key={p.id} className="border-border">
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(p.paymentDate)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t(paymentMethodLabels[p.paymentMethod] || p.paymentMethod)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-foreground">
                            {fmtNum(Number(p.amount), locale)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.reference || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </div>
          ) : null}

          {/* Sheet footer actions */}
          {detail && detail.status === "DRAFT" && !editingLines && (
            <SheetFooter className="border-t border-border">
              <div className="flex gap-2 w-full justify-end">
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs"
                  onClick={() => updateStatus("CANCELLED")}
                >
                  {t("finance.cancelInvoice")}
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => updateStatus("POSTED")}
                >
                  {t("finance.postInvoice")}
                </Button>
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Payment Dialog ──────────────────── */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("finance.recordPayment")}</DialogTitle>
          </DialogHeader>

          {paymentInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground border border-border rounded-md p-3">
                <div>
                  <p className="font-medium text-foreground">{t("finance.invoiceTotal")}</p>
                  <p className="font-mono mt-1">
                    {fmtNum(paymentInvoice.total, locale)} {paymentInvoice.currency}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("finance.paidAmount")}</p>
                  <p className="font-mono mt-1 text-emerald-600">
                    {fmtNum(paymentInvoice.paidAmount ?? 0, locale)}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{t("finance.remainingBalance")}</p>
                  <p className="font-mono mt-1">
                    {fmtNum(
                      paymentInvoice.remainingBalance ?? paymentInvoice.total,
                      locale
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">{t("finance.paymentAmount")} *</Label>
                  <Input
                    className="h-9 mt-1"
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("finance.paymentMethod")} *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">{t("finance.methodCash")}</SelectItem>
                      <SelectItem value="BANK_TRANSFER">{t("finance.methodBankTransfer")}</SelectItem>
                      <SelectItem value="CHECK">{t("finance.methodCheck")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("finance.paymentDate")} *</Label>
                  <Input
                    className="h-9 mt-1"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("finance.paymentReference")}</Label>
                  <Input
                    className="h-9 mt-1"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder={t("finance.paymentReference")}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPaymentOpen(false)}
              className="text-xs"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submitPayment}
              disabled={paymentSubmitting || !paymentAmount}
              className="text-xs"
            >
              {paymentSubmitting && (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              )}
              {t("finance.recordPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Invoice Dialog ────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("finance.createInvoice")}</DialogTitle>
          </DialogHeader>

          {optionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Entity type toggle */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("finance.entityType")}</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={createType === "agent" ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => { setCreateType("agent"); setFetchedJobs([]); setJobsFetched(false); }}
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

              {/* Agent mode: agent + date range + fetch jobs */}
              {createType === "agent" && (
                <>
                  <div className="grid grid-cols-5 gap-3 items-end">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("finance.selectAgent")} *</Label>
                      <Select
                        value={selectedAgentId}
                        onValueChange={(v) => {
                          setSelectedAgentId(v);
                          setFetchedJobs([]);
                          setJobsFetched(false);
                          const agent = agentOptions.find((a) => a.id === v);
                          if (agent?.creditDays) {
                            const d = new Date(issueDate);
                            d.setDate(d.getDate() + agent.creditDays);
                            setDueDate(d.toISOString().split("T")[0]);
                          }
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={t("finance.selectAgent")} />
                        </SelectTrigger>
                        <SelectContent>
                          {agentOptions.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.legalName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodFrom")}</Label>
                      <Input
                        className="h-9"
                        type="date"
                        value={agentJobDateFrom}
                        onChange={(e) => setAgentJobDateFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("finance.jobPeriodTo")}</Label>
                      <Input
                        className="h-9"
                        type="date"
                        value={agentJobDateTo}
                        onChange={(e) => setAgentJobDateTo(e.target.value)}
                      />
                    </div>
                    <Button
                      className="h-9 gap-1.5 text-xs"
                      onClick={fetchAgentJobs}
                      disabled={jobsFetching || !selectedAgentId}
                    >
                      {jobsFetching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                      )}
                      {t("finance.fetchJobs")}
                    </Button>
                  </div>

                  {/* Fetched jobs table */}
                  {jobsFetched && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">
                          {fetchedJobs.filter((j) => j.selected).length} / {fetchedJobs.length} {t("finance.jobsSelected")}
                        </h4>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="create-vat"
                              checked={createAllVat}
                              onCheckedChange={(c) => {
                                // createAllVat is derived, so we toggle via applyCreateVat
                                // For fetched jobs mode, we just need the checkbox state
                                applyCreateVat(!!c);
                              }}
                            />
                            <Label htmlFor="create-vat" className="text-xs text-muted-foreground cursor-pointer">
                              {t("finance.applyVat")}
                            </Label>
                          </div>
                        </div>
                      </div>

                      {fetchedJobs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">
                          {t("finance.noJobsFound")}
                        </p>
                      ) : (
                        <div className="max-h-80 overflow-y-auto border border-border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border bg-muted/50">
                                <TableHead className="text-xs w-10">
                                  <Checkbox
                                    checked={fetchedJobs.length > 0 && fetchedJobs.every((j) => j.selected)}
                                    onCheckedChange={toggleAllFetchedJobs}
                                  />
                                </TableHead>
                                <TableHead className="text-xs">{t("common.date")}</TableHead>
                                <TableHead className="text-xs">Agent Ref</TableHead>
                                <TableHead className="text-xs">{t("jobs.serviceType")}</TableHead>
                                <TableHead className="text-xs">{t("finance.route")}</TableHead>
                                <TableHead className="text-xs">Pax</TableHead>
                                <TableHead className="text-xs">{t("finance.vehicleType")}</TableHead>
                                <TableHead className="text-xs">Extras</TableHead>
                                <TableHead className="text-xs w-28">{t("finance.unitPrice")} *</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {fetchedJobs.map((job) => {
                                const route =
                                  (job.originAirport?.code || job.fromZone?.name || job.originHotel?.name || "?") +
                                  " > " +
                                  (job.destinationAirport?.code || job.toZone?.name || job.destinationHotel?.name || "?");
                                const extras = [
                                  job.boosterSeat && job.boosterSeatQty ? `Booster x${job.boosterSeatQty}` : "",
                                  job.babySeat && job.babySeatQty ? `Baby x${job.babySeatQty}` : "",
                                  job.wheelChair && job.wheelChairQty ? `WC x${job.wheelChairQty}` : "",
                                ].filter(Boolean).join(", ");
                                return (
                                  <TableRow
                                    key={job.id}
                                    className={`border-border ${job.selected ? "bg-primary/5" : ""}`}
                                  >
                                    <TableCell>
                                      <Checkbox
                                        checked={job.selected}
                                        onCheckedChange={() => toggleFetchedJob(job.id)}
                                      />
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {formatDate(job.jobDate)}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono">{job.agentRef || "-"}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{job.serviceType}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{route}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{job.paxCount}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {job.assignment?.vehicle?.vehicleType?.name || "-"}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                      {extras || "-"}
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        className="h-7 text-xs w-24"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={job.unitPrice || ""}
                                        onChange={(e) =>
                                          updateFetchedJobPrice(job.id, parseFloat(e.target.value) || 0)
                                        }
                                        placeholder="0.00"
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Invoice dates */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("finance.issueDate")} *</Label>
                          <Input
                            className="h-9"
                            type="date"
                            value={issueDate}
                            onChange={(e) => setIssueDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">{t("finance.dueDate")} *</Label>
                          <Input
                            className="h-9"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Totals preview */}
                      <div className="border-t border-border pt-2 mt-2 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t("finance.subtotal")}</span>
                          <span className="font-mono">{fmtNum(agentJobTotals.subtotal, locale)}</span>
                        </div>
                        {agentJobTotals.taxAmount > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{t("finance.taxAmount")}</span>
                            <span className="font-mono">{fmtNum(agentJobTotals.taxAmount, locale)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-medium text-foreground">
                          <span>{t("common.total")}</span>
                          <span className="font-mono">{fmtNum(agentJobTotals.total, locale)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Customer mode: entity selector + dates */}
              {createType === "customer" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t("finance.selectCustomer")} *</Label>
                    <Select
                      value={selectedCustomerId}
                      onValueChange={(v) => {
                        setSelectedCustomerId(v);
                        const cust = customerOptions.find((c) => c.id === v);
                        if (cust?.creditDays) {
                          const d = new Date(issueDate);
                          d.setDate(d.getDate() + cust.creditDays);
                          setDueDate(d.toISOString().split("T")[0]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={t("finance.selectCustomer")} />
                      </SelectTrigger>
                      <SelectContent>
                        {customerOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.legalName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("finance.issueDate")} *</Label>
                      <Input
                        className="h-9"
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("finance.dueDate")} *</Label>
                      <Input
                        className="h-9"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Customer mode: job selection */}
              {createType === "customer" && (
                <div className="space-y-3 border-t border-border pt-3">
                  <h4 className="text-sm font-medium text-foreground">{t("finance.selectJobs")} *</h4>
                  {jobOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No completed jobs found</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border bg-muted/50">
                            <TableHead className="text-xs w-10"></TableHead>
                            <TableHead className="text-xs">Ref</TableHead>
                            <TableHead className="text-xs">{t("common.date")}</TableHead>
                            <TableHead className="text-xs">{t("jobs.serviceType")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobOptions.map((job) => (
                            <TableRow
                              key={job.id}
                              className={`border-border cursor-pointer ${selectedJobIds.includes(job.id) ? "bg-primary/10" : ""}`}
                              onClick={() => toggleJobSelection(job.id)}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedJobIds.includes(job.id)}
                                  onCheckedChange={() => toggleJobSelection(job.id)}
                                />
                              </TableCell>
                              <TableCell className="text-xs font-mono">{job.internalRef}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDate(job.serviceDate)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {job.serviceType}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {selectedJobIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedJobIds.length} job(s) selected
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              className="text-xs"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={submitCreateInvoice}
              disabled={createSubmitting}
              className="text-xs"
            >
              {createSubmitting && (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              )}
              {t("finance.createInvoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
