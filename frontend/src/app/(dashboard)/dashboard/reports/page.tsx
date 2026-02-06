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

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      toast.error("Failed to load dispatch summary");
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
      toast.error("Failed to load driver trip report");
    } finally {
      setDriverLoading(false);
    }
  };

  const fetchAgentStatement = async () => {
    if (!selectedAgentId) {
      toast.error("Please select an agent");
      return;
    }
    setAgentLoading(true);
    try {
      const { data } = await api.get(
        `/reports/agent-statement/${selectedAgentId}?from=${agentFrom}&to=${agentTo}`
      );
      setAgentData(data.data || data);
    } catch {
      toast.error("Failed to load agent statement");
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
      toast.error("Failed to load revenue report");
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
      toast.error("Failed to load rep fees report");
    } finally {
      setRepFeeLoading(false);
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
      toast.error("Failed to export Excel");
    }
  };

  const exportRepFeesPdf = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups for PDF export");
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
        title="Reports"
        description="Generate and view operational reports"
      />

      <Tabs defaultValue="dispatch" className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="dispatch"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Daily Dispatch
          </TabsTrigger>
          <TabsTrigger
            value="drivers"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <Car className="h-3.5 w-3.5" />
            Driver Trips
          </TabsTrigger>
          <TabsTrigger
            value="agent"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <Building2 className="h-3.5 w-3.5" />
            Agent Statement
          </TabsTrigger>
          <TabsTrigger
            value="rep-fees"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Rep Fees
          </TabsTrigger>
          <TabsTrigger
            value="revenue"
            className="gap-1.5 data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
          >
            <DollarSign className="h-3.5 w-3.5" />
            Revenue
          </TabsTrigger>
        </TabsList>

        {/* ─── DAILY DISPATCH SUMMARY ─── */}
        <TabsContent value="dispatch" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Date</Label>
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
                Generate
              </Button>
            </div>
          </Card>

          {dispatchData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Total Jobs"
                  value={dispatchData.totalJobs}
                />
                <StatCard
                  label="Assigned"
                  value={dispatchData.assignedCount}
                  sub={`${dispatchData.assignmentRate}% rate`}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label="Unassigned"
                  value={dispatchData.unassignedCount}
                  color="text-amber-600 dark:text-amber-400"
                />
                <StatCard
                  label="Completion Rate"
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

              <Card className="border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Ref</TableHead>
                      <TableHead className="text-muted-foreground">Type</TableHead>
                      <TableHead className="text-muted-foreground">Agent</TableHead>
                      <TableHead className="text-muted-foreground">Pax</TableHead>
                      <TableHead className="text-muted-foreground">Vehicle</TableHead>
                      <TableHead className="text-muted-foreground">Driver</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatchData.jobs.map((job) => (
                      <TableRow
                        key={job.id}
                        className="border-border hover:bg-accent"
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {job.internalRef}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.serviceType}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.agent?.legalName || job.customer?.legalName || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.paxCount}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.assignment?.vehicle.plateNumber || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.assignment?.driver?.name || "—"}
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
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── DRIVER TRIP REPORT ─── */}
        <TabsContent value="drivers" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">From</Label>
                <Input
                  type="date"
                  value={driverFrom}
                  onChange={(e) => setDriverFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">To</Label>
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
                Generate
              </Button>
            </div>
          </Card>

          {driverData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Drivers" value={driverData.totalDrivers} />
                <StatCard
                  label="Total Trips"
                  value={driverData.totalTrips}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label="Avg Trips/Driver"
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

              <Card className="border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Driver</TableHead>
                      <TableHead className="text-muted-foreground">Mobile</TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Trips
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Total Fees
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverData.drivers.map((d) => (
                      <TableRow
                        key={d.driver.id}
                        className="border-border hover:bg-accent"
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
                          {fmt(d.totalFees)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {driverData.drivers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground py-8"
                        >
                          No driver trips found in this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── AGENT STATEMENT ─── */}
        <TabsContent value="agent" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="min-w-48">
                <Label className="text-muted-foreground text-xs">Agent</Label>
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                >
                  <SelectTrigger className="mt-1 border-border bg-card text-foreground">
                    <SelectValue placeholder="Select agent..." />
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
                <Label className="text-muted-foreground text-xs">From</Label>
                <Input
                  type="date"
                  value={agentFrom}
                  onChange={(e) => setAgentFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">To</Label>
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
                Generate
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
                        Credit Limit:{" "}
                        <span className="text-foreground">
                          {fmt(agentData.agent.creditLimit)}{" "}
                          {agentData.agent.currency}
                        </span>
                      </p>
                    )}
                    {agentData.agent.creditDays !== null && (
                      <p className="text-xs text-muted-foreground">
                        Credit Days:{" "}
                        <span className="text-foreground">
                          {agentData.agent.creditDays}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Jobs" value={agentData.jobCount} />
                <StatCard
                  label="Total Invoiced"
                  value={fmt(agentData.totalInvoiced)}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label="Total Paid"
                  value={fmt(agentData.totalPaid)}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label="Outstanding"
                  value={fmt(agentData.outstandingBalance)}
                  color={
                    agentData.outstandingBalance > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }
                />
              </div>

              <Card className="border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Invoice #</TableHead>
                      <TableHead className="text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground">Due Date</TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Total
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Paid
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Balance
                      </TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentData.invoices.map((inv) => (
                      <TableRow
                        key={inv.invoiceNumber}
                        className="border-border hover:bg-accent"
                      >
                        <TableCell className="text-foreground font-mono text-xs">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(inv.invoiceDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(inv.dueDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {fmt(inv.total)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(inv.paid)}
                        </TableCell>
                        <TableCell className="text-right text-amber-600 dark:text-amber-400 font-mono">
                          {fmt(inv.balance)}
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
                          No invoices found for this agent in this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── REP FEES REPORT ─── */}
        <TabsContent value="rep-fees" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label className="text-muted-foreground text-xs">Date</Label>
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
                Generate
              </Button>
              {repFeeData && (
                <>
                  <Button
                    variant="outline"
                    onClick={exportRepFeesExcel}
                    className="gap-1.5 border-border text-foreground hover:bg-accent"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={exportRepFeesPdf}
                    className="gap-1.5 border-border text-foreground hover:bg-accent"
                  >
                    <Printer className="h-4 w-4" />
                    PDF
                  </Button>
                </>
              )}
            </div>
          </Card>

          {repFeeData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Total Reps"
                  value={repFeeData.reps.length}
                />
                <StatCard
                  label="Total Flights"
                  value={repFeeData.totalFlights}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatCard
                  label="Grand Total"
                  value={`${fmt(repFeeData.grandTotal)} EGP`}
                  color="text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <Card className="border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Rep Name</TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Fee/Flight
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Flights
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repFeeData.reps.map((rep) => (
                      <TableRow
                        key={rep.repId}
                        className="border-border hover:bg-accent"
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
                          {fmt(rep.feePerFlight)}
                        </TableCell>
                        <TableCell className="text-right text-foreground font-mono">
                          {rep.flightCount}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(rep.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {repFeeData.reps.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground py-8"
                        >
                          No rep fees found for this date
                        </TableCell>
                      </TableRow>
                    )}
                    {repFeeData.reps.length > 0 && (
                      <TableRow className="border-border bg-muted/50 font-semibold">
                        <TableCell className="text-foreground">Grand Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right text-foreground font-mono">
                          {repFeeData.totalFlights}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(repFeeData.grandTotal)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── REVENUE REPORT ─── */}
        <TabsContent value="revenue" className="space-y-4">
          <Card className="border-border bg-card p-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">From</Label>
                <Input
                  type="date"
                  value={revenueFrom}
                  onChange={(e) => setRevenueFrom(e.target.value)}
                  className="mt-1 w-44 border-border bg-card text-foreground"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">To</Label>
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
                Generate
              </Button>
            </div>
          </Card>

          {revenueData && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Total Revenue"
                  value={fmt(revenueData.totalRevenue)}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatCard
                  label="Total Costs"
                  value={fmt(revenueData.totalCosts)}
                  color="text-red-600 dark:text-red-400"
                />
                <StatCard
                  label="Gross Profit"
                  value={fmt(revenueData.grossProfit)}
                  color={
                    revenueData.grossProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                />
                <StatCard
                  label="Profit Margin"
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
                    Cost Breakdown
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Driver Fees</span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.driverFees)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Rep Fees</span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.repFees)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">
                        Supplier Costs
                      </span>
                      <span className="text-sm font-mono text-foreground">
                        {fmt(revenueData.costBreakdown.supplierCosts)}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="border-border bg-card p-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    Revenue by Service Type
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(revenueData.byServiceType).map(
                      ([type, amount]) => (
                        <div key={type} className="flex justify-between">
                          <span className="text-sm text-muted-foreground">{type}</span>
                          <span className="text-sm font-mono text-foreground">
                            {fmt(amount)}
                          </span>
                        </div>
                      )
                    )}
                    {Object.keys(revenueData.byServiceType).length === 0 && (
                      <p className="text-xs text-muted-foreground">No data</p>
                    )}
                  </div>
                </Card>
              </div>

              <Card className="border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Agent</TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Revenue
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Invoices
                      </TableHead>
                      <TableHead className="text-muted-foreground text-right">
                        Jobs
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueData.byAgent.map((a) => (
                      <TableRow
                        key={a.agentId}
                        className="border-border hover:bg-accent"
                      >
                        <TableCell className="text-foreground text-sm font-medium">
                          {a.name}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(a.revenue)}
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
                          No revenue data found for this period
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </>
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
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Job Ref</TableHead>
                        <TableHead className="text-muted-foreground">Type</TableHead>
                        <TableHead className="text-muted-foreground text-right">
                          Pax
                        </TableHead>
                        <TableHead className="text-muted-foreground">Route</TableHead>
                        <TableHead className="text-muted-foreground">Hotel</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground text-right">
                          Fee
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.jobs.map((fee) => (
                        <TableRow
                          key={fee.id}
                          className="border-border hover:bg-accent"
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
                            {fee.trafficJob.fromZone && fee.trafficJob.toZone
                              ? `${fee.trafficJob.fromZone.name} \u2192 ${fee.trafficJob.toZone.name}`
                              : "\u2014"}
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
                            {Number(fee.amount) > 0 ? fmt(Number(fee.amount)) : "\u2014"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}

              <div className="flex justify-between items-center border-t border-border pt-3 px-1">
                <span className="text-sm font-semibold text-foreground">
                  Total ({selectedRep.flightCount} flights)
                </span>
                <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                  {fmt(selectedRep.totalAmount)} EGP
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
                  <td className="text-right">{fmt(rep.feePerFlight)}</td>
                  <td className="text-right">{rep.flightCount}</td>
                  <td className="text-right">{fmt(rep.totalAmount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Grand Total</td>
                <td />
                <td className="text-right">{repFeeData.totalFlights}</td>
                <td className="text-right">{fmt(repFeeData.grandTotal)}</td>
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
                        {fee.trafficJob.fromZone && fee.trafficJob.toZone
                          ? `${fee.trafficJob.fromZone.name} \u2192 ${fee.trafficJob.toZone.name}`
                          : "\u2014"}
                      </td>
                      <td>{fee.trafficJob.hotel?.name || "\u2014"}</td>
                      <td className="text-right">{fmt(Number(fee.amount))}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={6}>Subtotal</td>
                    <td className="text-right">{fmt(rep.totalAmount)}</td>
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
