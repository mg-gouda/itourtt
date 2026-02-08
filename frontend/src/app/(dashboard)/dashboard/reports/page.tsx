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
import { formatDate } from "@/lib/utils";
import { SortableHeader } from "@/components/sortable-header";
import { useSortable } from "@/hooks/use-sortable";

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
  temporaryPermitDate: string | null;
  temporaryPermitExpiryDate: string | null;
  depositPayment: number | null;
  balanceRemaining: number | null;
}

interface Agent {
  id: string;
  legalName: string;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];
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
    <Card className="border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

export default function ReportsPage() {
  const t = useT();
  const locale = useLocaleId();

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
  const printRef = useRef<HTMLDivElement>(null);

  // Vehicle Compliance
  const [complianceData, setComplianceData] = useState<ComplianceReportItem[]>([]);
  const [complianceLoading, setComplianceLoading] = useState(false);

  // Sortable hooks for each report table
  const dispatchSort = useSortable(dispatchData?.jobs || []);
  const driverSort = useSortable(driverData?.drivers || []);
  const agentSort = useSortable(agentData?.invoices || []);
  const repFeeSort = useSortable(repFeeData?.reps || []);
  const revenueSort = useSortable(revenueData?.byAgent || []);
  const complianceSort = useSortable(complianceData);

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
        @media print { body { padding: 0; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

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

      <Tabs defaultValue="dispatch" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="dispatch"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("reports.dailyDispatch")}
          </TabsTrigger>
          <TabsTrigger
            value="drivers"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <Car className="h-3.5 w-3.5" />
            {t("reports.driverTrips")}
          </TabsTrigger>
          <TabsTrigger
            value="agent"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            {t("reports.agentStatement")}
          </TabsTrigger>
          <TabsTrigger
            value="rep-fees"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <UserCheck className="h-3.5 w-3.5" />
            {t("reports.repFees")}
          </TabsTrigger>
          <TabsTrigger
            value="revenue"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {t("reports.revenue")}
          </TabsTrigger>
          <TabsTrigger
            value="compliance"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("reports.vehicleCompliance")}
          </TabsTrigger>
        </TabsList>

        {/* ─── DAILY DISPATCH SUMMARY ─── */}
        <TabsContent value="dispatch" className="space-y-4">
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
            </div>
          </Card>

          {dispatchData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("reports.totalJobs")}
                  value={dispatchData.totalJobs}
                />
                <StatCard
                  label={t("reports.assigned")}
                  value={dispatchData.assignedCount}
                  sub={`${dispatchData.assignmentRate}% ${t("reports.rateLabel")}`}
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
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.entries(dispatchData.byServiceType).map(([type, count]) => (
                  <Card
                    key={type}
                    className="border-border bg-card p-3"
                  >
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <p className="text-lg font-semibold text-foreground">{count}</p>
                  </Card>
                ))}
                {Object.entries(dispatchData.byStatus).map(([status, count]) => (
                  <Card
                    key={status}
                    className="border-border bg-card p-3"
                  >
                    <p className="text-xs text-muted-foreground">{status}</p>
                    <p className="text-lg font-semibold text-foreground">{count}</p>
                  </Card>
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
        </TabsContent>

        {/* ─── DRIVER TRIP REPORT ─── */}
        <TabsContent value="drivers" className="space-y-4">
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
            </div>
          </Card>

          {driverData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        </TabsContent>

        {/* ─── AGENT STATEMENT ─── */}
        <TabsContent value="agent" className="space-y-4">
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </TabsContent>

        {/* ─── REP FEES REPORT ─── */}
        <TabsContent value="rep-fees" className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        </TabsContent>

        {/* ─── REVENUE REPORT ─── */}
        <TabsContent value="revenue" className="space-y-4">
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
            </div>
          </Card>

          {revenueData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </TabsContent>

        {/* ─── VEHICLE COMPLIANCE ─── */}
        <TabsContent value="compliance" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={fetchCompliance}
                disabled={complianceLoading}
              >
                {complianceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {t("reports.generate")}
              </Button>
            </div>
          </Card>

          {complianceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : complianceData.length > 0 ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label={t("reports.totalVehicles")} value={complianceData.length} />
                <StatCard
                  label={t("reports.withInsurance")}
                  value={complianceData.filter((v) => v.hasInsurance).length}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label={t("reports.permitWarnings")}
                  value={complianceData.filter((v) => {
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
                  value={complianceData.filter((v) => {
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
                      <SortableHeader label={t("vehicles.depositPayment")} sortKey="depositPayment" currentKey={complianceSort.sortKey} currentDir={complianceSort.sortDir} onSort={complianceSort.onSort} />
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
                          key={v.vehicleId}
                          className={`border-border ${idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50"}`}
                        >
                          <TableCell className="font-medium text-foreground">{v.plateNumber}</TableCell>
                          <TableCell className="text-muted-foreground">{v.vehicleTypeName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-secondary text-muted-foreground">{v.ownership}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.licenseExpiryDate ? formatDate(v.licenseExpiryDate, locale) : "—"}</TableCell>
                          <TableCell>
                            {v.hasInsurance ? (
                              <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">{t("common.yes")}</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-600 dark:text-red-400">{t("common.no")}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.temporaryPermitDate ? formatDate(v.temporaryPermitDate, locale) : "—"}</TableCell>
                          <TableCell>
                            {permitExp ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground text-sm">{formatDate(v.temporaryPermitExpiryDate!, locale)}</span>
                                {isExpired && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                                {isWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{v.annualPayment != null ? `${fmt(Number(v.annualPayment))} ${v.annualPaymentCurrency || ""}` : "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{v.depositPayment != null ? fmt(Number(v.depositPayment)) : "—"}</TableCell>
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
        </TabsContent>
      </Tabs>

      {/* ─── REP FEE DETAIL MODAL ─── */}
      <Dialog
        open={repModalOpen}
        onOpenChange={(open) => {
          setRepModalOpen(open);
          if (!open) setSelectedRep(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover text-foreground sm:max-w-2xl">
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
                        <TableHead className="text-white text-xs text-right">
                          {t("reports.fee")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.jobs.map((fee, idx) => (
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
                                fee.trafficJob.serviceType === "ARR"
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
                          <TableCell className="text-muted-foreground text-sm">
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
                          <TableCell className="text-right text-foreground font-mono">
                            {Number(fee.amount) > 0 ? fmt(Number(fee.amount), locale) : "\u2014"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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

      {/* Hidden print content for PDF export */}
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
