"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Car,
  Building2,
  DollarSign,
  Loader2,
  Search,
  UserCheck,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  Camera,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
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
import api from "@/lib/api";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate , localDateStr } from "@/lib/utils";
import { SortableHeader } from "@/components/sortable-header";
import { useSortable } from "@/hooks/use-sortable";
import { useAuthStore } from "@/stores/auth-store";
import { useCompanyStore } from "@/stores/company-store";
import { usePermission } from "@/hooks/use-permission";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface DispatchSummary {
  date: string;
  totalJobs: number;
  assignedCount: number;
  unassignedCount: number;
  completionRate: number;
  assignmentRate: number;
  byStatus: Record<string, number>;
  byServiceType: Record<string, number>;
  jobs: Array<{
    id: string;
    internalRef: string;
    serviceType: string;
    status: string;
    paxCount: number;
    agent: { legalName: string } | null;
    customer: { legalName: string } | null;
    assignment: {
      vehicle: { plateNumber: string; vehicleType: { name: string } };
      driver: { name: string } | null;
      rep: { name: string } | null;
    } | null;
  }>;
}

interface DriverTripReport {
  from: string;
  to: string;
  totalDrivers: number;
  totalTrips: number;
  drivers: Array<{
    driver: { id: string; name: string; mobileNumber: string };
    tripCount: number;
    totalFees: number;
    trips: Array<{
      jobDate: string;
      serviceType: string;
      route: string;
      agent: string;
      internalRef: string;
    }>;
  }>;
}

interface AgentStatement {
  agent: {
    id: string;
    legalName: string;
    tradeName: string | null;
    currency: string;
    creditLimit: number | null;
    creditDays: number | null;
  };
  period: { from: string; to: string };
  jobCount: number;
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    total: number;
    paid: number;
    balance: number;
    status: string;
    lineCount: number;
  }>;
}

interface RevenueReport {
  period: { from: string; to: string };
  totalRevenue: number;
  totalCosts: number;
  grossProfit: number;
  profitMargin: number;
  costBreakdown: {
    driverFees: number;
    repFees: number;
    supplierCosts: number;
  };
  byServiceType: Record<string, number>;
  byAgent: Array<{
    agentId: string;
    name: string;
    revenue: number;
    invoiceCount: number;
    jobCount: number;
  }>;
}

interface RepJobScore {
  attendance: boolean;
  appearance: boolean;
  work: boolean;
  review: boolean;
  total: number | null;
  fee: number | null;
  evaluation: string | null;
}

interface RepFeeReport {
  date: string;
  grandTotal: number;
  totalFlights: number;
  reps: Array<{
    repId: string;
    repName: string;
    feePerFlight: number;
    flightCount: number;
    totalAmount: number;
    fees: Array<{
      id: string;
      amount: number;
      status: string;
      repStatus: string | null;
      inPlaceEvidence: { imageUrls: string[]; gpsMapLink: string | null; createdAt: string } | null;
      repJobScore: RepJobScore | null;
      trafficJob: {
        id: string;
        internalRef: string;
        serviceType: string;
        paxCount: number;
        status: string;
        fromZone: { name: string } | null;
        toZone: { name: string } | null;
        originAirport?: { name: string; code: string } | null;
        originZone?: { name: string } | null;
        originHotel?: { name: string } | null;
        destinationAirport?: { name: string; code: string } | null;
        destinationZone?: { name: string } | null;
        destinationHotel?: { name: string } | null;
        hotel: { name: string } | null;
        flight: {
          flightNo: string;
          carrier: string;
          terminal: string | null;
          arrivalTime: string | null;
        } | null;
      };
    }>;
  }>;
}

interface RepFeeReportRep {
  repId: string;
  repName: string;
  feePerFlight: number;
  flightCount: number;
  totalAmount: number;
  fees: RepFeeReport["reps"][number]["fees"];
}

interface RepScoreRow {
  jobId: string;
  internalRef: string;
  serviceType: string;
  paxCount: number;
  status: string;
  repId: string;
  repName: string;
  fromZone: { name: string } | null;
  toZone: { name: string } | null;
  originAirport: { name: string; code: string } | null;
  originZone: { name: string } | null;
  originHotel: { name: string } | null;
  destinationAirport: { name: string; code: string } | null;
  destinationZone: { name: string } | null;
  destinationHotel: { name: string } | null;
  attendance: boolean;
  appearance: boolean;
  work: boolean;
  review: boolean;
  total: number;
  fee: number;
  evaluation: string;
}

interface RepScoreReport {
  from: string;
  to: string;
  rows: RepScoreRow[];
  totalScore: number;
  avgScore: number;
  count: number;
}

interface ComplianceReportItem {
  vehicleId: string;
  plateNumber: string;
  vehicleTypeName: string;
  ownership: string;
  licenseExpiryDate: string | null;
  hasInsurance: boolean;
  insuranceExpiryDate: string | null;
  annualPayment: number | null;
  annualPaymentCurrency: string | null;
  gpsSubscription: number | null;
  tourismSupportFund: number | null;
  registrationFees: number | null;
  temporaryPermitDate: string | null;
  temporaryPermitExpiryDate: string | null;
  totalFees: number | null;
  depositTotal: number | null;
  balanceRemaining: number | null;
}

interface JobStatusReport {
  from: string;
  to: string;
  totalJobs: number;
  jobs: Array<{
    id: string;
    internalRef: string;
    agentRef: string | null;
    agentName: string | null;
    serviceDate: string;
    priceAmount: number | null;
    priceCurrency: string | null;
    status: string;
    repJobStatus: string | null;
    driverJobStatus: string | null;
    repName: string | null;
    driverName: string | null;
    driverEvidence: EvidenceItem[];
  }>;
}

interface EvidenceItem {
  id: string;
  imageUrls: string[];
  gpsMapLink: string;
  submittedBy: string;
  createdAt: string;
}

interface EvidenceReportRow {
  jobId: string;
  internalRef: string;
  agentName: string | null;
  agentRef: string | null;
  jobDate: string;
  serviceType: string;
  status: string;
  paxCount: number;
  clientName: string | null;
  fromZone: { name: string } | null;
  toZone: { name: string } | null;
  originAirport: { name: string; code: string } | null;
  destinationAirport: { name: string; code: string } | null;
  originHotel: { name: string } | null;
  destinationHotel: { name: string } | null;
  flight: {
    flightNo: string;
    carrier: string;
    terminal: string | null;
    arrivalTime: string | null;
    departureTime: string | null;
  } | null;
  assignment: {
    vehicle: { plateNumber: string } | null;
    driver: { name: string } | null;
    rep: { name: string } | null;
  } | null;
  noShowEvidence: EvidenceItem[];
  inPlaceEvidence: EvidenceItem[];
  completedEvidence: EvidenceItem[];
  hasEvidence: boolean;
}

interface EvidenceReport {
  from: string;
  to: string;
  totalJobs: number;
  rows: EvidenceReportRow[];
}

