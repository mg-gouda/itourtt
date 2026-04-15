"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Car,
  Building2,
  DollarSign,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  Camera,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import JobDetailModal from "@/components/job-detail-modal";
import { SearchableCombobox } from "@/components/searchable-combobox";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { useColumnOrder } from "@/hooks/useColumnOrder";
import { DraggableTableHeader, type ColumnDef } from "@/components/ui/draggable-table-header";

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
      vehicle: { plateNumber: string; vehicleType: { name: string } } | null;
      driver: { name: string } | null;
      rep: { name: string } | null;
    } | null;
  }>;
}

interface DriverJobScore {
  attendance: boolean;
  appearance: boolean;
  carCleanliness: boolean;
  maintenance: boolean;
  work: boolean;
  total: number;
  evaluation: string;
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
    scoredCount: number;
    missingScores: number;
    avgScore: number | null;
    trips: Array<{
      jobId: string;
      internalRef: string;
      jobDate: string;
      serviceType: string;
      status: string;
      paxCount: number;
      route: string;
      agent: string;
      tripFee: number | null;
      tariffFee: number | null;
      driverJobScore: DriverJobScore | null;
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

interface DriverScoreRow {
  jobId: string;
  internalRef: string;
  jobDate: string;
  serviceType: string;
  paxCount: number;
  status: string;
  driverId: string;
  driverName: string;
  route: string;
  attendance: boolean;
  appearance: boolean;
  carCleanliness: boolean;
  maintenance: boolean;
  work: boolean;
  total: number;
  multiplier: number;
  feePercent: number;
  evaluation: string;
}

interface DriverScoreReport {
  from: string;
  to: string;
  rows: DriverScoreRow[];
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
    serviceType: string;
    time: string | null;
    priceAmount: number | null;
    priceCurrency: string | null;
    transferPrice: number | null;
    transferPriceCurrency: string | null;
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
  driverName: string | null;
  repName: string | null;
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

interface CarJobRow {
  id: string;
  jobRef: string;
  agentName: string;
  serviceDate: string;
  origin: string;
  destination: string;
  driver: string;
  jobStatus: string;
  plateNumber: string;
}

interface CarJobsReport {
  total: number;
  rows: CarJobRow[];
}

interface SupplierJobRow {
  id: string;
  jobRef: string;
  agentName: string;
  agentRef: string;
  serviceDate: string;
  route: string;
  supplierName: string;
  supplierStatus: string;
}

interface SupplierJobsReport {
  total: number;
  rows: SupplierJobRow[];
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


// ────────────────────────────────────────────
// Column definitions for draggable headers
// ────────────────────────────────────────────

const DISPATCH_COLUMNS: ColumnDef[] = [
  { key: "internalRef", label: "Ref" },
  { key: "serviceType", label: "Type" },
  { key: "agent", label: "Agent" },
  { key: "paxCount", label: "Pax" },
  { key: "vehicle", label: "Vehicle" },
  { key: "driver", label: "Driver" },
  { key: "status", label: "Status" },
];
const DISPATCH_DEFAULT_KEYS = DISPATCH_COLUMNS.map((c) => c.key);

const DRIVERS_COLUMNS: ColumnDef[] = [
  { key: "driverName", label: "Driver" },
  { key: "mobile", label: "Mobile" },
  { key: "trips", label: "Trips", className: "text-right" },
  { key: "avgScore", label: "Avg Score", className: "text-right" },
  { key: "missing", label: "Missing", className: "text-right" },
  { key: "totalFees", label: "Total Fees", className: "text-right" },
];
const DRIVERS_DEFAULT_KEYS = DRIVERS_COLUMNS.map((c) => c.key);

const DRIVER_SCORE_COLUMNS: ColumnDef[] = [
  { key: "internalRef", label: "Job Ref" },
  { key: "jobDate", label: "Date" },
  { key: "serviceType", label: "Type" },
  { key: "paxCount", label: "Pax", className: "text-right" },
  { key: "driverName", label: "Driver" },
  { key: "route", label: "Route" },
  { key: "status", label: "Status" },
  { key: "attendance", label: <>Att<br /><span className="text-muted-foreground">30pt</span></>, className: "text-center" },
  { key: "appearance", label: <>App<br /><span className="text-muted-foreground">20pt</span></>, className: "text-center" },
  { key: "carCleanliness", label: <>Car<br /><span className="text-muted-foreground">10pt</span></>, className: "text-center" },
  { key: "maintenance", label: <>Maint<br /><span className="text-muted-foreground">10pt</span></>, className: "text-center" },
  { key: "work", label: <>Work<br /><span className="text-muted-foreground">30pt</span></>, className: "text-center" },
  { key: "total", label: "Score", className: "text-right" },
  { key: "feePercent", label: "Fee %", className: "text-right" },
  { key: "evaluation", label: "Evaluation" },
];
const DRIVER_SCORE_DEFAULT_KEYS = DRIVER_SCORE_COLUMNS.map((c) => c.key);

const AGENT_COLUMNS: ColumnDef[] = [
  { key: "invoiceNumber", label: "Invoice No" },
  { key: "invoiceDate", label: "Date" },
  { key: "dueDate", label: "Due Date" },
  { key: "total", label: "Total", className: "text-right" },
  { key: "paid", label: "Paid", className: "text-right" },
  { key: "balance", label: "Balance", className: "text-right" },
  { key: "status", label: "Status" },
];
const AGENT_DEFAULT_KEYS = AGENT_COLUMNS.map((c) => c.key);

const REP_FEES_COLUMNS: ColumnDef[] = [
  { key: "repName", label: "Rep Name" },
  { key: "feePerFlight", label: "Fee/Flight", className: "text-right" },
  { key: "flightCount", label: "Flights", className: "text-right" },
  { key: "totalAmount", label: "Total", className: "text-right" },
];
const REP_FEES_DEFAULT_KEYS = REP_FEES_COLUMNS.map((c) => c.key);

const REP_SCORE_COLUMNS: ColumnDef[] = [
  { key: "internalRef", label: "Job Ref" },
  { key: "serviceType", label: "Type" },
  { key: "paxCount", label: "Pax", className: "text-right" },
  { key: "repName", label: "Rep" },
  { key: "route", label: "Route" },
  { key: "hotel", label: "Hotel" },
  { key: "status", label: "Status" },
  { key: "attendance", label: <>Att<br /><span className="text-muted-foreground">20pt</span></>, className: "text-center" },
  { key: "appearance", label: <>App<br /><span className="text-muted-foreground">15pt</span></>, className: "text-center" },
  { key: "work", label: <>Work<br /><span className="text-muted-foreground">30pt</span></>, className: "text-center" },
  { key: "review", label: <>Rev<br /><span className="text-muted-foreground">35pt</span></>, className: "text-center" },
  { key: "total", label: "Score", className: "text-right" },
  { key: "evaluation", label: "Evaluation" },
];
const REP_SCORE_DEFAULT_KEYS = REP_SCORE_COLUMNS.map((c) => c.key);

const REVENUE_COLUMNS: ColumnDef[] = [
  { key: "agentName", label: "Agent" },
  { key: "revenue", label: "Revenue", className: "text-right" },
  { key: "invoiceCount", label: "Invoices", className: "text-right" },
  { key: "jobCount", label: "Jobs", className: "text-right" },
];
const REVENUE_DEFAULT_KEYS = REVENUE_COLUMNS.map((c) => c.key);

const COMPLIANCE_COLUMNS: ColumnDef[] = [
  { key: "plateNumber", label: "Plate Number" },
  { key: "vehicleTypeName", label: "Type" },
  { key: "ownership", label: "Ownership" },
  { key: "licenseExpiryDate", label: "License Expiry" },
  { key: "insurance", label: "Insurance" },
  { key: "temporaryPermitDate", label: "Permit Date" },
  { key: "permitExpiry", label: "Permit Expiry" },
  { key: "annualPayment", label: "Annual Payment" },
  { key: "registrationFees", label: "Reg. Fees" },
  { key: "totalFees", label: "Total Fees" },
  { key: "depositTotal", label: "Deposits" },
  { key: "balanceRemaining", label: "Balance" },
];
const COMPLIANCE_DEFAULT_KEYS = COMPLIANCE_COLUMNS.map((c) => c.key);

const JOB_STATUS_COLUMNS: ColumnDef[] = [
  { key: "internalRef", label: "TRSF Ref" },
  { key: "agentRef", label: "Agent Ref" },
  { key: "agentName", label: "Agent Name" },
  { key: "serviceDate", label: "Service Date" },
  { key: "serviceType", label: "Type" },
  { key: "time", label: "Time" },
  { key: "driverName", label: "Driver" },
  { key: "repName", label: "Rep" },
  { key: "priceAmount", label: "Price", className: "text-right" },
  { key: "status", label: "Status" },
  { key: "repJobStatus", label: "Rep Status" },
  { key: "driverJobStatus", label: "Driver Status" },
  { key: "evidence", label: "Evidence" },
];
const JOB_STATUS_DEFAULT_KEYS = JOB_STATUS_COLUMNS.map((c) => c.key);

const EVIDENCE_COLUMNS: ColumnDef[] = [
  { key: "internalRef", label: "Job Ref" },
  { key: "agentName", label: "Agent Name" },
  { key: "agentRef", label: "Agent Ref" },
  { key: "jobDate", label: "Date" },
  { key: "serviceType", label: "Type" },
  { key: "status", label: "Status" },
  { key: "repName", label: "Rep" },
  { key: "driverName", label: "Driver" },
  { key: "evidence", label: "Evidence" },
];
const EVIDENCE_DEFAULT_KEYS = EVIDENCE_COLUMNS.map((c) => c.key);

const SUPPLIER_JOBS_COLUMNS: ColumnDef[] = [
  { key: "jobRef", label: "Job Ref" },
  { key: "agentName", label: "Agent Name" },
  { key: "agentRef", label: "Agent Ref" },
  { key: "serviceDate", label: "Service Date" },
  { key: "route", label: "Route" },
  { key: "supplierName", label: "Supplier" },
  { key: "supplierStatus", label: "Supplier Status" },
];
const SUPPLIER_JOBS_DEFAULT_KEYS = SUPPLIER_JOBS_COLUMNS.map((c) => c.key);

const CAR_JOBS_COLUMNS: ColumnDef[] = [
  { key: "jobRef", label: "Job Ref" },
  { key: "agentName", label: "Agent Name" },
  { key: "serviceDate", label: "Service Date" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "plateNumber", label: "Vehicle" },
  { key: "driver", label: "Driver" },
  { key: "jobStatus", label: "Job Status" },
];
const CAR_JOBS_DEFAULT_KEYS = CAR_JOBS_COLUMNS.map((c) => c.key);

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
  const canSupplierJobs = usePermission("reports.supplierJobs");
  const canCarJobs = usePermission("reports.carJobs");

  // Daily Dispatch
  const [dispatchDate, setDispatchDate] = useState(today);
  const [dispatchData, setDispatchData] = useState<DispatchSummary | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Driver Trips
  const [driverFrom, setDriverFrom] = useState(thirtyDaysAgo);
  const [driverTo, setDriverTo] = useState(today);
  const [driverData, setDriverData] = useState<DriverTripReport | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverTripReport["drivers"][number] | null>(null);
  const [driverMissedJobs, setDriverMissedJobs] = useState<Record<string, boolean>>({});
  const [driverDeductions, setDriverDeductions] = useState<Record<string, number>>({});
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverScoreEdits, setDriverScoreEdits] = useState<Record<string, DriverJobScore>>({});
  const [driverScoreSaving, setDriverScoreSaving] = useState<Record<string, boolean>>({});

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
  const [repFeeFrom, setRepFeeFrom] = useState(today);
  const [repFeeTo, setRepFeeTo] = useState(today);
  const [repFeeData, setRepFeeData] = useState<RepFeeReport | null>(null);
  const [repFeeLoading, setRepFeeLoading] = useState(false);
  const [selectedRep, setSelectedRep] = useState<RepFeeReportRep | null>(null);
  const [repModalOpen, setRepModalOpen] = useState(false);
  // scoreEdits: jobId → { attendance, appearance, work, review }
  const [scoreEdits, setScoreEdits] = useState<Record<string, RepJobScore>>({});
  const [scoreSaving, setScoreSaving] = useState<Record<string, boolean>>({});
  // missedJobs: jobId → true when rep missed the job (disables score checkboxes)
  const [missedJobs, setMissedJobs] = useState<Record<string, boolean>>({});
  // deductions: jobId → amount deducted from rep for missing a job
  const [deductions, setDeductions] = useState<Record<string, number>>({});
  // repNetTotals: repId → final computed net total (overrides server totalAmount in the list)
  const [repNetTotals, setRepNetTotals] = useState<Record<string, number>>({});
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
  const [jobStatusRepId, setJobStatusRepId] = useState("ALL");
  const [jobStatusRepStatus, setJobStatusRepStatus] = useState("ALL");
  const [jobStatusDriverStatus, setJobStatusDriverStatus] = useState("ALL");
  const [jobStatusData, setJobStatusData] = useState<JobStatusReport | null>(null);
  const [jobStatusLoading, setJobStatusLoading] = useState(false);
  const jobStatusPrintRef = useRef<HTMLDivElement>(null);
  const [jobDetailId, setJobDetailId] = useState<string | null>(null);
  const [evidencePdfLoading, setEvidencePdfLoading] = useState<Set<string>>(new Set());

  // Rep Score
  const [repScoreFrom, setRepScoreFrom] = useState(thirtyDaysAgo);
  const [repScoreTo, setRepScoreTo] = useState(today);
  const [repScoreRepId, setRepScoreRepId] = useState("ALL");
  const [repList, setRepList] = useState<Array<{ id: string; name: string }>>([]);
  const [repScoreData, setRepScoreData] = useState<RepScoreReport | null>(null);
  const [repScoreLoading, setRepScoreLoading] = useState(false);
  const repScorePrintRef = useRef<HTMLDivElement>(null);

  // Driver Score
  const [driverScoreFrom, setDriverScoreFrom] = useState(thirtyDaysAgo);
  const [driverScoreTo, setDriverScoreTo] = useState(today);
  const [driverScoreDriverId, setDriverScoreDriverId] = useState("ALL");
  const [driverScoreData, setDriverScoreData] = useState<DriverScoreReport | null>(null);
  const [driverScoreLoading, setDriverScoreLoading] = useState(false);
  const driverScorePrintRef = useRef<HTMLDivElement>(null);

  // Car Jobs Report
  const [carJobsFrom, setCarJobsFrom] = useState(thirtyDaysAgo);
  const [carJobsTo, setCarJobsTo] = useState(today);
  const [carJobsVehicleId, setCarJobsVehicleId] = useState("ALL");
  const [carJobsData, setCarJobsData] = useState<CarJobsReport | null>(null);
  const [carJobsLoading, setCarJobsLoading] = useState(false);
  const [ownedVehicleList, setOwnedVehicleList] = useState<Array<{ id: string; plateNumber: string }>>([]);
  const carJobsPrintRef = useRef<HTMLDivElement>(null);

  // Supplier Jobs Report
  const [supplierJobsFrom, setSupplierJobsFrom] = useState(thirtyDaysAgo);
  const [supplierJobsTo, setSupplierJobsTo] = useState(today);
  const [supplierJobsSupplierId, setSupplierJobsSupplierId] = useState("ALL");
  const [supplierJobsStatus, setSupplierJobsStatus] = useState("ALL");
  const [supplierJobsData, setSupplierJobsData] = useState<SupplierJobsReport | null>(null);
  const [supplierJobsLoading, setSupplierJobsLoading] = useState(false);
  const [supplierList, setSupplierList] = useState<Array<{ id: string; name: string }>>([]);
  const supplierJobsPrintRef = useRef<HTMLDivElement>(null);

  // Evidence Report
  const [evidenceFrom, setEvidenceFrom] = useState(thirtyDaysAgo);
  const [evidenceTo, setEvidenceTo] = useState(today);
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState("ALL");
  const [evidenceAgentId, setEvidenceAgentId] = useState("ALL");
  const [evidenceRepId, setEvidenceRepId] = useState("ALL");
  const [evidenceDriverId, setEvidenceDriverId] = useState("ALL");
  const [driverList, setDriverList] = useState<Array<{ id: string; name: string }>>([]);
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
  const supplierJobsSort = useSortable(supplierJobsData?.rows || []);
  const carJobsSort = useSortable(carJobsData?.rows || []);

  // Column order hooks for drag-and-drop reordering
  const dispatchColOrder = useColumnOrder("dispatch", DISPATCH_DEFAULT_KEYS);
  const driversColOrder = useColumnOrder("drivers", DRIVERS_DEFAULT_KEYS);
  const driverScoreColOrder = useColumnOrder("driver_score", DRIVER_SCORE_DEFAULT_KEYS);
  const agentColOrder = useColumnOrder("agent_statement", AGENT_DEFAULT_KEYS);
  const repFeesColOrder = useColumnOrder("rep_fees", REP_FEES_DEFAULT_KEYS);
  const repScoreColOrder = useColumnOrder("rep_score", REP_SCORE_DEFAULT_KEYS);
  const revenueColOrder = useColumnOrder("revenue", REVENUE_DEFAULT_KEYS);
  const complianceColOrder = useColumnOrder("compliance", COMPLIANCE_DEFAULT_KEYS);
  const jobStatusColOrder = useColumnOrder("job_status", JOB_STATUS_DEFAULT_KEYS);
  const evidenceColOrder = useColumnOrder("evidence", EVIDENCE_DEFAULT_KEYS);
  const supplierJobsColOrder = useColumnOrder("supplier_jobs", SUPPLIER_JOBS_DEFAULT_KEYS);
  const carJobsColOrder = useColumnOrder("car_jobs", CAR_JOBS_DEFAULT_KEYS);

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

  // Load owned active vehicles for car jobs filter
  useEffect(() => {
    api
      .get("/export/odoo/car-jobs/vehicles")
      .then(({ data }) => {
        const list: Array<{ id: string; plateNumber: string }> =
          Array.isArray(data) ? data : data.data || [];
        setOwnedVehicleList(list);
      })
      .catch(() => {});
  }, []);

  // Load suppliers list for supplier jobs filter
  useEffect(() => {
    api
      .get("/suppliers?limit=500")
      .then(({ data }) => {
        const list: Array<{ id: string; tradeName?: string; legalName?: string }> =
          Array.isArray(data) ? data : data.data || [];
        setSupplierList(
          list.map((s) => ({ id: s.id, name: s.tradeName ?? s.legalName ?? s.id }))
        );
      })
      .catch(() => {});
  }, []);

  // Load drivers list for evidence report filter
  useEffect(() => {
    api
      .get("/drivers?limit=500&isActive=true")
      .then(({ data }) => {
        const list: Array<{ id: string; name: string }> = Array.isArray(data) ? data : data.data || [];
        setDriverList(list.map((d) => ({ id: d.id, name: d.name })));
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

  const recalculateDriverFees = async () => {
    setRecalcLoading(true);
    try {
      const { data } = await api.post(`/traffic-jobs/recalculate-driver-fees`, {
        from: driverFrom,
        to: driverTo,
      });
      const result = data.data || data;
      toast.success(`Fees recalculated: ${result.created} created, ${result.skipped} skipped`);
      await fetchDriverTrips();
    } catch {
      toast.error("Failed to recalculate driver fees");
    } finally {
      setRecalcLoading(false);
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
        `/reports/rep-fees?from=${repFeeFrom}&to=${repFeeTo}`
      );
      setRepFeeData(data.data || data);
      // Reset per-rep overrides whenever a fresh report is loaded
      setMissedJobs({});
      setDeductions({});
      setRepNetTotals({});
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

  const saveDriverScore = async (
    jobId: string,
    score: { attendance: boolean; appearance: boolean; carCleanliness: boolean; maintenance: boolean; work: boolean },
  ) => {
    setDriverScoreSaving((s) => ({ ...s, [jobId]: true }));
    try {
      await api.put(`/reports/driver-score/${jobId}`, score);
      const total =
        (score.attendance ? 30 : 0) +
        (score.appearance ? 20 : 0) +
        (score.carCleanliness ? 10 : 0) +
        (score.maintenance ? 10 : 0) +
        (score.work ? 20 : 0);
      let evaluation = "Poor";
      if (total >= 81) evaluation = "Excellent";
      else if (total >= 63) evaluation = "Good";
      else if (total >= 45) evaluation = "Average";
      const newScore: DriverJobScore = { ...score, total, evaluation };
      setDriverScoreEdits((s) => ({ ...s, [jobId]: newScore }));
      // Patch driverData so the modal stays in sync
      setDriverData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          drivers: prev.drivers.map((d) => ({
            ...d,
            trips: d.trips.map((t) =>
              t.jobId === jobId ? { ...t, driverJobScore: newScore } : t,
            ),
          })),
        };
      });
    } catch {
      toast.error("Failed to save driver score");
    } finally {
      setDriverScoreSaving((s) => ({ ...s, [jobId]: false }));
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
      const repParam = jobStatusRepId !== "ALL" ? `&repId=${jobStatusRepId}` : "";
      const repStatusParam = jobStatusRepStatus !== "ALL" ? `&repStatus=${jobStatusRepStatus}` : "";
      const driverStatusParam = jobStatusDriverStatus !== "ALL" ? `&driverStatus=${jobStatusDriverStatus}` : "";
      const { data } = await api.get(
        `/reports/job-status?from=${jobStatusFrom}&to=${jobStatusTo}${statusParam}${repParam}${repStatusParam}${driverStatusParam}`
      );
      setJobStatusData(data.data || data);
    } catch {
      toast.error(t("reports.failedJobStatus"));
    } finally {
      setJobStatusLoading(false);
    }
  };

  const exportJobStatusPdf = () => printFromRef(jobStatusPrintRef, `Job Status Report - ${jobStatusFrom} to ${jobStatusTo}`);

  const fetchCarJobs = async () => {
    setCarJobsLoading(true);
    try {
      const params = new URLSearchParams({ from: carJobsFrom, to: carJobsTo });
      if (carJobsVehicleId !== "ALL") params.set("vehicleId", carJobsVehicleId);
      const { data } = await api.get(`/export/odoo/car-jobs?${params.toString()}`);
      setCarJobsData(data.data ?? data);
    } catch {
      toast.error("Failed to load car jobs report");
    } finally {
      setCarJobsLoading(false);
    }
  };

  const exportCarJobsPdf = () =>
    printFromRef(carJobsPrintRef, `Car Jobs - ${carJobsFrom} to ${carJobsTo}`);

  const fetchSupplierJobs = async () => {
    setSupplierJobsLoading(true);
    try {
      const params = new URLSearchParams({ from: supplierJobsFrom, to: supplierJobsTo });
      if (supplierJobsSupplierId !== "ALL") params.set("supplierId", supplierJobsSupplierId);
      if (supplierJobsStatus !== "ALL") params.set("supplierStatus", supplierJobsStatus);
      const { data } = await api.get(`/export/odoo/supplier-jobs?${params.toString()}`);
      setSupplierJobsData(data.data ?? data);
    } catch {
      toast.error("Failed to load supplier jobs report");
    } finally {
      setSupplierJobsLoading(false);
    }
  };

  const exportSupplierJobsPdf = () =>
    printFromRef(supplierJobsPrintRef, `Supplier Jobs - ${supplierJobsFrom} to ${supplierJobsTo}`);

  const openEvidenceHtml = async (jobId: string, ref: string) => {
    setEvidencePdfLoading((prev) => new Set(prev).add(jobId));
    try {
      const { data } = await api.get(`/export/odoo/evidence-data/${jobId}`);
      const ev = data.data ?? data;

      // Fetch all images in parallel and convert to data URIs.
      // imageUrls can be either a Drive file ID or a legacy local path (/uploads/...).
      // Local paths are served as static files by the backend — they cannot be routed
      // through evidence-file/:fileId because the path contains slashes that break
      // Express route matching (/:param only matches a single segment).
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
      const allUrls: string[] = [
        ...ev.evidence.noShow.flatMap((e: any) => e.imageUrls),
        ...ev.evidence.inPlace.flatMap((e: any) => e.imageUrls),
        ...ev.evidence.completed.flatMap((e: any) => e.imageUrls),
      ];
      const dataUriMap: Record<string, string> = {};
      await Promise.all(
        allUrls.map(async (url: string) => {
          try {
            let blob: Blob;
            if (url.startsWith("/uploads/")) {
              // Legacy local file — fetch directly from backend static server (no auth required)
              const res = await fetch(`${API_BASE}${url}`);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              blob = await res.blob();
            } else {
              // Google Drive file ID — use authenticated proxy
              const imgRes = await api.get(`/export/odoo/evidence-file/${url}`, { responseType: "blob" });
              blob = imgRes.data;
            }
            dataUriMap[url] = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch { /* skip broken images */ }
        })
      );

      const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) : "—";
      const j = ev.job;

      const evidenceSection = (label: string, items: any[]) => {
        if (!items.length) return "";
        return `
          <div class="section-title">${label}</div>
          ${items.map((e: any) => `
            <div class="evidence-block">
              <div class="meta">Submitted by: ${e.submittedBy || "—"} &nbsp;|&nbsp; ${fmtDate(e.createdAt)}
                ${e.gpsMapLink ? ` &nbsp;|&nbsp; <a href="${e.gpsMapLink}" target="_blank">GPS</a>` : ""}
              </div>
              <div class="img-grid">
                ${(e.imageUrls || []).map((id: string) =>
                  dataUriMap[id]
                    ? `<img src="${dataUriMap[id]}" alt="evidence" />`
                    : `<div class="img-placeholder">Image unavailable</div>`
                ).join("")}
              </div>
            </div>
          `).join("")}`;
      };

      const logoHtml = ev.logoUrl
        ? `<img src="${ev.logoUrl}" alt="Logo" style="height:48px;max-width:160px;object-fit:contain;" />`
        : `<span style="font-size:18px;font-weight:700;">${ev.companyName}</span>`;

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Evidence — ${j.internalRef}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;padding:24px;color:#111;font-size:13px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:20px}
  .header-title{font-size:18px;font-weight:700;text-align:center;flex:1}
  h2{font-size:14px;font-weight:700;margin-bottom:10px;color:#333}
  .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 16px;margin-bottom:16px;padding:12px;background:#f8f8f8;border-radius:6px}
  .info-item dt{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px}
  .info-item dd{font-size:12px;font-weight:600;margin-top:2px}
  .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;background:#eee;border-radius:4px;margin:16px 0 8px}
  .evidence-block{margin-bottom:14px}
  .meta{font-size:10px;color:#555;padding:4px 0;border-bottom:1px solid #eee;margin-bottom:8px}
  .img-grid{display:flex;flex-wrap:wrap;gap:8px}
  .img-grid img{width:200px;height:140px;object-fit:cover;border-radius:4px;border:1px solid #ddd}
  .img-placeholder{width:200px;height:140px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#999}
  .footer{margin-top:32px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#666;display:flex;justify-content:space-between}
  @media print{body{padding:0}.footer{position:fixed;bottom:16px;left:24px;right:24px}}
</style>
</head><body>
<div class="header">
  <div style="width:160px">${logoHtml}</div>
  <div class="header-title">Job Evidence Report</div>
  <div style="width:160px;text-align:right;font-size:11px;color:#555">${j.internalRef}</div>
</div>
<h2>Job Details</h2>
<div class="info-grid">
  <div class="info-item"><dt>Internal Ref</dt><dd>${j.internalRef}</dd></div>
  <div class="info-item"><dt>Agent Ref</dt><dd>${j.agentRef || "—"}</dd></div>
  <div class="info-item"><dt>Service Type</dt><dd>${j.serviceType}</dd></div>
  <div class="info-item"><dt>Status</dt><dd>${j.status}</dd></div>
  <div class="info-item"><dt>Pax</dt><dd>${j.paxCount}</dd></div>
  <div class="info-item"><dt>Date</dt><dd>${fmtDate(j.jobDate)}</dd></div>
  <div class="info-item"><dt>Agent</dt><dd>${j.agentName || "—"}</dd></div>
  <div class="info-item"><dt>From</dt><dd>${j.route.fromZone || j.route.originAirport || j.route.originHotel || "—"}</dd></div>
  <div class="info-item"><dt>To</dt><dd>${j.route.toZone || j.route.destinationAirport || j.route.destinationHotel || "—"}</dd></div>
  ${j.flight ? `<div class="info-item"><dt>Flight</dt><dd>${j.flight.flightNo || "—"}${j.flight.carrier ? ` (${j.flight.carrier})` : ""}</dd></div>` : ""}
  ${j.assignment?.vehicle ? `<div class="info-item"><dt>Vehicle</dt><dd>${j.assignment.vehicle.plateNumber} (${j.assignment.vehicle.vehicleType})</dd></div>` : ""}
  ${j.assignment?.driver ? `<div class="info-item"><dt>Driver</dt><dd>${j.assignment.driver.name}</dd></div>` : ""}
  ${j.assignment?.rep ? `<div class="info-item"><dt>Rep</dt><dd>${j.assignment.rep.name}</dd></div>` : ""}
</div>
${evidenceSection("In-Place Evidence", ev.evidence.inPlace)}
${evidenceSection("Completed Evidence", ev.evidence.completed)}
${evidenceSection("No-Show Evidence", ev.evidence.noShow)}
${(!ev.evidence.inPlace.length && !ev.evidence.completed.length && !ev.evidence.noShow.length)
  ? '<p style="color:#999;font-size:12px;padding:20px 0">No evidence submitted for this job.</p>'
  : ""}
<div class="footer">
  <span>Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Cairo" })}</span>
  <span>${ev.companyName}</span>
</div>
</body></html>`;

      const win = window.open("", "_blank");
      if (!win) { toast.error(t("reports.allowPopups")); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
      // Delay print until images are decoded (they're data URIs so load is near-instant)
      win.onload = () => win.print();
      setTimeout(() => { try { win.print(); } catch { /* already triggered */ } }, 500);
    } catch {
      toast.error("Failed to generate evidence report");
    } finally {
      setEvidencePdfLoading((prev) => { const s = new Set(prev); s.delete(jobId); return s; });
    }
  };

  const downloadDriverEvidencePdf = (job: JobStatusReport["jobs"][number]) =>
    openEvidenceHtml(job.id, job.internalRef);

  const fetchEvidenceReport = async () => {
    setEvidenceLoading(true);
    try {
      const statusParam = evidenceStatusFilter !== "ALL" ? `&status=${evidenceStatusFilter}` : "";
      const agentParam = evidenceAgentId !== "ALL" ? `&agentId=${evidenceAgentId}` : "";
      const repParam = evidenceRepId !== "ALL" ? `&repId=${evidenceRepId}` : "";
      const driverParam = evidenceDriverId !== "ALL" ? `&driverId=${evidenceDriverId}` : "";
      const { data } = await api.get(
        `/reports/evidence?from=${evidenceFrom}&to=${evidenceTo}${statusParam}${agentParam}${repParam}${driverParam}`
      );
      setEvidenceData(data.data || data);
    } catch {
      toast.error("Failed to load evidence report");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const generateEvidencePdf = (row: EvidenceReportRow) =>
    openEvidenceHtml(row.jobId, row.internalRef);

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

  const fetchDriverScore = async () => {
    setDriverScoreLoading(true);
    try {
      const driverParam = driverScoreDriverId !== "ALL" ? `&driverId=${driverScoreDriverId}` : "";
      const { data } = await api.get(
        `/reports/driver-score?from=${driverScoreFrom}&to=${driverScoreTo}${driverParam}`
      );
      setDriverScoreData(data.data || data);
    } catch {
      toast.error("Failed to load driver score report");
    } finally {
      setDriverScoreLoading(false);
    }
  };

  const exportDriverScorePdf = () => printFromRef(driverScorePrintRef, `Driver Score Report - ${driverScoreFrom} to ${driverScoreTo}`);

  const exportRepFeesExcel = async () => {
    try {
      const res = await api.get(
        `/export/odoo/rep-fees?from=${repFeeFrom}&to=${repFeeTo}`,
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `rep_fees_${repFeeFrom}_to_${repFeeTo}.xlsx`);
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
      <html><head><title>Rep Fees Report - ${repFeeFrom} to ${repFeeTo}</title>
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
        <div class="report-title">Rep Fees Report - ${repFeeFrom} to ${repFeeTo}</div>
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

  // Compute final net total for a rep using current scoreEdits / missedJobs / deductions
  function computeRepNet(fees: RepFeeReportRep["fees"]): number {
    const gross = fees.reduce((sum, fee) => {
      const jobId = fee.trafficJob.id;
      if (missedJobs[jobId]) return sum;
      const score = scoreEdits[jobId] ?? fee.repJobScore;
      const feeAmt = fee.trafficJob.serviceType === "ARR"
        ? (score?.fee ?? fee.amount)
        : fee.amount;
      return sum + (Number(feeAmt) || 0);
    }, 0);
    const relevantJobIds = new Set(fees.map((f) => f.trafficJob.id));
    const totalDeductions = Object.entries(deductions)
      .filter(([k]) => relevantJobIds.has(k))
      .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    return gross - totalDeductions;
  }

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
        canEvidence ? "evidence" :
        canSupplierJobs ? "supplier-jobs" :
        canCarJobs ? "car-jobs" : "dispatch"
      } className="space-y-4">
        <TabsList className="bg-card border border-border overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-nowrap">
          {canDailyDispatch && (
            <TabsTrigger
              value="dispatch"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t("reports.dailyDispatch")}
            </TabsTrigger>
          )}
          {canDriverTrips && (
            <TabsTrigger
              value="drivers"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Car className="h-3.5 w-3.5" />
              {t("reports.driverTrips")}
            </TabsTrigger>
          )}
          {canDriverTrips && (
            <TabsTrigger
              value="driver-score"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Car className="h-3.5 w-3.5" />
              Driver Score
            </TabsTrigger>
          )}
          {canAgentStatement && (
            <TabsTrigger
              value="agent"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Building2 className="h-3.5 w-3.5" />
              {t("reports.agentStatement")}
            </TabsTrigger>
          )}
          {canRepFees && (
            <TabsTrigger
              value="rep-fees"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <UserCheck className="h-3.5 w-3.5" />
              {t("reports.repFees")}
            </TabsTrigger>
          )}
          {canRepFees && (
            <TabsTrigger
              value="rep-score"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Rep Score
            </TabsTrigger>
          )}
          {canRevenue && (
            <TabsTrigger
              value="revenue"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <DollarSign className="h-3.5 w-3.5" />
              {t("reports.revenue")}
            </TabsTrigger>
          )}
          {canVehicleCompliance && (
            <TabsTrigger
              value="compliance"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("reports.vehicleCompliance")}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="job-status"
            className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {t("reports.jobStatus")}
          </TabsTrigger>
          {canEvidence && (
            <TabsTrigger
              value="evidence"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Camera className="h-3.5 w-3.5" />
              Evidence
            </TabsTrigger>
          )}
          {canSupplierJobs && (
            <TabsTrigger
              value="supplier-jobs"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Truck className="h-3.5 w-3.5" />
              Supplier Jobs
            </TabsTrigger>
          )}
          {canCarJobs && (
            <TabsTrigger
              value="car-jobs"
              className="gap-1.5 whitespace-nowrap data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
            >
              <Car className="h-3.5 w-3.5" />
              Car Jobs
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
                  <DraggableTableHeader
                    columns={DISPATCH_COLUMNS}
                    columnOrder={dispatchColOrder.columns}
                    onReorder={dispatchColOrder.reorder}
                  />
                  <TableBody>
                    {dispatchSort.sortedData.map((job, idx) => (
                      <TableRow
                        key={job.id}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        {dispatchColOrder.columns.map((col) => {
                          switch (col) {
                            case "internalRef": return <TableCell key={col} className="text-foreground font-mono text-xs">{job.internalRef}</TableCell>;
                            case "serviceType": return <TableCell key={col} className="text-muted-foreground text-sm">{job.serviceType}</TableCell>;
                            case "agent": return <TableCell key={col} className="text-muted-foreground text-sm">{job.agent?.legalName || job.customer?.legalName || "\u2014"}</TableCell>;
                            case "paxCount": return <TableCell key={col} className="text-muted-foreground">{job.paxCount}</TableCell>;
                            case "vehicle": return <TableCell key={col} className="text-muted-foreground text-sm">{job.assignment?.vehicle?.plateNumber || "\u2014"}</TableCell>;
                            case "driver": return <TableCell key={col} className="text-muted-foreground text-sm">{job.assignment?.driver?.name || "\u2014"}</TableCell>;
                            case "status": return <TableCell key={col}><StatusBadge status={job.status} /></TableCell>;
                            default: return null;
                          }
                        })}
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
              <Button
                variant="outline"
                onClick={recalculateDriverFees}
                disabled={recalcLoading}
                className="gap-1.5 border-border text-foreground"
                title="Recalculate missing driver trip fees from tariffs"
              >
                {recalcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recalc Fees
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
                      ? (driverData.totalTrips / driverData.totalDrivers).toFixed(1)
                      : "0"
                  }
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label="Missing Scores"
                  value={driverData.drivers.reduce((s, d) => s + d.missingScores, 0)}
                  color="text-amber-600 dark:text-amber-400"
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <DraggableTableHeader
                    columns={DRIVERS_COLUMNS}
                    columnOrder={driversColOrder.columns}
                    onReorder={driversColOrder.reorder}
                  />
                  <TableBody>
                    {driverSort.sortedData.map((d, idx) => (
                      <TableRow
                        key={d.driver.id}
                        className={`border-border cursor-pointer hover:bg-muted/50 ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        {driversColOrder.columns.map((col) => {
                          switch (col) {
                            case "driverName": return (
                              <TableCell key={col}>
                                <button
                                  type="button"
                                  className="text-primary hover:underline font-medium text-sm text-left"
                                  onClick={() => {
                                    setSelectedDriver(d);
                                    const initialEdits: Record<string, DriverJobScore> = {};
                                    for (const trip of d.trips) {
                                      if (trip.driverJobScore) initialEdits[trip.jobId] = trip.driverJobScore;
                                    }
                                    setDriverScoreEdits(initialEdits);
                                    setDriverModalOpen(true);
                                  }}
                                >
                                  {d.driver.name}
                                </button>
                              </TableCell>
                            );
                            case "mobile": return <TableCell key={col} className="text-muted-foreground text-sm">{d.driver.mobileNumber}</TableCell>;
                            case "trips": return <TableCell key={col} className="text-right text-foreground font-mono font-medium">{d.tripCount}</TableCell>;
                            case "avgScore": return (
                              <TableCell key={col} className="text-right font-mono font-medium">
                                {d.avgScore !== null ? (
                                  <span className={
                                    d.avgScore >= 81 ? "text-emerald-600 dark:text-emerald-400" :
                                    d.avgScore >= 63 ? "text-blue-600 dark:text-blue-400" :
                                    d.avgScore >= 45 ? "text-amber-600 dark:text-amber-400" :
                                    "text-red-600 dark:text-red-400"
                                  }>{d.avgScore}</span>
                                ) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                            );
                            case "missing": return (
                              <TableCell key={col} className="text-right font-mono font-medium">
                                {d.missingScores > 0 ? (
                                  <span className="text-amber-600 dark:text-amber-400">{d.missingScores}</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400">0</span>
                                )}
                              </TableCell>
                            );
                            case "totalFees": return <TableCell key={col} className="text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">{fmt(d.totalFees, locale)}</TableCell>;
                            default: return null;
                          }
                        })}
                      </TableRow>
                    ))}
                    {driverData.drivers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={driversColOrder.columns.length} className="text-center text-muted-foreground py-8">
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

        {/* ─── DRIVER SCORE REPORT ─── */}
        {canDriverTrips && (
          <TabsContent value="driver-score" className="space-y-4">
            <Card className="border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                  <Input
                    type="date"
                    value={driverScoreFrom}
                    onChange={(e) => setDriverScoreFrom(e.target.value)}
                    className="border-border bg-muted/50 text-foreground mt-0.5 h-8 text-sm w-36"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                  <Input
                    type="date"
                    value={driverScoreTo}
                    onChange={(e) => setDriverScoreTo(e.target.value)}
                    className="border-border bg-muted/50 text-foreground mt-0.5 h-8 text-sm w-36"
                  />
                </div>
                <div className="min-w-[180px]">
                  <Label className="text-muted-foreground text-xs">Driver Name</Label>
                  <Select value={driverScoreDriverId} onValueChange={setDriverScoreDriverId}>
                    <SelectTrigger className="border-border bg-muted/50 mt-0.5 h-8 text-sm">
                      <SelectValue placeholder="All Drivers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Drivers</SelectItem>
                      {driverList.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={fetchDriverScore} disabled={driverScoreLoading} className="gap-1.5">
                  {driverScoreLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {t("common.search")}
                </Button>
                {driverScoreData && (
                  <Button size="sm" variant="outline" onClick={exportDriverScorePdf} className="gap-1.5 ml-auto">
                    <Printer className="h-3.5 w-3.5" />
                    {t("reports.exportPdf")}
                  </Button>
                )}
              </div>
            </Card>

            {driverScoreLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : driverScoreData ? (
              <Card className="border-border bg-card p-4">
                {/* Summary row */}
                <div className="mb-4 flex flex-wrap gap-4">
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Jobs Scored</p>
                    <p className="text-lg font-bold text-foreground">{driverScoreData.count}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Total Score</p>
                    <p className="text-lg font-bold text-foreground">{driverScoreData.totalScore}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
                    <p className="text-xs text-muted-foreground">Average Score</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{driverScoreData.avgScore} / 100</p>
                  </div>
                </div>

                {driverScoreData.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No scored jobs found for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <DraggableTableHeader
                        columns={DRIVER_SCORE_COLUMNS}
                        columnOrder={driverScoreColOrder.columns}
                        onReorder={driverScoreColOrder.reorder}
                      />
                      <TableBody>
                        {driverScoreData.rows.map((row, idx) => {
                          const evalColor =
                            row.evaluation === "Excellent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                            row.evaluation === "Good" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                            row.evaluation === "Average" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                            "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
                          const check = <span className="text-emerald-500 font-bold text-sm">✓</span>;
                          const dash  = <span className="text-muted-foreground text-sm">—</span>;
                          return (
                            <TableRow key={row.jobId} className={idx % 2 === 0 ? "bg-muted/10" : ""}>
                              {driverScoreColOrder.columns.map((col) => {
                                switch (col) {
                                  case "internalRef": return <TableCell key={col} className="font-mono text-xs">{row.internalRef}</TableCell>;
                                  case "jobDate": return <TableCell key={col} className="text-xs text-muted-foreground whitespace-nowrap">{new Date(row.jobDate).toLocaleDateString()}</TableCell>;
                                  case "serviceType": return <TableCell key={col}><Badge variant="outline" className="text-xs">{row.serviceType}</Badge></TableCell>;
                                  case "paxCount": return <TableCell key={col} className="text-right text-xs text-muted-foreground">{row.paxCount}</TableCell>;
                                  case "driverName": return <TableCell key={col} className="text-xs text-muted-foreground">{row.driverName}</TableCell>;
                                  case "route": return <TableCell key={col} className="text-xs text-muted-foreground whitespace-nowrap">{row.route}</TableCell>;
                                  case "status": return <TableCell key={col}><StatusBadge status={row.status} /></TableCell>;
                                  case "attendance": return <TableCell key={col} className="text-center">{row.attendance ? check : dash}</TableCell>;
                                  case "appearance": return <TableCell key={col} className="text-center">{row.appearance ? check : dash}</TableCell>;
                                  case "carCleanliness": return <TableCell key={col} className="text-center">{row.carCleanliness ? check : dash}</TableCell>;
                                  case "maintenance": return <TableCell key={col} className="text-center">{row.maintenance ? check : dash}</TableCell>;
                                  case "work": return <TableCell key={col} className="text-center">{row.work ? check : dash}</TableCell>;
                                  case "total": return <TableCell key={col} className="text-right font-mono font-semibold text-sm">{row.total}</TableCell>;
                                  case "feePercent": return (
                                    <TableCell key={col} className="text-right font-mono text-sm">
                                      <span className={
                                        row.feePercent === 100 ? "text-emerald-600 dark:text-emerald-400 font-semibold" :
                                        row.feePercent >= 80 ? "text-blue-600 dark:text-blue-400" :
                                        row.feePercent >= 60 ? "text-amber-600 dark:text-amber-400" :
                                        "text-red-600 dark:text-red-400"
                                      }>{row.feePercent}%</span>
                                    </TableCell>
                                  );
                                  case "evaluation": return <TableCell key={col}><Badge variant="outline" className={`text-xs ${evalColor}`}>{row.evaluation}</Badge></TableCell>;
                                  default: return null;
                                }
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 px-1">
                      <span className="text-sm text-muted-foreground">
                        {driverScoreData.count} job{driverScoreData.count !== 1 ? "s" : ""} scored · Total {driverScoreData.totalScore} pts
                      </span>
                      <span className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                        Average: {driverScoreData.avgScore} / 100
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Car className="mb-2 h-8 w-8" />
                <p className="text-sm">Select a date range and click Search to view driver scores.</p>
              </div>
            )}

            {/* Hidden print content */}
            {driverScoreData && (
              <div ref={driverScorePrintRef} className="hidden">
                <h1>Driver Score Report</h1>
                <h2>Period: {driverScoreFrom} to {driverScoreTo}</h2>
                <dl className="info-grid">
                  <dt>Jobs Scored</dt><dd>{driverScoreData.count}</dd>
                  <dt>Total Score</dt><dd>{driverScoreData.totalScore}</dd>
                  <dt>Average Score</dt><dd>{driverScoreData.avgScore} / 100</dd>
                </dl>
                <table>
                  <thead>
                    <tr>
                      <th>Job Ref</th><th>Date</th><th>Type</th><th>Pax</th><th>Driver</th><th>Route</th><th>Status</th>
                      <th>Att (30)</th><th>App (20)</th><th>Car (10)</th><th>Maint (10)</th><th>Work (30)</th>
                      <th>Score</th><th>Fee %</th><th>Evaluation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverScoreData.rows.map((row) => (
                      <tr key={row.jobId}>
                        <td>{row.internalRef}</td>
                        <td>{new Date(row.jobDate).toLocaleDateString()}</td>
                        <td>{row.serviceType}</td>
                        <td className="text-right">{row.paxCount}</td>
                        <td>{row.driverName}</td>
                        <td>{row.route}</td>
                        <td>{row.status}</td>
                        <td className="text-center">{row.attendance ? "✓" : "—"}</td>
                        <td className="text-center">{row.appearance ? "✓" : "—"}</td>
                        <td className="text-center">{row.carCleanliness ? "✓" : "—"}</td>
                        <td className="text-center">{row.maintenance ? "✓" : "—"}</td>
                        <td className="text-center">{row.work ? "✓" : "—"}</td>
                        <td className="text-right">{row.total}</td>
                        <td className="text-right">{row.feePercent}%</td>
                        <td>{row.evaluation}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan={13}>Average Score ({driverScoreData.count} jobs)</td>
                      <td className="text-right">{driverScoreData.avgScore}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        )}

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
                    <h3 className="text-base font-medium text-foreground">
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
                  <DraggableTableHeader
                    columns={AGENT_COLUMNS}
                    columnOrder={agentColOrder.columns}
                    onReorder={agentColOrder.reorder}
                  />
                  <TableBody>
                    {agentSort.sortedData.map((inv, idx) => (
                      <TableRow
                        key={inv.invoiceNumber}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        {agentColOrder.columns.map((col) => {
                          switch (col) {
                            case "invoiceNumber": return <TableCell key={col} className="text-foreground font-mono text-xs">{inv.invoiceNumber}</TableCell>;
                            case "invoiceDate": return <TableCell key={col} className="text-muted-foreground text-sm">{formatDate(inv.invoiceDate)}</TableCell>;
                            case "dueDate": return <TableCell key={col} className="text-muted-foreground text-sm">{formatDate(inv.dueDate)}</TableCell>;
                            case "total": return <TableCell key={col} className="text-right text-foreground font-mono font-medium">{fmt(inv.total, locale)}</TableCell>;
                            case "paid": return <TableCell key={col} className="text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">{fmt(inv.paid, locale)}</TableCell>;
                            case "balance": return <TableCell key={col} className="text-right text-amber-600 dark:text-amber-400 font-mono font-medium">{fmt(inv.balance, locale)}</TableCell>;
                            case "status": return <TableCell key={col}><StatusBadge status={inv.status} /></TableCell>;
                            default: return null;
                          }
                        })}
                      </TableRow>
                    ))}
                    {agentData.invoices.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={agentColOrder.columns.length}
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
                <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                <Input
                  type="date"
                  value={repFeeFrom}
                  onChange={(e) => {
                    setRepFeeFrom(e.target.value);
                    if (e.target.value > repFeeTo) setRepFeeTo(e.target.value);
                  }}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                <Input
                  type="date"
                  value={repFeeTo}
                  min={repFeeFrom}
                  onChange={(e) => setRepFeeTo(e.target.value)}
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
                  <DraggableTableHeader
                    columns={REP_FEES_COLUMNS}
                    columnOrder={repFeesColOrder.columns}
                    onReorder={repFeesColOrder.reorder}
                  />
                  <TableBody>
                    {repFeeSort.sortedData.map((rep, idx) => (
                      <TableRow
                        key={rep.repId}
                        className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                      >
                        {repFeesColOrder.columns.map((col) => {
                          switch (col) {
                            case "repName": return (
                              <TableCell key={col}>
                                <button
                                  type="button"
                                  className="text-primary hover:underline font-medium text-sm text-left"
                                  onClick={() => {
                                    setSelectedRep(rep);
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
                            );
                            case "feePerFlight": return <TableCell key={col} className="text-right text-muted-foreground font-mono font-medium">{fmt(rep.feePerFlight, locale)}</TableCell>;
                            case "flightCount": return <TableCell key={col} className="text-right text-foreground font-mono font-medium">{groupByFlight(rep.fees).length}</TableCell>;
                            case "totalAmount": return <TableCell key={col} className="text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">{fmt(repNetTotals[rep.repId] ?? rep.totalAmount, locale)}</TableCell>;
                            default: return null;
                          }
                        })}
                      </TableRow>
                    ))}
                    {repFeeData.reps.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={repFeesColOrder.columns.length}
                          className="text-center text-muted-foreground py-8"
                        >
                          {t("reports.noRepFees")}
                        </TableCell>
                      </TableRow>
                    )}
                    {repFeeData.reps.length > 0 && (
                      <TableRow className="border-border bg-muted/50 font-semibold">
                        {repFeesColOrder.columns.map((col) => {
                          switch (col) {
                            case "repName": return <TableCell key={col} className="text-foreground">{t("reports.grandTotal")}</TableCell>;
                            case "feePerFlight": return <TableCell key={col} />;
                            case "flightCount": return <TableCell key={col} className="text-right text-foreground font-mono font-medium">{repFeeData.totalFlights}</TableCell>;
                            case "totalAmount": return <TableCell key={col} className="text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">{fmt(repFeeData.grandTotal, locale)}</TableCell>;
                            default: return null;
                          }
                        })}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>}

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
                      <DraggableTableHeader
                        columns={REP_SCORE_COLUMNS}
                        columnOrder={repScoreColOrder.columns}
                        onReorder={repScoreColOrder.reorder}
                      />
                      <TableBody>
                        {repScoreData.rows.map((row, idx) => {
                          const evalColor =
                            row.evaluation === "Excellent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                            row.evaluation === "Good" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                            row.evaluation === "Average" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                            "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
                          const check = <span className="text-emerald-500 font-bold text-sm">✓</span>;
                          const dash = <span className="text-muted-foreground text-sm">—</span>;
                          return (
                            <TableRow key={row.jobId} className={idx % 2 === 0 ? "bg-muted/10" : ""}>
                              {repScoreColOrder.columns.map((col) => {
                                switch (col) {
                                  case "internalRef": return <TableCell key={col} className="font-mono text-xs">{row.internalRef}</TableCell>;
                                  case "serviceType": return <TableCell key={col}><Badge variant="outline" className="text-xs">{row.serviceType}</Badge></TableCell>;
                                  case "paxCount": return <TableCell key={col} className="text-right text-xs text-muted-foreground">{row.paxCount}</TableCell>;
                                  case "repName": return <TableCell key={col} className="text-xs text-muted-foreground">{row.repName}</TableCell>;
                                  case "route": return (
                                    <TableCell key={col} className="text-xs text-muted-foreground whitespace-nowrap">
                                      {(row.originAirport?.code || row.fromZone?.name || row.originZone?.name || row.originHotel?.name || "—")} → {(row.destinationAirport?.code || row.toZone?.name || row.destinationZone?.name || row.destinationHotel?.name || "—")}
                                    </TableCell>
                                  );
                                  case "hotel": return <TableCell key={col} className="text-xs text-muted-foreground">{row.destinationHotel?.name || "—"}</TableCell>;
                                  case "status": return <TableCell key={col}><StatusBadge status={row.status} /></TableCell>;
                                  case "attendance": return <TableCell key={col} className="text-center">{row.attendance ? check : dash}</TableCell>;
                                  case "appearance": return <TableCell key={col} className="text-center">{row.appearance ? check : dash}</TableCell>;
                                  case "work": return <TableCell key={col} className="text-center">{row.work ? check : dash}</TableCell>;
                                  case "review": return <TableCell key={col} className="text-center">{row.review ? check : dash}</TableCell>;
                                  case "total": return <TableCell key={col} className="text-right font-mono font-semibold text-sm">{row.total}</TableCell>;
                                  case "evaluation": return <TableCell key={col}><Badge variant="outline" className={`text-xs ${evalColor}`}>{row.evaluation}</Badge></TableCell>;
                                  default: return null;
                                }
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 px-1">
                      <span className="text-sm text-muted-foreground">
                        {repScoreData.count} job{repScoreData.count !== 1 ? "s" : ""} scored · Total {repScoreData.totalScore} pts
                      </span>
                      <span className="text-base font-medium text-emerald-600 dark:text-emerald-400">
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
                    <TableRow className="border-border bg-muted">
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
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                          {fmt(a.revenue, locale)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono font-medium">
                          {a.invoiceCount}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono font-medium">
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
                    <TableRow className="border-border bg-muted">
                      <SortableHeader label={t("vehicles.plateNumber")} sortKey="plateNumber" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.type")} sortKey="vehicleTypeName" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.ownership")} sortKey="ownership" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.licenseExpiryDate")} sortKey="licenseExpiryDate" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-muted-foreground text-xs">{t("vehicles.insurance")}</TableHead>
                      <SortableHeader label={t("vehicles.temporaryPermit")} sortKey="temporaryPermitDate" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-muted-foreground text-xs">{t("vehicles.permitExpiry")}</TableHead>
                      <SortableHeader label={t("vehicles.annualPayment")} sortKey="annualPayment" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-muted-foreground text-xs">{t("vehicles.registrationFees")}</TableHead>
                      <SortableHeader label={t("vehicles.totalFees")} sortKey="totalFees" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <SortableHeader label={t("vehicles.totalDeposits")} sortKey="depositTotal" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
                      <TableHead className="text-muted-foreground text-xs">{t("vehicles.balanceRemaining")}</TableHead>
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
                <Label className="text-muted-foreground text-xs">{t("reports.repName")}</Label>
                <Select value={jobStatusRepId} onValueChange={setJobStatusRepId}>
                  <SelectTrigger className="mt-1 w-44 border-border bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("reports.allReps")}</SelectItem>
                    {repList.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Rep Status</Label>
                <Select value={jobStatusRepStatus} onValueChange={setJobStatusRepStatus}>
                  <SelectTrigger className="mt-1 w-40 border-border bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Rep Statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="IN_PLACE">In Place</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Driver Status</Label>
                <Select value={jobStatusDriverStatus} onValueChange={setJobStatusDriverStatus}>
                  <SelectTrigger className="mt-1 w-40 border-border bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Driver Statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="IN_PLACE">In Place</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
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
                      <TableRow className="border-border bg-muted">
                        <SortableHeader label={t("reports.trsfReference")} sortKey="internalRef" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("reports.agentRef")} sortKey="agentRef" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("agents.legalName")} sortKey="agentName" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("jobs.serviceDate")} sortKey="serviceDate" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("jobs.serviceType")} sortKey="serviceType" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
                        <SortableHeader label={t("jobs.time")} sortKey="time" currentKey={jobStatusSort.sortKey} currentDir={jobStatusSort.sortDir} onSort={jobStatusSort.onSort} />
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
                            <TableCell className="font-mono text-sm">
                              <button
                                type="button"
                                onClick={() => setJobDetailId(job.id)}
                                className="text-primary hover:underline font-mono text-sm"
                              >
                                {job.internalRef}
                              </button>
                            </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{job.agentRef || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.agentName || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(job.serviceDate).toLocaleDateString()}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.serviceType}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {job.time ? new Date(job.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm text-foreground">{job.driverName || "\u2014"}</TableCell>
                          <TableCell className="text-sm text-foreground">{job.repName || "\u2014"}</TableCell>
                          <TableCell className="text-right font-mono font-medium text-sm text-foreground">
                            {job.transferPrice != null ? `${fmt(job.transferPrice, locale)} ${job.transferPriceCurrency || ""}` : (job.priceAmount != null ? `${fmt(job.priceAmount, locale)} ${job.priceCurrency || ""}` : "\u2014")}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={job.status} />
                          </TableCell>
                          <TableCell>
                            {job.repJobStatus ? (
                              <StatusBadge status={job.repJobStatus} />
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {job.driverJobStatus ? (
                              <StatusBadge status={job.driverJobStatus} />
                            ) : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {job.driverEvidence.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => downloadDriverEvidencePdf(job)}
                                disabled={evidencePdfLoading.has(job.id)}
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-wait"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                {evidencePdfLoading.has(job.id) ? "Generating…" : "PDF"}
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
                <div className="min-w-[180px]">
                  <Label className="text-muted-foreground text-xs">{t("reports.repName")}</Label>
                  <Select value={evidenceRepId} onValueChange={setEvidenceRepId}>
                    <SelectTrigger className="mt-1 h-9 border-border bg-card text-foreground">
                      <SelectValue placeholder={t("reports.allReps")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">{t("reports.allReps")}</SelectItem>
                      {repList.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[180px]">
                  <Label className="text-muted-foreground text-xs">{t("dispatch.driverName")}</Label>
                  <Select value={evidenceDriverId} onValueChange={setEvidenceDriverId}>
                    <SelectTrigger className="mt-1 h-9 border-border bg-card text-foreground">
                      <SelectValue placeholder="All Drivers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Drivers</SelectItem>
                      {driverList.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
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
                      <TableRow className="border-border bg-muted">
                        <TableHead className="text-muted-foreground text-xs">Job Ref</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Agent Name</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Agent Ref</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Type</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t("reports.repName")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t("dispatch.driverName")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Evidence</TableHead>
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
                              <StatusBadge status={row.status} />
                            </TableCell>
                            <TableCell className="text-sm text-foreground">{row.repName ?? "—"}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.driverName ?? "—"}</TableCell>
                            <TableCell>
                              {row.hasEvidence ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 h-7 text-xs border-border text-foreground"
                                  onClick={() => generateEvidencePdf(row)}
                                  disabled={evidencePdfLoading.has(row.jobId)}
                                >
                                  <Camera className="h-3 w-3" />
                                  {evidencePdfLoading.has(row.jobId) ? "Generating…" : `${totalImages} photo${totalImages !== 1 ? "s" : ""}`}
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
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8 text-sm">
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

        {/* ─── SUPPLIER JOBS REPORT ─── */}
        {canSupplierJobs && (
          <TabsContent value="supplier-jobs" className="space-y-4">
            <Card className="border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Supplier Name</Label>
                  <Select value={supplierJobsSupplierId} onValueChange={setSupplierJobsSupplierId}>
                    <SelectTrigger className="mt-1 w-52 border-border bg-card text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Suppliers</SelectItem>
                      {supplierList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Supplier Status</Label>
                  <Select value={supplierJobsStatus} onValueChange={setSupplierJobsStatus}>
                    <SelectTrigger className="mt-1 w-44 border-border bg-card text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="IN_PLACE">In Place</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="NO_SHOW">No Show</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                  <Input
                    type="date"
                    value={supplierJobsFrom}
                    onChange={(e) => setSupplierJobsFrom(e.target.value)}
                    className="mt-1 w-44 border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                  <Input
                    type="date"
                    value={supplierJobsTo}
                    onChange={(e) => setSupplierJobsTo(e.target.value)}
                    className="mt-1 w-44 border-border bg-card text-foreground"
                  />
                </div>
                <Button onClick={fetchSupplierJobs} disabled={supplierJobsLoading} className="gap-1.5">
                  {supplierJobsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {t("reports.generate")}
                </Button>
                {supplierJobsData && (
                  <Button variant="outline" onClick={exportSupplierJobsPdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                )}
              </div>
            </Card>

            {supplierJobsData ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <StatCard label="Total Jobs" value={supplierJobsData.total} />
                  <StatCard
                    label="Completed"
                    value={supplierJobsData.rows.filter((r) => r.supplierStatus === "COMPLETED").length}
                    color="text-emerald-600 dark:text-emerald-400"
                  />
                  <StatCard
                    label="Pending"
                    value={supplierJobsData.rows.filter((r) => r.supplierStatus === "PENDING").length}
                    color="text-amber-600 dark:text-amber-400"
                  />
                </div>

                <div ref={supplierJobsPrintRef}>
                  <div className="rounded-md border border-border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border bg-muted">
                          <SortableHeader label="Job Ref" sortKey="jobRef" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Agent Name" sortKey="agentName" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Agent Ref" sortKey="agentRef" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Service Date" sortKey="serviceDate" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Route" sortKey="route" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Supplier" sortKey="supplierName" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                          <SortableHeader label="Supplier Status" sortKey="supplierStatus" currentKey={supplierJobsSort.sortKey} currentDir={supplierJobsSort.sortDir} onSort={supplierJobsSort.onSort} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierJobsSort.sortedData.map((row) => (
                          <TableRow key={row.id} className="border-border hover:bg-muted/30">
                            <TableCell className="font-mono text-sm">{row.jobRef}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.agentName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.agentRef}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(row.serviceDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">{row.route}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.supplierName}</TableCell>
                            <TableCell>
                              <StatusBadge status={row.supplierStatus} />
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
                <Truck className="mb-2 h-8 w-8" />
                <p className="text-sm">Select filters and click Generate to view supplier jobs.</p>
              </div>
            )}
          </TabsContent>
        )}
        {/* ─── CAR JOBS REPORT ─── */}
        {canCarJobs && (
          <TabsContent value="car-jobs" className="space-y-4">
            <Card className="border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Vehicle</Label>
                  <div className="mt-1">
                    <SearchableCombobox
                      items={[
                        { value: "ALL", label: "All Owned Cars" },
                        ...ownedVehicleList.map((v) => ({ value: v.id, label: v.plateNumber })),
                      ]}
                      value={carJobsVehicleId}
                      onChange={setCarJobsVehicleId}
                      placeholder="All Owned Cars"
                      searchPlaceholder="Search plate number…"
                      triggerClassName="w-52 border-border bg-card text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.from")}</Label>
                  <Input
                    type="date"
                    value={carJobsFrom}
                    onChange={(e) => setCarJobsFrom(e.target.value)}
                    className="mt-1 w-44 border-border bg-card text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">{t("common.to")}</Label>
                  <Input
                    type="date"
                    value={carJobsTo}
                    onChange={(e) => setCarJobsTo(e.target.value)}
                    className="mt-1 w-44 border-border bg-card text-foreground"
                  />
                </div>
                <Button onClick={fetchCarJobs} disabled={carJobsLoading} className="gap-1.5">
                  {carJobsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {t("reports.generate")}
                </Button>
                {carJobsData && (
                  <Button variant="outline" onClick={exportCarJobsPdf} className="gap-1.5 border-border text-foreground">
                    <Printer className="h-4 w-4" /> {t("reports.pdf")}
                  </Button>
                )}
              </div>
            </Card>

            {carJobsData ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <StatCard label="Total Jobs" value={carJobsData.total} />
                  <StatCard
                    label="Completed"
                    value={carJobsData.rows.filter((r) => r.jobStatus === "COMPLETED").length}
                    color="text-emerald-600 dark:text-emerald-400"
                  />
                  <StatCard
                    label="Pending"
                    value={carJobsData.rows.filter((r) => r.jobStatus === "PENDING").length}
                    color="text-amber-600 dark:text-amber-400"
                  />
                </div>

                <div ref={carJobsPrintRef}>
                  <div className="rounded-md border border-border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border bg-muted">
                          <SortableHeader label="Job Ref" sortKey="jobRef" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Agent Name" sortKey="agentName" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Service Date" sortKey="serviceDate" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Origin" sortKey="origin" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Destination" sortKey="destination" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Vehicle" sortKey="plateNumber" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Driver" sortKey="driver" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                          <SortableHeader label="Job Status" sortKey="jobStatus" currentKey={carJobsSort.sortKey} currentDir={carJobsSort.sortDir} onSort={carJobsSort.onSort} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {carJobsSort.sortedData.map((row) => (
                          <TableRow key={row.id} className="border-border hover:bg-muted/30">
                            <TableCell className="font-mono text-sm">{row.jobRef}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.agentName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(row.serviceDate).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-sm text-foreground">{row.origin}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.destination}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">{row.plateNumber}</TableCell>
                            <TableCell className="text-sm text-foreground">{row.driver}</TableCell>
                            <TableCell>
                              <StatusBadge status={row.jobStatus} />
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
                <Car className="mb-2 h-8 w-8" />
                <p className="text-sm">Select filters and click Generate to view car jobs.</p>
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
          if (!open && selectedRep) {
            // Persist the computed net total back to the list row
            const net = computeRepNet(selectedRep.fees);
            setRepNetTotals((prev) => ({ ...prev, [selectedRep.repId]: net }));
            setSelectedRep(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {selectedRep?.repName} &mdash; {repFeeFrom === repFeeTo ? repFeeFrom : `${repFeeFrom} → ${repFeeTo}`}
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
                      <TableRow className="border-border bg-muted">
                        <TableHead className="text-muted-foreground text-xs">{t("reports.jobRef")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t("jobs.type")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs text-right">
                          {t("dispatch.pax")}
                        </TableHead>
                        <TableHead className="text-muted-foreground text-xs">Route</TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t("locations.hotel")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs">{t("common.status")}</TableHead>
                        <TableHead className="text-muted-foreground text-xs text-center">Missed</TableHead>
                        <TableHead className="text-muted-foreground text-xs text-center">Att<br/><span className="text-[10px] font-normal opacity-75">20pt</span></TableHead>
                        <TableHead className="text-muted-foreground text-xs text-center">App<br/><span className="text-[10px] font-normal opacity-75">15pt</span></TableHead>
                        <TableHead className="text-muted-foreground text-xs text-center">Work<br/><span className="text-[10px] font-normal opacity-75">30pt</span></TableHead>
                        <TableHead className="text-muted-foreground text-xs text-center">Rev<br/><span className="text-[10px] font-normal opacity-75">35pt</span></TableHead>
                        <TableHead className="text-muted-foreground text-xs text-right">Score</TableHead>
                        <TableHead className="text-muted-foreground text-xs text-right">Fee</TableHead>
                        <TableHead className="text-muted-foreground text-xs text-right">Deductions</TableHead>
                        <TableHead className="text-muted-foreground text-xs">Eval</TableHead>
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
                        const isMissed = missedJobs[jobId] ?? false;

                        const toggleScore = (field: "attendance" | "appearance" | "work" | "review", enabled: boolean) => {
                          if (!enabled || isMissed) return;
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
                              <StatusBadge status={fee.status} />
                            </TableCell>
                            {/* Missed — disables all score checkboxes */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={isMissed}
                                onChange={() => setMissedJobs((prev) => ({ ...prev, [jobId]: !isMissed }))}
                                title="Mark as missed"
                                className="h-4 w-4 cursor-pointer accent-red-600"
                              />
                            </TableCell>
                            {/* Attendance — requires inPlaceEvidence */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={!hasInPlace || isSaving || isMissed}
                                checked={!isMissed && (currentScore?.attendance ?? false)}
                                onChange={() => toggleScore("attendance", hasInPlace)}
                                title={hasInPlace ? "Attendance (20pt)" : "Requires In Place evidence"}
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Appearance — requires inPlaceEvidence */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={!hasInPlace || isSaving || isMissed}
                                checked={!isMissed && (currentScore?.appearance ?? false)}
                                onChange={() => toggleScore("appearance", hasInPlace)}
                                title={hasInPlace ? "Appearance (15pt)" : "Requires In Place evidence"}
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Work — always enabled */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={isSaving || isMissed}
                                checked={!isMissed && (currentScore?.work ?? false)}
                                onChange={() => toggleScore("work", true)}
                                title="Work (30pt)"
                                className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                              />
                            </TableCell>
                            {/* Review — always enabled */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                disabled={isSaving || isMissed}
                                checked={!isMissed && (currentScore?.review ?? false)}
                                onChange={() => toggleScore("review", true)}
                                title="Review (35pt)"
                                className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {isMissed ? (
                                <span className="text-muted-foreground">—</span>
                              ) : isSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin inline" />
                              ) : currentScore?.total !== undefined && currentScore.total !== null ? (
                                <span>{currentScore.total}</span>
                              ) : "\u2014"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-sm">
                              {isMissed ? (
                                <span className="text-muted-foreground">—</span>
                              ) : currentScore?.fee !== undefined && currentScore.fee !== null
                                ? `${currentScore.fee} EGP`
                                : "\u2014"}
                            </TableCell>
                            {/* Deductions — negative amount deducted from rep */}
                            <TableCell className="text-right">
                              <input
                                type="number"
                                value={deductions[jobId] ?? ""}
                                onChange={(e) => setDeductions((prev) => ({ ...prev, [jobId]: Number(e.target.value) }))}
                                placeholder="0"
                                className="w-20 text-right text-sm bg-transparent border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </TableCell>
                            <TableCell>
                              {!isMissed && currentScore?.evaluation ? (
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

              {(() => {
                const flightCount = groupByFlight(selectedRep.fees).length;
                const jobCount = selectedRep.fees.length;
                const computedFees = selectedRep.fees.reduce((sum, fee) => {
                  const jobId = fee.trafficJob.id;
                  if (missedJobs[jobId]) return sum;
                  const score = scoreEdits[jobId] ?? fee.repJobScore;
                  const feeAmt = fee.trafficJob.serviceType === "ARR"
                    ? (score?.fee ?? fee.amount)
                    : fee.amount;
                  return sum + (Number(feeAmt) || 0);
                }, 0);
                // Sum only deductions for jobs in the current rep's fee list
                const relevantJobIds = new Set(selectedRep.fees.map((f) => f.trafficJob.id));
                const totalDeductions = Object.entries(deductions)
                  .filter(([k]) => relevantJobIds.has(k))
                  .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                const netTotal = computedFees - totalDeductions;
                return (
                  <div className="flex justify-between items-center border-t border-border pt-3 px-1">
                    <span className="text-sm font-semibold text-foreground">
                      {t("common.total")} ({flightCount} {t("reports.flightsCount")}, {jobCount} {t("reports.jobs")})
                    </span>
                    <div className="text-right">
                      {totalDeductions !== 0 && (
                        <div className={`text-xs font-mono ${totalDeductions > 0 ? "text-red-500" : "text-emerald-500"}`}>
                          {totalDeductions > 0
                            ? `- ${fmt(totalDeductions, locale)} EGP deductions`
                            : `+ ${fmt(Math.abs(totalDeductions), locale)} EGP adjustment`}
                        </div>
                      )}
                      <span className="text-base font-medium text-emerald-600 dark:text-emerald-400 font-mono">
                        {fmt(netTotal, locale)} EGP
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── DRIVER TRIP DETAIL MODAL ─── */}
      <Dialog
        open={driverModalOpen}
        onOpenChange={(open) => {
          setDriverModalOpen(open);
          if (!open) {
            setSelectedDriver(null);
            setDriverMissedJobs({});
            setDriverDeductions({});
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {selectedDriver?.driver.name} &mdash; {driverFrom === driverTo ? driverFrom : `${driverFrom} → ${driverTo}`}
            </DialogTitle>
          </DialogHeader>

          {selectedDriver && (
            <div className="space-y-3 py-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border bg-muted">
                      <TableHead className="text-muted-foreground text-xs">Job Ref</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Date</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Type</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-right">Pax</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Route</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Agent</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Status</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">
                        Att<br/><span className="text-[10px] font-normal opacity-75">30pt</span>
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">
                        App<br/><span className="text-[10px] font-normal opacity-75">20pt</span>
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">
                        Car<br/><span className="text-[10px] font-normal opacity-75">10pt</span>
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">
                        Maint<br/><span className="text-[10px] font-normal opacity-75">10pt</span>
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">
                        Work<br/><span className="text-[10px] font-normal opacity-75">30pt</span>
                      </TableHead>
                      <TableHead className="text-muted-foreground text-xs text-right">Score</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-center">Missed</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-right">Fee</TableHead>
                      <TableHead className="text-muted-foreground text-xs text-right">Deductions</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Eval</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDriver.trips.map((trip, idx) => {
                      const jobId = trip.jobId;
                      const currentScore = driverScoreEdits[jobId] ?? trip.driverJobScore;
                      const isSaving = driverScoreSaving[jobId] ?? false;
                      const isCompleted = trip.status === "COMPLETED";
                      const isMissing = !currentScore;
                      const isMissed = driverMissedJobs[jobId] ?? false;

                      const toggleDriverScore = (field: keyof Omit<DriverJobScore, "total" | "evaluation">) => {
                        const base = currentScore ?? { attendance: false, appearance: false, carCleanliness: false, maintenance: false, work: false, total: 0, evaluation: "Poor" };
                        const next = {
                          attendance: base.attendance,
                          appearance: base.appearance,
                          carCleanliness: base.carCleanliness,
                          maintenance: base.maintenance,
                          work: base.work,
                          [field]: !base[field],
                        };
                        saveDriverScore(jobId, next);
                      };

                      const evalColor =
                        currentScore?.evaluation === "Excellent" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" :
                        currentScore?.evaluation === "Good" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                        currentScore?.evaluation === "Average" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                        currentScore?.evaluation === "Poor" ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" : "";

                      return (
                        <TableRow
                          key={jobId}
                          className={`border-border ${isMissing ? "bg-amber-500/5 border-l-2 border-l-amber-500" : idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                        >
                          <TableCell className="text-foreground font-mono text-xs">{trip.internalRef}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{formatDate(trip.jobDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{trip.serviceType}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">{trip.paxCount}</TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{trip.route}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{trip.agent}</TableCell>
                          <TableCell>
                            <StatusBadge status={trip.status} />
                          </TableCell>
                          {/* Attendance — 30pt */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              disabled={isSaving}
                              checked={currentScore?.attendance ?? false}
                              onChange={() => toggleDriverScore("attendance")}
                              title="Attendance (30pt)"
                              className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                            />
                          </TableCell>
                          {/* Appearance — 20pt */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              disabled={isSaving}
                              checked={currentScore?.appearance ?? false}
                              onChange={() => toggleDriverScore("appearance")}
                              title="Appearance (20pt)"
                              className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                            />
                          </TableCell>
                          {/* Car Cleanliness — 10pt */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              disabled={isSaving}
                              checked={currentScore?.carCleanliness ?? false}
                              onChange={() => toggleDriverScore("carCleanliness")}
                              title="Car Cleanliness (10pt)"
                              className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                            />
                          </TableCell>
                          {/* Maintenance — 10pt */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              disabled={isSaving}
                              checked={currentScore?.maintenance ?? false}
                              onChange={() => toggleDriverScore("maintenance")}
                              title="Maintenance (10pt)"
                              className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                            />
                          </TableCell>
                          {/* Work — 20pt, auto from COMPLETED */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              disabled={isSaving}
                              checked={currentScore?.work ?? false}
                              onChange={() => toggleDriverScore("work")}
                              title={isCompleted ? "Work (20pt) — COMPLETED" : "Work (20pt)"}
                              className="h-4 w-4 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-emerald-600"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {isSaving ? (
                              <Loader2 className="h-3 w-3 animate-spin inline" />
                            ) : currentScore ? (
                              <span>{currentScore.total}<span className="text-muted-foreground text-xs">/100</span></span>
                            ) : (
                              <span className="text-amber-500 text-xs">—</span>
                            )}
                          </TableCell>
                          {/* Missed */}
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={isMissed}
                              onChange={() => setDriverMissedJobs((prev) => ({ ...prev, [jobId]: !isMissed }))}
                              title="Mark as missed (excludes fee from total)"
                              className="h-4 w-4 cursor-pointer accent-red-600"
                            />
                          </TableCell>
                          {/* Trip Fee */}
                          <TableCell className="text-right font-mono font-medium text-sm">
                            {isMissed ? (
                              <span className="text-muted-foreground">—</span>
                            ) : trip.tripFee != null ? (
                              <span className="flex flex-col items-end gap-0">
                                {trip.tariffFee != null && trip.tariffFee !== trip.tripFee && (
                                  <span className="text-muted-foreground line-through text-xs">
                                    {fmt(trip.tariffFee, locale)}
                                  </span>
                                )}
                                <span className={trip.tripFee > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}>
                                  {fmt(trip.tripFee, locale)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-amber-500 text-xs">—</span>
                            )}
                          </TableCell>
                          {/* Deductions */}
                          <TableCell className="text-right">
                            <input
                              type="number"
                              value={driverDeductions[jobId] ?? ""}
                              onChange={(e) => setDriverDeductions((prev) => ({ ...prev, [jobId]: Number(e.target.value) }))}
                              disabled={isMissed}
                              placeholder="0"
                              className="w-20 text-right text-sm bg-transparent border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                            />
                          </TableCell>
                          <TableCell>
                            {currentScore?.evaluation ? (
                              <Badge variant="outline" className={`text-xs ${evalColor}`}>
                                {currentScore.evaluation}
                              </Badge>
                            ) : <span className="text-xs text-amber-500">Pending</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary footer */}
              <div className="flex justify-between items-center border-t border-border pt-3 px-1">
                <span className="text-sm font-semibold text-foreground">
                  {selectedDriver.tripCount} trips &mdash; {selectedDriver.tripCount - selectedDriver.missingScores} scored
                  {selectedDriver.missingScores > 0 && (
                    <span className="ml-2 text-amber-500 text-xs">({selectedDriver.missingScores} pending)</span>
                  )}
                </span>
                <div className="text-right">
                  {selectedDriver.avgScore !== null && (
                    <div className="text-xs text-muted-foreground">
                      Avg Score: <span className="font-semibold font-mono text-foreground">{selectedDriver.avgScore}/100</span>
                    </div>
                  )}
                  {(() => {
                    const netFees = selectedDriver.trips.reduce((sum, trip) => {
                      if (driverMissedJobs[trip.jobId]) return sum;
                      const fee = trip.tripFee ?? 0;
                      const ded = driverDeductions[trip.jobId] ?? 0;
                      return sum + fee - ded;
                    }, 0);
                    const hasAdjustments = Object.keys(driverMissedJobs).some(k => driverMissedJobs[k]) || Object.values(driverDeductions).some(v => v > 0);
                    return (
                      <>
                        {hasAdjustments && (
                          <div className="text-xs text-muted-foreground line-through">
                            {fmt(selectedDriver.totalFees, locale)} EGP
                          </div>
                        )}
                        <span className="text-base font-medium text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(netFees, locale)} EGP
                        </span>
                      </>
                    );
                  })()}
                </div>
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
                  <td>{job.assignment?.vehicle?.plateNumber || "\u2014"}</td>
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
          <h2>Period: {repFeeFrom} to {repFeeTo}</h2>
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

      <JobDetailModal
        jobId={jobDetailId}
        open={jobDetailId !== null}
        onClose={() => setJobDetailId(null)}
      />
    </div>
  );
}