interface Agent {
  id: string;
  legalName: string;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const today = localDateStr(new Date());
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  .toISOString()
  .split("T")[0];

const fmt = (n: number, locale = "en-US") =>
  n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  ASSIGNED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  COMPLETED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  NO_SHOW: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30",
  IN_PLACE: "bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30",
  DRAFT: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  POSTED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PAID: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

// ────────────────────────────────────────────
// Stat Card
// ────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="border-border bg-card px-2 py-px">
      <p className="text-[10px] text-muted-foreground leading-none truncate">{label}</p>
      <p className={`text-xs font-semibold leading-snug ${color}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground leading-none">{sub}</p>}
    </Card>
  );
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

export default function ReportsPage() {
  const t = useT();
  const locale = useLocaleId();
  const { user } = useAuthStore();
  const { logoUrl, companyName } = useCompanyStore();

  const canDailyDispatch = usePermission("reports.dailyDispatch");
  const canDriverTrips = usePermission("reports.driverTrips");
  const canAgentStatement = usePermission("reports.agentStatement");
  const canRepFees = usePermission("reports.repFees");
  const canRevenue = usePermission("reports.revenue");
  const canVehicleCompliance = usePermission("reports.vehicleCompliance");
  const canJobStatus = usePermission("reports.jobStatus");
  const canEvidence = usePermission("reports.evidence");

  // Daily Dispatch
  const [dispatchDate, setDispatchDate] = useState(today);
  const [dispatchData, setDispatchData] = useState<DispatchSummary | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Driver Trips
  const [driverFrom, setDriverFrom] = useState(thirtyDaysAgo);
  const [driverTo, setDriverTo] = useState(today);
  const [driverData, setDriverData] = useState<DriverTripReport | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);

  // Agent Statement
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentFrom, setAgentFrom] = useState(thirtyDaysAgo);
  const [agentTo, setAgentTo] = useState(today);
  const [agentData, setAgentData] = useState<AgentStatement | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  // Revenue
  const [revenueFrom, setRevenueFrom] = useState(thirtyDaysAgo);
  const [revenueTo, setRevenueTo] = useState(today);
  const [revenueData, setRevenueData] = useState<RevenueReport | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Rep Fees
  const [repFeeDate, setRepFeeDate] = useState(today);
  const [repFeeData, setRepFeeData] = useState<RepFeeReport | null>(null);
  const [repFeeLoading, setRepFeeLoading] = useState(false);
  const [selectedRep, setSelectedRep] = useState<RepFeeReportRep | null>(null);
  const [repModalOpen, setRepModalOpen] = useState(false);
  // scoreEdits: jobId → { attendance, appearance, work, review }
  const [scoreEdits, setScoreEdits] = useState<Record<string, RepJobScore>>({});
  const [scoreSaving, setScoreSaving] = useState<Record<string, boolean>>({});
  const printRef = useRef<HTMLDivElement>(null);
  const dispatchPrintRef = useRef<HTMLDivElement>(null);
  const driverPrintRef = useRef<HTMLDivElement>(null);
  const agentPrintRef = useRef<HTMLDivElement>(null);
  const revenuePrintRef = useRef<HTMLDivElement>(null);
  const compliancePrintRef = useRef<HTMLDivElement>(null);

  // Vehicle Compliance
  const [complianceData, setComplianceData] = useState<ComplianceReportItem[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceOwnershipFilter, setComplianceOwnershipFilter] = useState("ALL");
  const [complianceTypeFilter, setComplianceTypeFilter] = useState("ALL");

  // Job Status
  const [jobStatusFrom, setJobStatusFrom] = useState(thirtyDaysAgo);
  const [jobStatusTo, setJobStatusTo] = useState(today);
  const [jobStatusFilter, setJobStatusFilter] = useState("ALL");
  const [jobStatusData, setJobStatusData] = useState<JobStatusReport | null>(null);
  const [jobStatusLoading, setJobStatusLoading] = useState(false);
  const jobStatusPrintRef = useRef<HTMLDivElement>(null);

  // Rep Score
  const [repScoreFrom, setRepScoreFrom] = useState(thirtyDaysAgo);
  const [repScoreTo, setRepScoreTo] = useState(today);
  const [repScoreRepId, setRepScoreRepId] = useState("ALL");
  const [repList, setRepList] = useState<Array<{ id: string; name: string }>>([]);
  const [repScoreData, setRepScoreData] = useState<RepScoreReport | null>(null);
  const [repScoreLoading, setRepScoreLoading] = useState(false);
  const repScorePrintRef = useRef<HTMLDivElement>(null);

  // Evidence Report
  const [evidenceFrom, setEvidenceFrom] = useState(thirtyDaysAgo);
  const [evidenceTo, setEvidenceTo] = useState(today);
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState("ALL");
  const [evidenceAgentId, setEvidenceAgentId] = useState("ALL");
  const [evidenceData, setEvidenceData] = useState<EvidenceReport | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // Derived: filtered compliance data and unique vehicle types
  const complianceVehicleTypes = Array.from(new Set(complianceData.map((v) => v.vehicleTypeName).filter(Boolean))).sort();
  const filteredComplianceData = complianceData.filter((v) => {
    if (complianceOwnershipFilter !== "ALL" && v.ownership !== complianceOwnershipFilter) return false;
    if (complianceTypeFilter !== "ALL" && v.vehicleTypeName !== complianceTypeFilter) return false;
    return true;
  });

  // Sortable hooks for each report table
  const dispatchSort = useSortable(dispatchData?.jobs || []);
  const driverSort = useSortable(driverData?.drivers || []);
  const agentSort = useSortable(agentData?.invoices || []);
  const repFeeSort = useSortable(repFeeData?.reps || []);
  const revenueSort = useSortable(revenueData?.byAgent || []);
  const complianceSort = useSortable(filteredComplianceData);
  const jobStatusSort = useSortable(jobStatusData?.jobs || []);

  // Load agents list for agent statement
  useEffect(() => {
    api
      .get("/agents")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setAgents(list);
      })
      .catch(() => {});
  }, []);

  // Load reps list for rep score filter
  useEffect(() => {
    api
      .get("/reps")
      .then(({ data }) => {
        const list: Array<{ id: string; name: string }> = Array.isArray(data) ? data : data.data || [];
        setRepList(list.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => {});
  }, []);

  // ── Fetch functions ──

  const fetchDispatch = async () => {
    setDispatchLoading(true);
    try {
      const { data } = await api.get(
        `/reports/daily-dispatch?date=${dispatchDate}`
      );
      setDispatchData(data.data || data);
    } catch {
      toast.error(t("reports.failedDispatch"));
    } finally {
      setDispatchLoading(false);
    }
  };

  const fetchDriverTrips = async () => {
    setDriverLoading(true);
    try {
      const { data } = await api.get(
        `/reports/driver-trips?from=${driverFrom}&to=${driverTo}`
      );
      setDriverData(data.data || data);
    } catch {
      toast.error(t("reports.failedDriverTrips"));
    } finally {
      setDriverLoading(false);
    }
  };

  const fetchAgentStatement = async () => {
    if (!selectedAgentId) {
      toast.error(t("reports.selectAgentRequired"));
      return;
    }
    setAgentLoading(true);
    try {
      const { data } = await api.get(
        `/reports/agent-statement/${selectedAgentId}?from=${agentFrom}&to=${agentTo}`
      );
      setAgentData(data.data || data);
    } catch {
      toast.error(t("reports.failedAgentStatement"));
    } finally {
      setAgentLoading(false);
    }
  };

  const fetchRevenue = async () => {
    setRevenueLoading(true);
    try {
      const { data } = await api.get(
        `/reports/revenue?from=${revenueFrom}&to=${revenueTo}`
      );
      setRevenueData(data.data || data);
    } catch {
      toast.error(t("reports.failedRevenue"));
    } finally {
      setRevenueLoading(false);
    }
  };

  const fetchRepFees = async () => {
    setRepFeeLoading(true);
    try {
      const { data } = await api.get(
        `/reports/rep-fees?date=${repFeeDate}`
      );
      setRepFeeData(data.data || data);
    } catch {
      toast.error(t("reports.failedRepFees"));
    } finally {
      setRepFeeLoading(false);
    }
  };

  const saveRepScore = async (
    jobId: string,
    score: { attendance: boolean; appearance: boolean; work: boolean; review: boolean },
  ) => {
    setScoreSaving((s) => ({ ...s, [jobId]: true }));
    try {
      await api.put(`/reports/rep-score/${jobId}`, score);
      // Recompute the score locally
      const total =
        (score.attendance ? 20 : 0) +
        (score.appearance ? 15 : 0) +
        (score.work ? 30 : 0) +
        (score.review ? 35 : 0);
      let fee = 20, evaluation = "Poor";
      if (total >= 90) { fee = 50; evaluation = "Excellent"; }
      else if (total >= 75) { fee = 40; evaluation = "Good"; }
      else if (total >= 61) { fee = 30; evaluation = "Average"; }
      const newScore: RepJobScore = { ...score, total, fee, evaluation };
      setScoreEdits((s) => ({ ...s, [jobId]: newScore }));
      // Patch repFeeData so the summary totals update
      setRepFeeData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          reps: prev.reps.map((r) => ({
            ...r,
            fees: r.fees.map((f) =>
              f.trafficJob.id === jobId
                ? { ...f, amount: f.trafficJob.serviceType === "ARR" ? fee : f.amount, repJobScore: newScore }
                : f,
            ),
            totalAmount: r.fees.reduce((sum, f) => {
              if (f.trafficJob.serviceType !== "ARR") return sum;
              const amt = f.trafficJob.id === jobId ? fee : Number(f.amount);
              return sum + amt;
            }, 0),
          })),
        };
      });
    } catch {
      toast.error("Failed to save score");
    } finally {
      setScoreSaving((s) => ({ ...s, [jobId]: false }));
    }
  };

  const fetchCompliance = async () => {
    setComplianceLoading(true);
    try {
      const { data } = await api.get("/vehicles/compliance/report");
      setComplianceData(data.data || []);
    } catch {
      toast.error(t("reports.failedCompliance"));
    } finally {
      setComplianceLoading(false);
    }
  };

  const fetchJobStatus = async () => {
    setJobStatusLoading(true);
    try {
      const statusParam = jobStatusFilter !== "ALL" ? `&status=${jobStatusFilter}` : "";
      const { data } = await api.get(
        `/reports/job-status?from=${jobStatusFrom}&to=${jobStatusTo}${statusParam}`
      );
      setJobStatusData(data.data || data);
    } catch {
      toast.error(t("reports.failedJobStatus"));
    } finally {
      setJobStatusLoading(false);
    }
  };

  const exportJobStatusPdf = () => printFromRef(jobStatusPrintRef, `Job Status Report - ${jobStatusFrom} to ${jobStatusTo}`);

  const downloadDriverEvidencePdf = (job: JobStatusReport["jobs"][number]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const now = new Date().toLocaleString();
    const userName = user?.name || "System";
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
      : `<span style="font-size:18px;font-weight:700;">${companyName}</span>`;

    const renderEvidence = (items: EvidenceItem[], label: string) => {
      if (!items.length) return "";
      return items.map((ev) => `
        <div class="ev-section">
          <div class="ev-meta">
            <strong>${label}</strong> &nbsp;|&nbsp;
            Submitted by: ${ev.submittedBy} &nbsp;|&nbsp;
            Date: ${new Date(ev.createdAt).toLocaleString()} &nbsp;|&nbsp;
            ${ev.gpsMapLink ? `<a href="${ev.gpsMapLink}" target="_blank">GPS Map</a>` : "No GPS"}
          </div>
          <div class="img-grid">
            ${ev.imageUrls.map((url) => `<img src="${url}" class="ev-img" />`).join("")}
          </div>
        </div>
      `).join("");
    };

    const evidenceHtml = renderEvidence(job.driverEvidence, "Driver In-Place Evidence");

    printWindow.document.write(`
      <html><head><title>Driver Evidence – ${job.internalRef}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #111; }
        .report-title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
        .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; background: #f0f0f0; padding: 5px 8px; margin: 16px 0 8px; border-left: 3px solid #333; }
        .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 20px; margin-bottom: 12px; font-size: 12px; }
        .detail-grid dt { color: #666; margin: 0; }
        .detail-grid dd { font-weight: 600; margin: 0; }
        .ev-section { margin-bottom: 20px; page-break-inside: avoid; }
        .ev-meta { font-size: 12px; margin-bottom: 8px; padding: 6px 10px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; }
        .ev-meta a { color: #1a56db; }
        .img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .ev-img { width: 100%; max-height: 220px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
        .no-evidence { color: #888; font-style: italic; font-size: 13px; padding: 12px 0; }
        .report-footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
        @media print { body { padding: 0; } .report-footer { position: fixed; bottom: 20px; left: 20px; right: 20px; } }
      </style></head><body>
      <div class="report-header">
        <div>${logoHtml}</div>
        <div class="report-title">Driver Evidence Report</div>
        <div style="width:160px;text-align:right;font-size:11px;color:#666;">${new Date(job.serviceDate).toLocaleDateString()}</div>
      </div>

      <div class="section-title">Job Details</div>
      <dl class="detail-grid">
        <dt>Job Ref</dt><dd>${job.internalRef}</dd>
        <dt>Agent Name</dt><dd>${job.agentName ?? "—"}</dd>
        <dt>Agent Ref</dt><dd>${job.agentRef ?? "—"}</dd>
        <dt>Service Date</dt><dd>${new Date(job.serviceDate).toLocaleDateString()}</dd>
        <dt>Driver</dt><dd>${job.driverName ?? "—"}</dd>
        <dt>Rep</dt><dd>${job.repName ?? "—"}</dd>
        <dt>Job Status</dt><dd>${job.status}</dd>
        <dt>Driver Status</dt><dd>${job.driverJobStatus ?? "—"}</dd>
        <dt>Rep Status</dt><dd>${job.repJobStatus ?? "—"}</dd>
      </dl>

      <div class="section-title">Driver Evidence</div>
      ${evidenceHtml || '<p class="no-evidence">No driver evidence submitted for this job.</p>'}

      <div class="report-footer">
        <span>Issued By: ${userName}</span>
        <span>Issued on ${now}</span>
      </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const fetchEvidenceReport = async () => {
    setEvidenceLoading(true);
    try {
      const statusParam = evidenceStatusFilter !== "ALL" ? `&status=${evidenceStatusFilter}` : "";
      const agentParam = evidenceAgentId !== "ALL" ? `&agentId=${evidenceAgentId}` : "";
      const { data } = await api.get(
        `/reports/evidence?from=${evidenceFrom}&to=${evidenceTo}${statusParam}${agentParam}`
      );
      setEvidenceData(data.data || data);
    } catch {
      toast.error("Failed to load evidence report");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const generateEvidencePdf = (row: EvidenceReportRow) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error(t("reports.allowPopups")); return; }
    const now = new Date().toLocaleString();
    const userName = user?.name || "System";
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
      : `<span style="font-size:18px;font-weight:700;">${companyName}</span>`;

    const origin = row.originAirport
      ? `${row.originAirport.name} (${row.originAirport.code})`
      : row.originHotel?.name ?? row.fromZone?.name ?? "—";
    const destination = row.destinationAirport
      ? `${row.destinationAirport.name} (${row.destinationAirport.code})`
      : row.destinationHotel?.name ?? row.toZone?.name ?? "—";

    const renderEvidence = (items: EvidenceItem[], label: string) => {
      if (!items.length) return "";
      return items.map((ev) => `
        <div class="ev-section">
          <div class="ev-meta">
            <strong>${label}</strong> &nbsp;|&nbsp;
            Submitted by: ${ev.submittedBy} &nbsp;|&nbsp;
            Date: ${new Date(ev.createdAt).toLocaleString()} &nbsp;|&nbsp;
            ${ev.gpsMapLink ? `<a href="${ev.gpsMapLink}" target="_blank">GPS Map</a>` : "No GPS"}
          </div>
          <div class="img-grid">
            ${ev.imageUrls.map((url) => `<img src="${url}" class="ev-img" />`).join("")}
          </div>
        </div>
      `).join("");
    };

    const allEvidence =
      renderEvidence(row.inPlaceEvidence, "In-Place Evidence") +
      renderEvidence(row.noShowEvidence, "No-Show Evidence") +
      renderEvidence(row.completedEvidence, "Completed Evidence");

    printWindow.document.write(`
      <html><head><title>Evidence – ${row.internalRef}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #111; }
        .report-title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
        .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; background: #f0f0f0; padding: 5px 8px; margin: 16px 0 8px; border-left: 3px solid #333; }
        .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 20px; margin-bottom: 12px; font-size: 12px; }
        .detail-grid dt { color: #666; margin: 0; }
        .detail-grid dd { font-weight: 600; margin: 0; }
        .ev-section { margin-bottom: 20px; page-break-inside: avoid; }
        .ev-meta { font-size: 12px; margin-bottom: 8px; padding: 6px 10px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; }
        .ev-meta a { color: #1a56db; }
        .img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .ev-img { width: 100%; max-height: 220px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
        .no-evidence { color: #888; font-style: italic; font-size: 13px; padding: 12px 0; }
        .report-footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
        @media print { body { padding: 0; } .report-footer { position: fixed; bottom: 20px; left: 20px; right: 20px; } }
      </style></head><body>
      <div class="report-header">
        <div>${logoHtml}</div>
        <div class="report-title">Job Evidence Report</div>
        <div style="width:160px;text-align:right;font-size:11px;color:#666;">${new Date(row.jobDate).toLocaleDateString()}</div>
      </div>

      <div class="section-title">Job Details</div>
      <dl class="detail-grid">
        <dt>Job Ref</dt><dd>${row.internalRef}</dd>
        <dt>Agent Name</dt><dd>${row.agentName ?? "—"}</dd>
        <dt>Agent Ref</dt><dd>${row.agentRef ?? "—"}</dd>
        <dt>Date</dt><dd>${new Date(row.jobDate).toLocaleDateString()}</dd>
        <dt>Service Type</dt><dd>${row.serviceType}</dd>
        <dt>Status</dt><dd>${row.status}</dd>
        <dt>Pax Count</dt><dd>${row.paxCount}</dd>
        <dt>Client</dt><dd>${row.clientName ?? "—"}</dd>
        <dt>Route</dt><dd>${origin} → ${destination}</dd>
        <dt>Vehicle</dt><dd>${row.assignment?.vehicle?.plateNumber ?? "—"}</dd>
        <dt>Driver</dt><dd>${row.assignment?.driver?.name ?? "—"}</dd>
        <dt>Rep</dt><dd>${row.assignment?.rep?.name ?? "—"}</dd>
        ${row.flight ? `<dt>Flight</dt><dd>${row.flight.carrier} ${row.flight.flightNo}${row.flight.terminal ? ` / T${row.flight.terminal}` : ""}</dd>` : ""}
      </dl>

      <div class="section-title">Evidence</div>
      ${allEvidence || '<p class="no-evidence">No evidence submitted for this job.</p>'}

      <div class="report-footer">
        <span>Issued By: ${userName}</span>
        <span>Issued on ${now}</span>
      </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const fetchRepScore = async () => {
    setRepScoreLoading(true);
    try {
      const repParam = repScoreRepId !== "ALL" ? `&repId=${repScoreRepId}` : "";
      const { data } = await api.get(
        `/reports/rep-score?from=${repScoreFrom}&to=${repScoreTo}${repParam}`
      );
      setRepScoreData(data.data || data);
    } catch {
      toast.error("Failed to load rep score report");
    } finally {
      setRepScoreLoading(false);
    }
  };

  const exportRepScorePdf = () => printFromRef(repScorePrintRef, `Rep Score Report - ${repScoreFrom} to ${repScoreTo}`);

  const exportRepFeesExcel = async () => {
    try {
      const res = await api.get(
        `/export/odoo/rep-fees?date=${repFeeDate}`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `rep_fees_${repFeeDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("reports.failedExcel"));
    }
  };

  const exportRepFeesPdf = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error(t("reports.allowPopups"));
      return;
    }
    const now = new Date().toLocaleString();
    const userName = user?.name || "System";
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
      : `<span style="font-size:18px;font-weight:700;">${companyName}</span>`;
    printWindow.document.write(`
      <html><head><title>Rep Fees Report - ${repFeeDate}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .text-right { text-align: right; }
        .total-row { font-weight: 700; background: #f9f9f9; }
        .group-header { background: #eef; font-weight: 600; }
        .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #111; }
        .report-header .logo { flex-shrink: 0; }
        .report-header .report-title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
        .report-footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
        @media print {
          body { padding: 0; }
          .report-footer { position: fixed; bottom: 20px; left: 20px; right: 20px; }
        }
      </style></head><body>
      <div class="report-header">
        <div class="logo">${logoHtml}</div>
        <div class="report-title">Rep Fees Report - ${repFeeDate}</div>
        <div style="width:160px;"></div>
      </div>
      ${printRef.current.innerHTML}
      <div class="report-footer">
        <span>Issued By: ${userName}</span>
        <span>Issued on ${now}</span>
      </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  // ── Generic helpers ──

  const downloadBlob = (data: Blob, filename: string) => {
    const url = window.URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const printFromRef = (ref: React.RefObject<HTMLDivElement | null>, title: string) => {
    if (!ref.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error(t("reports.allowPopups")); return; }
    const now = new Date().toLocaleString();
    const userName = user?.name || "System";
    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
      : `<span style="font-size:18px;font-weight:700;">${companyName}</span>`;
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #555; margin-bottom: 16px; }
        h3 { font-size: 13px; margin-top: 16px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .text-right { text-align: right; }
        .total-row { font-weight: 700; background: #f9f9f9; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 16px; font-size: 12px; }
        .info-grid dt { color: #666; } .info-grid dd { font-weight: 600; margin: 0; }
        .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #111; }
        .report-header .logo { flex-shrink: 0; }
        .report-header .report-title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
        .report-footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #555; }
        @media print {
          body { padding: 0; }
          .report-footer { position: fixed; bottom: 20px; left: 20px; right: 20px; }
        }
      </style></head><body>
      <div class="report-header">
        <div class="logo">${logoHtml}</div>
        <div class="report-title">${title}</div>
        <div style="width:160px;"></div>
      </div>
      ${ref.current.innerHTML}
      <div class="report-footer">
        <span>Issued By: ${userName}</span>
        <span>Issued on ${now}</span>
      </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  // ── Daily Dispatch Export ──
  const exportDispatchExcel = async () => {
    try {
      const res = await api.get(`/export/odoo/daily-dispatch?date=${dispatchDate}`, { responseType: "blob" });
      downloadBlob(new Blob([res.data]), `daily_dispatch_${dispatchDate}.xlsx`);
    } catch { toast.error(t("reports.failedExcel")); }
  };
  const exportDispatchPdf = () => printFromRef(dispatchPrintRef, `Daily Dispatch - ${dispatchDate}`);

  // ── Driver Trips Export ──
  const exportDriverTripsExcel = async () => {
    try {
      const res = await api.get(`/export/odoo/driver-trips?from=${driverFrom}&to=${driverTo}`, { responseType: "blob" });
      downloadBlob(new Blob([res.data]), `driver_trips_${driverFrom}_${driverTo}.xlsx`);
    } catch { toast.error(t("reports.failedExcel")); }
  };
  const exportDriverTripsPdf = () => printFromRef(driverPrintRef, `Driver Trips - ${driverFrom} to ${driverTo}`);

  // ── Agent Statement Export ──
  const exportAgentStatementExcel = async () => {
    try {
      const res = await api.get(`/export/odoo/agent-statement/${selectedAgentId}?from=${agentFrom}&to=${agentTo}`, { responseType: "blob" });
      downloadBlob(new Blob([res.data]), `agent_statement_${agentFrom}_${agentTo}.xlsx`);
    } catch { toast.error(t("reports.failedExcel")); }
  };
  const exportAgentStatementPdf = () => printFromRef(agentPrintRef, `Agent Statement - ${agentData?.agent.legalName || ""}`);

  // ── Revenue Export ──
  const exportRevenueExcel = async () => {
    try {
      const res = await api.get(`/export/odoo/revenue?from=${revenueFrom}&to=${revenueTo}`, { responseType: "blob" });
      downloadBlob(new Blob([res.data]), `revenue_${revenueFrom}_${revenueTo}.xlsx`);
    } catch { toast.error(t("reports.failedExcel")); }
  };
  const exportRevenuePdf = () => printFromRef(revenuePrintRef, `Revenue Report - ${revenueFrom} to ${revenueTo}`);

  // ── Vehicle Compliance Export ──
  const exportComplianceExcel = async () => {
    try {
      const res = await api.get("/export/odoo/vehicle-compliance", { responseType: "blob" });
      downloadBlob(new Blob([res.data]), "vehicle_compliance.xlsx");
    } catch { toast.error(t("reports.failedExcel")); }
  };
  const exportCompliancePdf = () => printFromRef(compliancePrintRef, "Vehicle Compliance Report");

  // Group fees by flight number for the modal
  function groupByFlight(fees: RepFeeReportRep["fees"]) {
    const groups = new Map<
      string,
      { flightNo: string; carrier: string; jobs: typeof fees }
    >();
    for (const fee of fees) {
      const flightNo = fee.trafficJob.flight?.flightNo || "No Flight";
      const carrier = fee.trafficJob.flight?.carrier || "";
      const key = `${flightNo}|${carrier}`;
      const existing = groups.get(key);
      if (existing) {
        existing.jobs.push(fee);
      } else {
        groups.set(key, { flightNo, carrier, jobs: [fee] });
      }
    }
    return Array.from(groups.values());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
      />

      <Tabs defaultValue={
        canDailyDispatch ? "dispatch" :
        canDriverTrips ? "drivers" :
        canAgentStatement ? "agent" :
        canRepFees ? "rep-fees" :
        canRevenue ? "revenue" :
        canVehicleCompliance ? "compliance" :
        canJobStatus ? "job-status" :
        canEvidence ? "evidence" : "dispatch"
      } className="space-y-4">
        <TabsList className="bg-card border border-border">
          {canDailyDispatch && (
            <TabsTrigger
              value="dispatch"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t("reports.dailyDispatch")}
            </TabsTrigger>
          )}
          {canDriverTrips && (
            <TabsTrigger
              value="drivers"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Car className="h-3.5 w-3.5" />
              {t("reports.driverTrips")}
            </TabsTrigger>
          )}
          {canAgentStatement && (
            <TabsTrigger
              value="agent"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Building2 className="h-3.5 w-3.5" />
              {t("reports.agentStatement")}
            </TabsTrigger>
          )}
          {canRepFees && (
            <TabsTrigger
              value="rep-fees"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {t("reports.repFees")}
            </TabsTrigger>
          )}
          {canRevenue && (
            <TabsTrigger
              value="revenue"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <DollarSign className="h-3.5 w-3.5" />
              {t("reports.revenue")}
            </TabsTrigger>
          )}
          {canVehicleCompliance && (
            <TabsTrigger
              value="compliance"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("reports.vehicleCompliance")}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="job-status"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {t("reports.jobStatus")}
          </TabsTrigger>
          {canRepFees && (
            <TabsTrigger
              value="rep-score"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Rep Score
            </TabsTrigger>
          )}
          {canEvidence && (
            <TabsTrigger
              value="evidence"
              className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Camera className="h-3.5 w-3.5" />
              Evidence
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── DAILY DISPATCH SUMMARY ─── */}
        {canDailyDispatch && <TabsContent value="dispatch" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.date")}</Label>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchDispatch}
                disabled={dispatchLoading}
                className="gap-1.5"
              >
                {dispatchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {dispatchData && (
                <>
                  <Button variant="outline" onClick={exportDispatchExcel} className="gap-1.5 border-border text-foreground">
                    <FileSpreadsheet className="h-4 w-4" /> {t("reports.excel")}
                  </Button>
                  <Button variant="outline" onClick={exportDispatchPdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {dispatchData && (
            <>
              <div className="grid grid-cols-8 gap-1.5">
                <StatCard
                  label={t("reports.totalJobs")}
                  value={dispatchData.totalJobs}
                />
                <StatCard
                  label={t("reports.assigned")}
                  value={dispatchData.assignedCount}
                  sub={`${dispatchData.assignmentRate}%`}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label={t("reports.unassigned")}
                  value={dispatchData.unassignedCount}
                  color="text-amber-600 dark:text-amber-400"
                />
                <StatCard
                  label={t("reports.completionRate")}
                  value={`${dispatchData.completionRate}%`}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                {Object.entries(dispatchData.byServiceType).map(([type, count]) => (
                  <StatCard key={type} label={type} value={count} />
                ))}
                {Object.entries(dispatchData.byStatus).map(([status, count]) => (
                  <StatCard key={status} label={status} value={count} />
                ))}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("dispatch.ref")} sortKey="internalRef" currentKey={dispatchSort.sortKey} currentDir={dispatchSort.sortDir} onSort={dispatchSort.onSort} />
                      <SortableHeader label={t("jobs.type")} sortKey="serviceType" currentKey={dispatchSort.sortKey} currentDir={dispatchSort.sortDir} onSort={dispatchSort.onSort} />
                      <TableHead className="text-white text-xs">{t("dispatch.agent")}</TableHead>
                      <SortableHeader label={t("dispatch.pax")} sortKey="paxCount" currentKey={dispatchSort.sortKey} currentDir={dispatchSort.sortDir} onSort={dispatchSort.onSort} />
                      <TableHead className="text-white text-xs">{t("dispatch.vehicle")}</TableHead>
                      <TableHead className="text-white text-xs">{t("dispatch.driver")}</TableHead>
                      <SortableHeader label={t("common.status")} sortKey="status" currentKey={dispatchSort.sortKey} currentDir={dispatchSort.sortDir} onSort={dispatchSort.onSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatchSort.sortedData.map((job, idx) => (
                      <TableRow
                        key={job.id}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {job.internalRef}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.serviceType}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.agent?.legalName || job.customer?.legalName || "\u2014"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.paxCount}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.assignment?.vehicle.plateNumber || "\u2014"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.assignment?.driver?.name || "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColors[job.status] || ""}
                          >
                            {job.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

        {/* ─── DRIVER TRIP REPORT ─── */}
        {canDriverTrips && <TabsContent value="drivers" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                <Input
                  type="date"
                  value={driverFrom}
                  onChange={(e) => setDriverFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                <Input
                  type="date"
                  value={driverTo}
                  onChange={(e) => setDriverTo(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchDriverTrips}
                disabled={driverLoading}
                className="gap-1.5"
              >
                {driverLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {driverData && (
                <>
                  <Button variant="outline" onClick={exportDriverTripsExcel} className="gap-1.5 border-border text-foreground">
                    <FileSpreadsheet className="h-4 w-4" /> {t("reports.excel")}
                  </Button>
                  <Button variant="outline" onClick={exportDriverTripsPdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {driverData && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                <StatCard label={t("reports.drivers")} value={driverData.totalDrivers} />
                <StatCard
                  label={t("reports.totalTrips")}
                  value={driverData.totalTrips}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label={t("reports.avgTripsDriver")}
                  value={
                    driverData.totalDrivers > 0
                      ? (
                          driverData.totalTrips / driverData.totalDrivers
                        ).toFixed(1)
                      : "0"
                  }
                  color="text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("dispatch.driver")} sortKey="driver.name" currentKey={driverSort.sortKey} currentDir={driverSort.sortDir} onSort={driverSort.onSort} />
                      <SortableHeader label={t("drivers.mobile")} sortKey="driver.mobileNumber" currentKey={driverSort.sortKey} currentDir={driverSort.sortDir} onSort={driverSort.onSort} />
                      <SortableHeader label={t("reports.trips")} sortKey="tripCount" currentKey={driverSort.sortKey} currentDir={driverSort.sortDir} onSort={driverSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.totalFees")} sortKey="totalFees" currentKey={driverSort.sortKey} currentDir={driverSort.sortDir} onSort={driverSort.onSort} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverSort.sortedData.map((d, idx) => (
                      <TableRow
                        key={d.driver.id}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell className="text-foreground text-sm font-medium">
                          {d.driver.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {d.driver.mobileNumber}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {d.tripCount}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(d.totalFees, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {driverData.drivers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("reports.noDriverTrips")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

        {/* ─── AGENT STATEMENT ─── */}
        {canAgentStatement && <TabsContent value="agent" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="min-w-48">
                <Label className="text-muted-foreground text-xs">{t("dispatch.agent")}</Label>
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                >
                  <SelectTrigger className="mt-1 border-border bg-card text-foreground">
                    <SelectValue placeholder={t("reports.selectAgent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.legalName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                <Input
                  type="date"
                  value={agentFrom}
                  onChange={(e) => setAgentFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                <Input
                  type="date"
                  value={agentTo}
                  onChange={(e) => setAgentTo(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchAgentStatement}
                disabled={agentLoading}
                className="gap-1.5"
              >
                {agentLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {agentData && (
                <>
                  <Button variant="outline" onClick={exportAgentStatementExcel} className="gap-1.5 border-border text-foreground">
                    <FileSpreadsheet className="h-4 w-4" /> {t("reports.excel")}
                  </Button>
                  <Button variant="outline" onClick={exportAgentStatementPdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {agentData && (
            <>
              <Card className="border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {agentData.agent.legalName}
                    </h3>
                    {agentData.agent.tradeName && (
                      <p className="text-sm text-muted-foreground">
                        {agentData.agent.tradeName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {agentData.agent.creditLimit !== null && (
                      <p className="text-xs text-muted-foreground">
                        {t("reports.creditLimit")}{" "}
                        <span className="text-foreground">
                          {fmt(agentData.agent.creditLimit, locale)}{" "}
                          {agentData.agent.currency}
                        </span>
                      </p>
                    )}
                    {agentData.agent.creditDays !== null && (
                      <p className="text-xs text-muted-foreground">
                        {t("reports.creditDays")}{" "}
                        <span className="text-foreground">
                          {agentData.agent.creditDays}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              <div className="flex gap-1.5 flex-wrap">
                <StatCard label={t("reports.jobs")} value={agentData.jobCount} />
                <StatCard
                  label={t("reports.totalInvoiced")}
                  value={fmt(agentData.totalInvoiced, locale)}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label={t("reports.totalPaid")}
                  value={fmt(agentData.totalPaid, locale)}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label={t("reports.outstanding")}
                  value={fmt(agentData.outstandingBalance, locale)}
                  color={
                    agentData.outstandingBalance > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("finance.invoiceNo")} sortKey="invoiceNumber" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                      <SortableHeader label={t("common.date")} sortKey="invoiceDate" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                      <SortableHeader label={t("finance.dueDate")} sortKey="dueDate" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                      <SortableHeader label={t("common.total")} sortKey="total" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.paid")} sortKey="paid" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.balance")} sortKey="balance" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} className="text-right" />
                      <SortableHeader label={t("common.status")} sortKey="status" currentKey={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentSort.sortedData.map((inv, idx) => (
                      <TableRow
                        key={inv.invoiceNumber}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(inv.invoiceDate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {fmt(inv.total, locale)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(inv.paid, locale)}
                        </TableCell>
                        <TableCell className="text-right text-amber-600 dark:text-amber-400 font-mono">
                          {fmt(inv.balance, locale)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColors[inv.status] || ""}
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {agentData.invoices.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("reports.noInvoices")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

        {/* ─── REP FEES REPORT ─── */}
        {canRepFees && <TabsContent value="rep-fees" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.date")}</Label>
                <Input
                  type="date"
                  value={repFeeDate}
                  onChange={(e) => setRepFeeDate(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchRepFees}
                disabled={repFeeLoading}
                className="gap-1.5"
              >
                {repFeeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {repFeeData && (
                <>
                  <Button
                    variant="outline"
                    onClick={exportRepFeesExcel}
                    className="gap-1.5 border-border text-foreground"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    {t("reports.excel")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportRepFeesPdf}
                    className="gap-1.5 border-border text-foreground"
                  >
                    <Printer className="h-4 w-4" />
                    {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {repFeeData && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                <StatCard
                  label={t("reports.totalReps")}
                  value={repFeeData.reps.length}
                />
                <StatCard
                  label={t("reports.totalFlights")}
                  value={repFeeData.totalFlights}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label={t("reports.grandTotal")}
                  value={`${fmt(repFeeData.grandTotal, locale)} EGP`}
                  color="text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("reports.repName")} sortKey="repName" currentKey={repFeeSort.sortKey} currentDir={repFeeSort.sortDir} onSort={repFeeSort.onSort} />
                      <SortableHeader label={t("reps.feePerFlight")} sortKey="feePerFlight" currentKey={repFeeSort.sortKey} currentDir={repFeeSort.sortDir} onSort={repFeeSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.flights")} sortKey="flightCount" currentKey={repFeeSort.sortKey} currentDir={repFeeSort.sortDir} onSort={repFeeSort.onSort} className="text-right" />
                      <SortableHeader label={t("common.total")} sortKey="totalAmount" currentKey={repFeeSort.sortKey} currentDir={repFeeSort.sortDir} onSort={repFeeSort.onSort} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repFeeSort.sortedData.map((rep, idx) => (
                      <TableRow
                        key={rep.repId}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium text-sm text-left"
                            onClick={() => {
                              setSelectedRep(rep);
                              // Pre-populate scoreEdits from existing scores
                              const initialEdits: Record<string, RepJobScore> = {};
                              for (const fee of rep.fees) {
                                if (fee.repJobScore) {
                                  initialEdits[fee.trafficJob.id] = fee.repJobScore;
                                }
                              }
                              setScoreEdits(initialEdits);
                              setRepModalOpen(true);
                            }}
                          >
                            {rep.repName}
                          </button>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono">
                          {fmt(rep.feePerFlight, locale)}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {rep.flightCount}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(rep.totalAmount, locale)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {repFeeData.reps.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("reports.noRepFees")}
                        </TableCell>
                      </TableRow>
                    )}
                    {repFeeData.reps.length > 0 && (
                      <TableRow className="border-border bg-muted/50 font-semibold">
                        <TableCell className="text-foreground">{t("reports.grandTotal")}</TableCell>
                        <TableCell />
                        <TableCell className="text-right text-foreground font-mono">
                          {repFeeData.totalFlights}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(repFeeData.grandTotal, locale)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

        {/* ─── REVENUE REPORT ─── */}
        {canRevenue && <TabsContent value="revenue" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                <Input
                  type="date"
                  value={revenueFrom}
                  onChange={(e) => setRevenueFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                <Input
                  type="date"
                  value={revenueTo}
                  onChange={(e) => setRevenueTo(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchRevenue}
                disabled={revenueLoading}
                className="gap-1.5"
              >
                {revenueLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {revenueData && (
                <>
                  <Button variant="outline" onClick={exportRevenueExcel} className="gap-1.5 border-border text-foreground">
                    <FileSpreadsheet className="h-4 w-4" /> {t("reports.excel")}
                  </Button>
                  <Button variant="outline" onClick={exportRevenuePdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {revenueData && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                <StatCard
                  label={t("reports.totalRevenue")}
                  value={fmt(revenueData.totalRevenue, locale)}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label={t("reports.totalCosts")}
                  value={fmt(revenueData.totalCosts, locale)}
                  color="text-red-600 dark:text-red-400"
                />
                <StatCard
                  label={t("reports.grossProfit")}
                  value={fmt(revenueData.grossProfit, locale)}
                  color={
                    revenueData.grossProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                />
                <StatCard
                  label={t("reports.profitMargin")}
                  value={`${revenueData.profitMargin}%`}
                  color={
                    revenueData.profitMargin >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card className="border-border bg-card p-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    {t("reports.costBreakdown")}
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{t("reports.driverFees")}</span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.driverFees, locale)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{t("reports.repFeesLabel")}</span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.repFees, locale)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("reports.supplierCosts")}
                      </span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.supplierCosts, locale)}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="border-border bg-card p-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    {t("reports.revenueByServiceType")}
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(revenueData.byServiceType).map(
                      ([type, amount]) => (
                        <div key={type} className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{type}</span>
                          <span className="text-sm font-mono text-foreground">
                            {fmt(amount, locale)}
                          </span>
                        </div>
                      )
                    )}
                    {Object.keys(revenueData.byServiceType).length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
                    )}
                  </div>
                </Card>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("dispatch.agent")} sortKey="name" currentKey={revenueSort.sortKey} currentDir={revenueSort.sortDir} onSort={revenueSort.onSort} />
                      <SortableHeader label={t("reports.revenueLabel")} sortKey="revenue" currentKey={revenueSort.sortKey} currentDir={revenueSort.sortDir} onSort={revenueSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.invoices")} sortKey="invoiceCount" currentKey={revenueSort.sortKey} currentDir={revenueSort.sortDir} onSort={revenueSort.onSort} className="text-right" />
                      <SortableHeader label={t("reports.jobs")} sortKey="jobCount" currentKey={revenueSort.sortKey} currentDir={revenueSort.sortDir} onSort={revenueSort.onSort} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueSort.sortedData.map((a, idx) => (
                      <TableRow
                        key={a.agentId}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        <TableCell className="text-foreground text-sm font-medium">
                          {a.name}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(a.revenue, locale)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono">
                          {a.invoiceCount}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono">
                          {a.jobCount}
                        </TableCell>
                      </TableRow>
                    ))}
                    {revenueData.byAgent.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("reports.noRevenue")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

        {/* ─── VEHICLE COMPLIANCE ─── */}
        {canVehicleCompliance && <TabsContent value="compliance" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={fetchCompliance}
                disabled={complianceLoading}
              >
                {complianceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t("reports.generate")}
              </Button>
              {complianceData.length > 0 && (
                <>
                  <Select value={complianceOwnershipFilter} onValueChange={setComplianceOwnershipFilter}>
                    <SelectTrigger className="w-[160px] h-8">
                      <SelectValue placeholder={t("vehicles.ownership")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("common.all")} Ownership</SelectItem>
                      <SelectItem value="OWNED">Owned</SelectItem>
                      <SelectItem value="RENTED">Rented</SelectItem>
                      <SelectItem value="CONTRACTED">External License</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={complianceTypeFilter} onValueChange={setComplianceTypeFilter}>
                    <SelectTrigger className="w-[160px] h-8">
                      <SelectValue placeholder={t("vehicles.type")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("common.all")} Types</SelectItem>
                      {complianceVehicleTypes.map((vt) => (
                        <SelectItem key={vt} value={vt}>{vt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportComplianceExcel} className="gap-1.5 border-border text-foreground">
                    <FileSpreadsheet className="h-4 w-4" /> {t("reports.excel")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportCompliancePdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                </>
              )}
            </div>
          </Card>

          {complianceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : complianceData.length > 0 ? (
            <>
              {/* Stat Cards */}
              <div className="flex gap-1.5 flex-wrap">
                <StatCard label={t("reports.totalVehicles")} value={filteredComplianceData.length} />
                <StatCard
                  label={t("reports.withInsurance")}
                  value={filteredComplianceData.filter((v) => v.hasInsurance).length}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label={t("reports.permitWarnings")}
                  value={filteredComplianceData.filter((v) => {
                    if (!v.temporaryPermitExpiryDate) return false;
                    const exp = new Date(v.temporaryPermitExpiryDate);
                    const now = new Date();
                    const oneMonth = new Date();
                    oneMonth.setMonth(oneMonth.getMonth() + 1);
                    return exp >= now && exp < oneMonth;
                  }).length}
                  color="text-amber-600 dark:text-amber-400"
                />
                <StatCard
                  label={t("reports.permitsExpired")}
                  value={filteredComplianceData.filter((v) => {
                    if (!v.temporaryPermitExpiryDate) return false;
                    return new Date(v.temporaryPermitExpiryDate) < new Date();
                  }).length}
                  color="text-red-600 dark:text-red-400"
                />
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                      <SortableHeader label={t("vehicles.plateNumber")} sortKey="plateNumber" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.type")} sortKey="vehicleTypeName" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.ownership")} sortKey="ownership" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.licenseExpiryDate")} sortKey="licenseExpiryDate" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-white text-xs">{t("vehicles.insurance")}</TableHead>
                      <SortableHeader label={t("vehicles.temporaryPermit")} sortKey="temporaryPermitDate" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-white text-xs">{t("vehicles.permitExpiry")}</TableHead>
                      <SortableHeader label={t("vehicles.annualPayment")} sortKey="annualPayment" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-white text-xs">{t("vehicles.registrationFees")}</TableHead>
                      <SortableHeader label={t("vehicles.totalFees")} sortKey="totalFees" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.totalDeposits")} sortKey="depositTotal" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-white text-xs">{t("vehicles.balanceRemaining")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complianceSort.sortedData.map((v, idx) => {
                      const permitExp = v.temporaryPermitExpiryDate ? new Date(v.temporaryPermitExpiryDate) : null;
                      const now = new Date();
                      const oneMonth = new Date();
                      oneMonth.setMonth(oneMonth.getMonth() + 1);
                      const isExpired = permitExp && permitExp < now;
                      const isWarning = permitExp && !isExpired && permitExp < oneMonth;

                      return (
                        <TableRow
                          key={`${v.vehicleId}-${idx}`}
                          className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                        >
                          <TableCell className="font-medium text-foreground">{v.plateNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{v.vehicleTypeName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-secondary text-muted-foreground">{v.ownership}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.licenseExpiryDate ? formatDate(v.licenseExpiryDate) : "—"}</TableCell>
                          <TableCell>
                            {v.hasInsurance ? (
                              <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">{t("common.yes")}</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-600 dark:text-red-400">{t("common.no")}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.temporaryPermitDate ? formatDate(v.temporaryPermitDate) : "—"}</TableCell>
                          <TableCell>
                            {permitExp ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground text-sm">{formatDate(v.temporaryPermitExpiryDate!)}</span>
                                {isExpired && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                                {isWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.annualPayment != null ? `${fmt(Number(v.annualPayment))} ${v.annualPaymentCurrency || ""}` : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{v.registrationFees != null ? fmt(Number(v.registrationFees)) : "—"}</TableCell>
                          <TableCell className="text-muted-foreground font-medium">{v.totalFees != null ? fmt(Number(v.totalFees)) : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{v.depositTotal != null ? fmt(Number(v.depositTotal)) : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{v.balanceRemaining != null ? fmt(Number(v.balanceRemaining)) : "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShieldCheck className="mb-2 h-8 w-8" />
              <p className="text-sm">{t("reports.noComplianceData")}</p>
            </div>
          )}
        </TabsContent>}

        {/* ─── JOB STATUS REPORT ─── */}
        <TabsContent value="job-status" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label className="text-muted-foreground text-xs">{t("reports.statusFilter")}</Label>
                <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                  <SelectTrigger className="mt-1 w-44 border-border bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("reports.allStatuses")}</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                <Input
                  type="date"
                  value={jobStatusFrom}
                  onChange={(e) => setJobStatusFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                <Input
                  type="date"
                  value={jobStatusTo}
                  onChange={(e) => setJobStatusTo(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <Button
                onClick={fetchJobStatus}
                disabled={jobStatusLoading}
                className="gap-1.5"
              >
                {jobStatusLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {t("reports.generate")}
              </Button>
              {jobStatusData && (
                <Button variant="outline" onClick={exportJobStatusPdf} className="gap-1.5 border-border text-foreground">
                  <Printer className="h-4 w-4" /> {t("reports.pdf")}
                </Button>
              )}
            </div>
          </Card>

          {jobStatusData ? (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                <StatCard label={t("reports.totalJobs")} value={jobStatusData.totalJobs} />
                <StatCard
                  label="Completed"
                  value={jobStatusData.jobs.filter((j) => j.status === "COMPLETED").length}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label="Pending"
                  value={jobStatusData.jobs.filter((j) => j.status === "PENDING").length}
                  color="text-amber-600 dark:text-amber-400"
                />
                <StatCard
                  label="Cancelled"
                  value={jobStatusData.jobs.filter((j) => j.status === "CANCELLED").length}
                  color="text-red-600 dark:text-red-400"
                />
              </div>

              <div ref={jobStatusPrintRef}>
                <div className="rounded-md border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                        <SortableHeader label={t("reports.trsfReference")} sortKey="internalRef" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.agentRef")} sortKey="agentRef" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("agents.legalName")} sortKey="agentName" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("jobs.serviceDate")} sortKey="serviceDate" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("dispatch.driverName")} sortKey="driverName" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.repName")} sortKey="repName" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.applicationPrice")} sortKey="priceAmount" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} className="text-right" />
                        <SortableHeader label={t("common.status")} sortKey="status" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.repJobStatus")} sortKey="repJobStatus" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.driverJobStatus")} sortKey="driverJobStatus" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <TableHead className="text-muted-foreground font-semibold text-xs">{t("reports.driverEvidence")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobStatusSort.sortedData.map((job) => (
                        <TableRow key={job.id} className="border-border hover:bg-muted/30">
                            <TableCell className="font-mono text-sm text-foreground">{job.internalRef}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{job.agentRef || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.agentName || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(job.serviceDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.driverName || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.repName || "\u2014"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-foreground">
                            {job.priceAmount != null ? `${fmt(job.priceAmount, locale)} ${job.priceCurrency || ""}` : "\u2014"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColors[job.status] || ""}>{job.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {job.repJobStatus ? (
                              <Badge variant="outline" className={statusColors[job.repJobStatus] || ""}>{job.repJobStatus}</Badge>
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {job.driverJobStatus ? (
                              <Badge variant="outline" className={statusColors[job.driverJobStatus] || ""}>{job.driverJobStatus}</Badge>
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {job.driverEvidence.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => downloadDriverEvidencePdf(job)}
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                PDF
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-xs">\u2014</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardList className="mb-2 h-8 w-8" />
              <p className="text-sm">{t("reports.noJobStatusData")}</p>
            </div>
          )}
        </TabsContent>

        {/* ─── REP SCORE REPORT ─── */}
        {canRepFees && (
          <TabsContent value="rep-score" className="space-y-4">
            <Card className="border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                  <Input
                    type="date"
                    value={repScoreFrom}
                    onChange={(e) => setRepScoreFrom(e.target.value)}
                    className="border-border bg-muted/50 text-foreground mt-0.5 h-8 text-sm w-36"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                  <Input
                    type="date"
                    value={repScoreTo}
                    onChange={(e) => setRepScoreTo(e.target.value)}
                    className="border-border bg-muted/50 text-foreground mt-0.5 h-8 text-sm w-36"
                  />
                </div>
                <div className="min-w-[180px]">
                  <Label className="text-muted-foreground text-xs">Rep Name</Label>
                  <Select value={repScoreRepId} onValueChange={setRepScoreRepId}>
                    <SelectTrigger className="border-border bg-muted/50 mt-0.5 h-8 text-sm">
                      <SelectValue placeholder="All Reps" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Reps</SelectItem>
                      {repList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={fetchRepScore} disabled={repScoreLoading} className="gap-1.5">
                  {repScoreLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {t("common.search")}
                </Button>
                {repScoreData && (
                  <Button size="sm" variant="outline" onClick={exportRepScorePdf} className="gap-1.5 ml-auto">
                    <Printer className="h-3.5 w-3.5" />
                    {t("reports.exportPdf")}
                  </Button>
                )}
              </div>
            </Card>

            {repScoreLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : repScoreData ? (
              <Card className="border-border bg-card p-4">
                {/* Summary row */}
                <div className="mb-4 flex flex-wrap gap-4">
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Jobs Scored</p>
                    <p className="text-lg font-bold text-foreground">{repScoreData.count}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Total Score</p>
                    <p className="text-lg font-bold text-foreground">{repScoreData.totalScore}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Average Score</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{repScoreData.avgScore} / 100</p>
                  </div>
                </div>

                {repScoreData.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No scored jobs found for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs">Job Ref</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs text-right">Pax</TableHead>
                          <TableHead className="text-xs">Rep</TableHead>
                          <TableHead className="text-xs">Route</TableHead>
                          <TableHead className="text-xs">Hotel</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-center">Att<br /><span className="text-muted-foreground">20pt</span></TableHead>
                          <TableHead className="text-xs text-center">App<br /><span className="text-muted-foreground">15pt</span></TableHead>
                          <TableHead className="text-xs text-center">Work<br /><span className="text-muted-foreground">30pt</span></TableHead>
                          <TableHead className="text-xs text-center">Rev<br /><span className="text-muted-foreground">35pt</span></TableHead>
                          <TableHead className="text-xs text-right">Score</TableHead>
                          <TableHead className="text-xs">Evaluation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {repScoreData.rows.map((row, idx) => {
                          const evalColor =
                            row.evaluation === "Excellent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                            row.evaluation === "Good" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                            row.evaluation === "Average" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                            "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
                          return (
                            <TableRow
                              key={row.jobId}
                              className={idx % 2 === 0 ? "bg-muted/10" : ""}
                            >
                              <TableCell className="font-mono text-xs">{row.internalRef}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {row.serviceType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{row.paxCount}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.repName}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {(row.originAirport?.code || row.fromZone?.name || row.originZone?.name || row.originHotel?.name || "—")} → {(row.destinationAirport?.code || row.toZone?.name || row.destinationZone?.name || row.destinationHotel?.name || "—")}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{row.destinationHotel?.name || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-xs ${statusColors[row.status] || ""}`}>
                                  {row.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {row.attendance ? <span className="text-emerald-500 font-bold text-sm">✓</span> : <span className="text-muted-foreground text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.appearance ? <span className="text-emerald-500 font-bold text-sm">✓</span> : <span className="text-muted-foreground text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.work ? <span className="text-emerald-500 font-bold text-sm">✓</span> : <span className="text-muted-foreground text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                {row.review ? <span className="text-emerald-500 font-bold text-sm">✓</span> : <span className="text-muted-foreground text-sm">—</span>}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-sm">{row.total}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-xs ${evalColor}`}>
                                  {row.evaluation}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {/* Footer totals */}
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 px-1">
                      <span className="text-sm text-muted-foreground">
                        {repScoreData.count} job{repScoreData.count !== 1 ? "s" : ""} scored · Total {repScoreData.totalScore} pts
                      </span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        Average: {repScoreData.avgScore} / 100
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserCheck className="mb-2 h-8 w-8" />
                <p className="text-sm">Select a date range and click Search to view rep scores.</p>
              </div>
            )}

            {/* Hidden print content */}
            {repScoreData && (
              <div ref={repScorePrintRef} className="hidden">
                <h1>Rep Score Report</h1>
                <h2>Period: {repScoreFrom} to {repScoreTo}</h2>
                <dl className="info-grid">
                  <dt>Jobs Scored</dt><dd>{repScoreData.count}</dd>
                  <dt>Total Score</dt><dd>{repScoreData.totalScore}</dd>
                  <dt>Average Score</dt><dd>{repScoreData.avgScore} / 100</dd>
                </dl>
                <table>
                  <thead>
                    <tr>
                      <th>Job Ref</th><th>Type</th><th>Pax</th><th>Rep</th><th>Route</th><th>Hotel</th><th>Status</th>
                      <th>Att (20)</th><th>App (15)</th><th>Work (30)</th><th>Rev (35)</th><th>Score</th><th>Evaluation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repScoreData.rows.map((row) => (
                      <tr key={row.jobId}>
                        <td>{row.internalRef}</td>
                        <td>{row.serviceType}</td>
                        <td className="text-right">{row.paxCount}</td>
                        <td>{row.repName}</td>
                        <td>{(row.originAirport?.code || row.fromZone?.name || row.originZone?.name || row.originHotel?.name || "—")} → {(row.destinationAirport?.code || row.toZone?.name || row.destinationZone?.name || row.destinationHotel?.name || "—")}</td>
                        <td>{row.destinationHotel?.name || "—"}</td>
                        <td>{row.status}</td>
                        <td className="text-center">{row.attendance ? "✓" : "—"}</td>
                        <td className="text-center">{row.appearance ? "✓" : "—"}</td>
                        <td className="text-center">{row.work ? "✓" : "—"}</td>
                        <td className="text-center">{row.review ? "✓" : "—"}</td>
                        <td className="text-right">{row.total}</td>
                        <td>{row.evaluation}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan={11}>Average Score ({repScoreData.count} jobs)</td>
                      <td className="text-right">{repScoreData.avgScore}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        )}

        {/* ─── EVIDENCE REPORT ─── */}
        {canEvidence && (
          <TabsContent value="evidence" className="space-y-4">
            <Card className="border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                  <Input
                    type="date"
                    value={evidenceFrom}
                    onChange={(e) => setEvidenceFrom(e.target.value)}
                    className="mt-1 w-40 border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                  <Input
                    type="date"
                    value={evidenceTo}
                    onChange={(e) => setEvidenceTo(e.target.value)}
                    className="mt-1 w-40 border-border bg-card text-foreground"
                  />
                </div>
                <div className="min-w-[160px]">
                  <Label className="text-muted-foreground text-xs">{t("common.status")}</Label>
                  <Select value={evidenceStatusFilter} onValueChange={setEvidenceStatusFilter}>
                    <SelectTrigger className="mt-1 h-9 border-border bg-card text-foreground">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="ASSIGNED">Assigned</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="IN_PLACE">In Place</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="NO_SHOW">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[200px]">
                  <Label className="text-muted-foreground text-xs">Agent Name</Label>
                  <Select value={evidenceAgentId} onValueChange={setEvidenceAgentId}>
                    <SelectTrigger className="mt-1 h-9 border-border bg-card text-foreground">
                      <SelectValue placeholder="All Agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Agents</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.legalName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={fetchEvidenceReport} disabled={evidenceLoading} className="gap-1.5">
                  {evidenceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {t("reports.generate")}
                </Button>
              </div>
            </Card>

            {evidenceLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : evidenceData ? (
              <>
                <div className="flex gap-1.5 flex-wrap">
                  <StatCard label={t("reports.totalJobs")} value={evidenceData.totalJobs} />
                  <StatCard
                    label="With Evidence"
                    value={evidenceData.rows.filter((r) => r.hasEvidence).length}
                    color="text-emerald-600 dark:text-emerald-400"
                  />
                  <StatCard
                    label="No Evidence"
                    value={evidenceData.rows.filter((r) => !r.hasEvidence).length}
                    color="text-amber-600 dark:text-amber-400"
                  />
                </div>
                <div className="rounded-md border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                        <TableHead className="text-white text-xs">Job Ref</TableHead>
                        <TableHead className="text-white text-xs">Agent Name</TableHead>
                        <TableHead className="text-white text-xs">Agent Ref</TableHead>
                        <TableHead className="text-white text-xs">Date</TableHead>
                        <TableHead className="text-white text-xs">Type</TableHead>
                        <TableHead className="text-white text-xs">Status</TableHead>
                        <TableHead className="text-white text-xs">Evidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evidenceData.rows.map((row, idx) => {
                        const totalImages =
                          row.inPlaceEvidence.reduce((s, e) => s + e.imageUrls.length, 0) +
                          row.noShowEvidence.reduce((s, e) => s + e.imageUrls.length, 0) +
                          row.completedEvidence.reduce((s, e) => s + e.imageUrls.length, 0);
                        return (
                          <TableRow
                            key={row.jobId}
                            className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                          >
                            <TableCell className="font-mono text-sm text-foreground">{row.internalRef}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.agentName ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.agentRef ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(row.jobDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{row.serviceType}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${statusColors[row.status] || ""}`}>{row.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {row.hasEvidence ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 h-7 text-xs border-border text-foreground"
                                  onClick={() => generateEvidencePdf(row)}
                                >
                                  <Camera className="h-3 w-3" />
                                  {totalImages} photo{totalImages !== 1 ? "s" : ""}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {evidenceData.rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                            No jobs found for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Camera className="mb-2 h-8 w-8" />
                <p className="text-sm">Select filters and click Generate to view evidence report.</p>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ─── REP FEE DETAIL MODAL ─── */}
      <Dialog
        open={repModalOpen}
        onOpenChange={(open) => {
          setRepModalOpen(open);
          if (!open) setSelectedRep(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {selectedRep?.repName} &mdash; {repFeeDate}
            </DialogTitle>
          </DialogHeader>

          {selectedRep && (
            <div className="space-y-4 py-2">
              {groupByFlight(selectedRep.fees).map((group) => (
                <div key={`${group.flightNo}|${group.carrier}`}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Badge
                      variant="outline"
                      className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 font-mono"
                    >
                      {group.flightNo}
                    </Badge>
                    {group.carrier && (
                      <span className="text-xs text-muted-foreground">
                        {group.carrier}
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
                        <TableHead className="text-white text-xs">{t("reports.jobRef")}</TableHead>
                        <TableHead className="text-white text-xs">{t("jobs.type")}</TableHead>
                        <TableHead className="text-white text-xs text-right">
                          {t("dispatch.pax")}
                        </TableHead>
                        <TableHead className="text-white text-xs">Route</TableHead>
                        <TableHead className="text-white text-xs">{t("locations.hotel")}</TableHead>
                        <TableHead className="text-white text-xs">{t("common.status")}</TableHead>
                        <TableHead className="text-white text-xs text-center">Att<br/><span className="text-[10px] font-normal opacity-75">20pt</span></TableHead>
                        <TableHead className="text-white text-xs text-center">App<br/><span className="text-[10px] font-normal opacity-75">15pt</span></TableHead>
                        <TableHead className="text-white text-xs text-center">Work<br/><span className="text-[10px] font-normal opacity-75">30pt</span></TableHead>
                        <TableHead className="text-white text-xs text-center">Rev<br/><span className="text-[10px] font-normal opacity-75">35pt</span></TableHead>
                        <TableHead className="text-white text-xs text-right">Score</TableHead>
                        <TableHead className="text-white text-xs text-right">Fee</TableHead>
                        <TableHead className="text-white text-xs">Eval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.jobs.map((fee, idx) => {
                        const jobId = fee.trafficJob.id;
                        const isArr = fee.trafficJob.serviceType === "ARR";
                        const hasInPlace = !!fee.inPlaceEvidence;
                        const isCompleted = fee.repStatus === "COMPLETED" || fee.trafficJob.status === "COMPLETED";
                        const currentScore = scoreEdits[jobId] ?? fee.repJobScore;
                        const isSaving = scoreSaving[jobId] ?? false;

                        const toggleScore = (field: "attendance" | "appearance" | "work" | "review", enabled: boolean) => {
                          if (!enabled) return;
                          const base = currentScore ?? { attendance: false, appearance: false, work: false, review: false, total: null, fee: null, evaluation: null };
                          const next = { attendance: base.attendance, appearance: base.appearance, work: base.work, review: base.review, [field]: !base[field] };
                          saveRepScore(jobId, next);
                        };

                        const evalColor =
                          currentScore?.evaluation === "Excellent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                          currentScore?.evaluation === "Good" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                          currentScore?.evaluation === "Average" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                          currentScore?.evaluation === "Poor" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" : "";

                        return (
                          <TableRow
                            key={fee.id}
                            className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                          >
                            <TableCell className="text-foreground font-mono text-xs">
                              {fee.trafficJob.internalRef}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  isArr
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"
                                }
                              >
                                {fee.trafficJob.serviceType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {fee.trafficJob.paxCount}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {(fee.trafficJob.originAirport?.code || fee.trafficJob.fromZone?.name || fee.trafficJob.originZone?.name || fee.trafficJob.originHotel?.name || "\u2014")}{" \u2192 "}{(fee.trafficJob.destinationAirport?.code || fee.trafficJob.toZone?.name || fee.trafficJob.destinationZone?.name || fee.trafficJob.destinationHotel?.name || "\u2014")}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {fee.trafficJob.hotel?.name || "\u2014"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={statusColors[fee.status] || ""}
                              >
                                {fee.status}
                              </Badge>
                            </TableCell>
                            {/* Attendance — requires inPlaceEvidence */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={!hasInPlace || isSaving}
                                checked={currentScore?.attendance ?? false}
                                onChange={() => toggleScore("attendance", hasInPlace)}
                                title={hasInPlace ? "Attendance (20pt)" : "Requires In Place evidence"}
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Appearance — requires inPlaceEvidence */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={!hasInPlace || isSaving}
                                checked={currentScore?.appearance ?? false}
                                onChange={() => toggleScore("appearance", hasInPlace)}
                                title={hasInPlace ? "Appearance (15pt)" : "Requires In Place evidence"}
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Work — always enabled */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={isSaving}
                                checked={currentScore?.work ?? false}
                                onChange={() => toggleScore("work", true)}
                                title="Work (30pt)"
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Review — always enabled */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={isSaving}
                                checked={currentScore?.review ?? false}
                                onChange={() => toggleScore("review", true)}
                                title="Review (35pt)"
                                className="h-4 w-4 cursor-pointer accent-emerald-600"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin inline" />
                              ) : currentScore?.total !== undefined && currentScore.total !== null ? (
                                <span>{currentScore.total}</span>
                              ) : "\u2014"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {currentScore?.fee !== undefined && currentScore.fee !== null
                                ? `${currentScore.fee} EGP`
                                : "\u2014"}
                            </TableCell>
                            <TableCell>
                              {currentScore?.evaluation ? (
                                <Badge variant="outline" className={evalColor}>
                                  {currentScore.evaluation}
                                </Badge>
                              ) : "\u2014"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center border-t border-border pt-3 px-1">
                <span className="text-sm font-semibold text-foreground">
                  {t("common.total")} ({selectedRep.flightCount} {t("reports.flightsCount")})
                </span>
                <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                  {fmt(selectedRep.totalAmount, locale)} EGP
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden print content for PDF exports */}

      {/* Daily Dispatch Print */}
      {dispatchData && (
        <div ref={dispatchPrintRef} className="hidden">
          <h1>Daily Dispatch Summary</h1>
          <h2>Date: {dispatchDate}</h2>
          <dl className="info-grid">
            <dt>Total Jobs</dt><dd>{dispatchData.totalJobs}</dd>
            <dt>Assigned</dt><dd>{dispatchData.assignedCount} ({dispatchData.assignmentRate}%)</dd>
            <dt>Unassigned</dt><dd>{dispatchData.unassignedCount}</dd>
            <dt>Completion Rate</dt><dd>{dispatchData.completionRate}%</dd>
          </dl>
          <table>
            <thead>
              <tr><th>Ref</th><th>Type</th><th>Agent/Customer</th><th>Pax</th><th>Vehicle</th><th>Driver</th><th>Status</th></tr>
            </thead>
            <tbody>
              {dispatchData.jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.internalRef}</td>
                  <td>{job.serviceType}</td>
                  <td>{job.agent?.legalName || job.customer?.legalName || "\u2014"}</td>
                  <td className="text-right">{job.paxCount}</td>
                  <td>{job.assignment?.vehicle.plateNumber || "\u2014"}</td>
                  <td>{job.assignment?.driver?.name || "\u2014"}</td>
                  <td>{job.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver Trips Print */}
      {driverData && (
        <div ref={driverPrintRef} className="hidden">
          <h1>Driver Trip Report</h1>
          <h2>Period: {driverFrom} to {driverTo}</h2>
          <dl className="info-grid">
            <dt>Total Drivers</dt><dd>{driverData.totalDrivers}</dd>
            <dt>Total Trips</dt><dd>{driverData.totalTrips}</dd>
          </dl>
          <table>
            <thead>
              <tr><th>Driver</th><th>Mobile</th><th className="text-right">Trips</th><th className="text-right">Total Fees (EGP)</th></tr>
            </thead>
            <tbody>
              {driverData.drivers.map((d) => (
                <tr key={d.driver.id}>
                  <td>{d.driver.name}</td>
                  <td>{d.driver.mobileNumber}</td>
                  <td className="text-right">{d.tripCount}</td>
                  <td className="text-right">{fmt(d.totalFees, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent Statement Print */}
      {agentData && (
        <div ref={agentPrintRef} className="hidden">
          <h1>Agent Statement</h1>
          <h2>{agentData.agent.legalName} {agentData.agent.tradeName ? `(${agentData.agent.tradeName})` : ""}</h2>
          <dl className="info-grid">
            <dt>Period</dt><dd>{agentData.period.from} to {agentData.period.to}</dd>
            <dt>Jobs</dt><dd>{agentData.jobCount}</dd>
            <dt>Total Invoiced</dt><dd>{fmt(agentData.totalInvoiced, locale)} {agentData.agent.currency}</dd>
            <dt>Total Paid</dt><dd>{fmt(agentData.totalPaid, locale)} {agentData.agent.currency}</dd>
            <dt>Outstanding</dt><dd>{fmt(agentData.outstandingBalance, locale)} {agentData.agent.currency}</dd>
            {agentData.agent.creditLimit !== null && <><dt>Credit Limit</dt><dd>{fmt(agentData.agent.creditLimit, locale)}</dd></>}
            {agentData.agent.creditDays !== null && <><dt>Credit Days</dt><dd>{agentData.agent.creditDays}</dd></>}
          </dl>
          <table>
            <thead>
              <tr><th>Invoice #</th><th>Date</th><th>Due Date</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {agentData.invoices.map((inv) => (
                <tr key={inv.invoiceNumber}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{formatDate(inv.invoiceDate)}</td>
                  <td>{formatDate(inv.dueDate)}</td>
                  <td className="text-right">{fmt(inv.total, locale)}</td>
                  <td className="text-right">{fmt(inv.paid, locale)}</td>
                  <td className="text-right">{fmt(inv.balance, locale)}</td>
                  <td>{inv.status}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={3}>Totals</td>
                <td className="text-right">{fmt(agentData.totalInvoiced, locale)}</td>
                <td className="text-right">{fmt(agentData.totalPaid, locale)}</td>
                <td className="text-right">{fmt(agentData.outstandingBalance, locale)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue Print */}
      {revenueData && (
        <div ref={revenuePrintRef} className="hidden">
          <h1>Revenue Report</h1>
          <h2>Period: {revenueData.period.from} to {revenueData.period.to}</h2>
          <dl className="info-grid">
            <dt>Total Revenue</dt><dd>{fmt(revenueData.totalRevenue, locale)}</dd>
            <dt>Total Costs</dt><dd>{fmt(revenueData.totalCosts, locale)}</dd>
            <dt>Gross Profit</dt><dd>{fmt(revenueData.grossProfit, locale)}</dd>
            <dt>Profit Margin</dt><dd>{revenueData.profitMargin}%</dd>
            <dt>Driver Fees</dt><dd>{fmt(revenueData.costBreakdown.driverFees, locale)}</dd>
            <dt>Rep Fees</dt><dd>{fmt(revenueData.costBreakdown.repFees, locale)}</dd>
            <dt>Supplier Costs</dt><dd>{fmt(revenueData.costBreakdown.supplierCosts, locale)}</dd>
          </dl>
          <h3>Revenue by Agent</h3>
          <table>
            <thead>
              <tr><th>Agent / Customer</th><th className="text-right">Revenue</th><th className="text-right">Invoices</th><th className="text-right">Jobs</th></tr>
            </thead>
            <tbody>
              {revenueData.byAgent.map((a) => (
                <tr key={a.agentId}>
                  <td>{a.name}</td>
                  <td className="text-right">{fmt(a.revenue, locale)}</td>
                  <td className="text-right">{a.invoiceCount}</td>
                  <td className="text-right">{a.jobCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Revenue by Service Type</h3>
          <table>
            <thead><tr><th>Service Type</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {Object.entries(revenueData.byServiceType).map(([type, amount]) => (
                <tr key={type}><td>{type}</td><td className="text-right">{fmt(amount, locale)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vehicle Compliance Print */}
      {complianceData.length > 0 && (
        <div ref={compliancePrintRef} className="hidden">
          <h1>Vehicle Compliance Report</h1>
          <table>
            <thead>
              <tr><th>Plate</th><th>Type</th><th>Ownership</th><th>License Expiry</th><th>Insurance</th><th>Insurance Expiry</th><th className="text-right">Annual Payment</th><th className="text-right">Total Fees</th></tr>
            </thead>
            <tbody>
              {complianceData.map((v, idx) => (
                <tr key={v.vehicleId || idx}>
                  <td>{v.plateNumber}</td>
                  <td>{v.vehicleTypeName}</td>
                  <td>{v.ownership}</td>
                  <td>{v.licenseExpiryDate ? formatDate(v.licenseExpiryDate) : "\u2014"}</td>
                  <td>{v.hasInsurance ? "Yes" : "No"}</td>
                  <td>{v.insuranceExpiryDate ? formatDate(v.insuranceExpiryDate) : "\u2014"}</td>
                  <td className="text-right">{v.annualPayment != null ? fmt(Number(v.annualPayment)) : "\u2014"}</td>
                  <td className="text-right">{v.totalFees != null ? fmt(Number(v.totalFees)) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rep Fees Print */}
      {repFeeData && (
        <div ref={printRef} className="hidden">
          <h1>Rep Fees Report</h1>
          <h2>Date: {repFeeDate}</h2>
          <table>
            <thead>
              <tr>
                <th>Rep Name</th>
                <th className="text-right">Fee/Flight</th>
                <th className="text-right">Flights</th>
                <th className="text-right">Total (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {repFeeData.reps.map((rep) => (
                <tr key={rep.repId}>
                  <td>{rep.repName}</td>
                  <td className="text-right">{fmt(rep.feePerFlight, locale)}</td>
                  <td className="text-right">{rep.flightCount}</td>
                  <td className="text-right">{fmt(rep.totalAmount, locale)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Grand Total</td>
                <td />
                <td className="text-right">{repFeeData.totalFlights}</td>
                <td className="text-right">{fmt(repFeeData.grandTotal, locale)}</td>
              </tr>
            </tbody>
          </table>

          {repFeeData.reps.map((rep) => (
            <div key={rep.repId}>
              <h2>{rep.repName} - Details</h2>
              <table>
                <thead>
                  <tr>
                    <th>Flight No</th>
                    <th>Carrier</th>
                    <th>Job Ref</th>
                    <th className="text-right">Pax</th>
                    <th>Route</th>
                    <th>Hotel</th>
                    <th className="text-right">Fee (EGP)</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{fee.trafficJob.flight?.flightNo || "\u2014"}</td>
                      <td>{fee.trafficJob.flight?.carrier || "\u2014"}</td>
                      <td>{fee.trafficJob.internalRef}</td>
                      <td className="text-right">{fee.trafficJob.paxCount}</td>
                      <td>
                        {(fee.trafficJob.originAirport?.code || fee.trafficJob.fromZone?.name || fee.trafficJob.originZone?.name || fee.trafficJob.originHotel?.name || "\u2014")}{" \u2192 "}{(fee.trafficJob.destinationAirport?.code || fee.trafficJob.toZone?.name || fee.trafficJob.destinationZone?.name || fee.trafficJob.destinationHotel?.name || "\u2014")}
                      </td>
                      <td>{fee.trafficJob.hotel?.name || "\u2014"}</td>
                      <td className="text-right">{fmt(Number(fee.amount), locale)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={6}>Subtotal</td>
                    <td className="text-right">{fmt(rep.totalAmount, locale)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
