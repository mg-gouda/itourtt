"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  Plus,
  Loader2,
  Search,
  Filter,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocationCombobox } from "@/components/location-combobox";
import api from "@/lib/api";

interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  jobDate: string;
  status: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  boosterSeat: boolean;
  babySeat: boolean;
  wheelChair: boolean;
  pickUpTime: string | null;
  notes: string | null;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  flight?: { flightNo: string; carrier: string } | null;
  assignment?: {
    vehicle?: { plateNumber: string };
    driver?: { name: string };
    rep?: { name: string };
  } | null;
}

interface Agent {
  id: string;
  legalName: string;
}

interface Customer {
  id: string;
  legalName: string;
  tradeName: string | null;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  ASSIGNED: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
  IN_PROGRESS: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
  COMPLETED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
  NO_SHOW: "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
};

const serviceTypeLabels: Record<string, string> = {
  ARR: "Arrival",
  DEP: "Departure",
  EXCURSION: "Excursion",
  ROUND_TRIP: "Round Trip",
  ONE_WAY_GOING: "One Way Going",
  ONE_WAY_RETURN: "One Way Return",
  OVER_DAY: "Over Day",
  TRANSFER: "Transfer",
  CITY_TOUR: "City Tour",
  COLLECTING_ONE_WAY: "Collecting One Way",
  COLLECTING_ROUND_TRIP: "Collecting Round Trip",
  EXPRESS_SHOPPING: "Express Shopping",
};

type BookingChannel = "ONLINE" | "B2B";

interface FormState {
  bookingChannel: BookingChannel;
  agentId: string;
  agentRef: string;
  customerId: string;
  serviceType: string;
  jobDate: string;
  adultCount: string;
  childCount: string;
  originAirportId: string;
  originZoneId: string;
  originHotelId: string;
  destinationAirportId: string;
  destinationZoneId: string;
  destinationHotelId: string;
  // display-only: track selected location id for combobox
  originSelectedId: string;
  destinationSelectedId: string;
  clientName: string;
  boosterSeat: boolean;
  babySeat: boolean;
  wheelChair: boolean;
  pickUpTime: string;
  notes: string;
  flightNo: string;
  carrier: string;
  terminal: string;
  arrivalTime: string;
  departureTime: string;
}

const defaultForm: FormState = {
  bookingChannel: "ONLINE",
  agentId: "",
  agentRef: "",
  customerId: "",
  serviceType: "ARR",
  jobDate: new Date().toISOString().split("T")[0],
  adultCount: "1",
  childCount: "0",
  originAirportId: "",
  originZoneId: "",
  originHotelId: "",
  destinationAirportId: "",
  destinationZoneId: "",
  destinationHotelId: "",
  originSelectedId: "",
  destinationSelectedId: "",
  clientName: "",
  boosterSeat: false,
  babySeat: false,
  wheelChair: false,
  pickUpTime: "",
  notes: "",
  flightNo: "",
  carrier: "",
  terminal: "",
  arrivalTime: "",
  departureTime: "",
};

export default function TrafficJobsPage() {
  const [jobs, setJobs] = useState<TrafficJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>({ ...defaultForm });

  const updateForm = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const fetchJobs = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "ALL") params.status = filterStatus;
      const { data } = await api.get("/traffic-jobs", { params });
      setJobs(Array.isArray(data) ? data : data.data || []);
    } catch {
      toast.error("Failed to load traffic jobs");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    async function fetchRefs() {
      try {
        const [agentsRes, customersRes] = await Promise.allSettled([
          api.get("/agents"),
          api.get("/customers"),
        ]);
        if (agentsRes.status === "fulfilled") {
          const d = agentsRes.value.data;
          setAgents(Array.isArray(d) ? d : d.data || []);
        }
        if (customersRes.status === "fulfilled") {
          const d = customersRes.value.data;
          setCustomers(Array.isArray(d) ? d : d.data || []);
        }
      } catch {
        // non-critical
      }
    }
    fetchRefs();
  }, []);

  const resetForm = () => {
    setForm({ ...defaultForm });
  };

  const handleCreate = async () => {
    // Validate based on channel
    if (form.bookingChannel === "ONLINE") {
      if (!form.agentId) {
        toast.error("Transfer Provider (Agent) is required");
        return;
      }
      if (!form.agentRef) {
        toast.error("Agent Ref is required for Online bookings");
        return;
      }
    } else {
      if (!form.customerId) {
        toast.error("Customer is required for B2B bookings");
        return;
      }
    }

    const hasOrigin = form.originAirportId || form.originZoneId || form.originHotelId;
    const hasDest = form.destinationAirportId || form.destinationZoneId || form.destinationHotelId;
    if (!hasOrigin || !hasDest) {
      toast.error("Origin and Destination are required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        bookingChannel: form.bookingChannel,
        serviceType: form.serviceType,
        jobDate: form.jobDate,
        adultCount: parseInt(form.adultCount) || 1,
        childCount: parseInt(form.childCount) || 0,
      };

      // Origin FK
      if (form.originAirportId) payload.originAirportId = form.originAirportId;
      if (form.originZoneId) payload.originZoneId = form.originZoneId;
      if (form.originHotelId) payload.originHotelId = form.originHotelId;
      // Destination FK
      if (form.destinationAirportId) payload.destinationAirportId = form.destinationAirportId;
      if (form.destinationZoneId) payload.destinationZoneId = form.destinationZoneId;
      if (form.destinationHotelId) payload.destinationHotelId = form.destinationHotelId;

      if (form.bookingChannel === "ONLINE") {
        payload.agentId = form.agentId;
        payload.agentRef = form.agentRef;
        if (form.clientName) payload.clientName = form.clientName;
        payload.boosterSeat = form.boosterSeat;
        payload.babySeat = form.babySeat;
        payload.wheelChair = form.wheelChair;
      } else {
        payload.customerId = form.customerId;
      }

      if (form.pickUpTime) payload.pickUpTime = form.pickUpTime;
      if (form.notes) payload.notes = form.notes;

      // Flight info for ARR/DEP
      if (
        (form.serviceType === "ARR" || form.serviceType === "DEP") &&
        (form.flightNo || form.carrier || form.terminal || form.arrivalTime || form.departureTime)
      ) {
        payload.flight = {
          flightNo: form.flightNo || "TBD",
          ...(form.carrier && { carrier: form.carrier }),
          ...(form.terminal && { terminal: form.terminal }),
          ...(form.arrivalTime && { arrivalTime: form.arrivalTime }),
          ...(form.departureTime && { departureTime: form.departureTime }),
        };
      }

      await api.post("/traffic-jobs", payload);
      toast.success("Traffic job created");
      setDialogOpen(false);
      resetForm();
      fetchJobs();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message || "Failed to create traffic job"
          : "Failed to create traffic job";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = jobs.filter((j) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        j.internalRef?.toLowerCase().includes(q) ||
        j.agentRef?.toLowerCase().includes(q) ||
        j.agent?.legalName?.toLowerCase().includes(q) ||
        j.customer?.legalName?.toLowerCase().includes(q) ||
        j.clientName?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const showFlightFields = form.serviceType === "ARR" || form.serviceType === "DEP";

  // Shared transfer fields used in both tabs
  const TransferFields = () => (
    <>
      {/* Service Type + Date */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Service Type *</Label>
          <Select
            value={form.serviceType}
            onValueChange={(v) => updateForm({ serviceType: v })}
          >
            <SelectTrigger className="border-border bg-card text-foreground h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-foreground">
              <SelectItem value="ARR">Arrival</SelectItem>
              <SelectItem value="DEP">Departure</SelectItem>
              <SelectItem value="EXCURSION">Excursion</SelectItem>
              <SelectItem value="ROUND_TRIP">Round Trip</SelectItem>
              <SelectItem value="ONE_WAY_GOING">One Way Going</SelectItem>
              <SelectItem value="ONE_WAY_RETURN">One Way Return</SelectItem>
              <SelectItem value="OVER_DAY">Over Day</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="CITY_TOUR">City Tour</SelectItem>
              <SelectItem value="COLLECTING_ONE_WAY">Collecting One Way</SelectItem>
              <SelectItem value="COLLECTING_ROUND_TRIP">Collecting Round Trip</SelectItem>
              <SelectItem value="EXPRESS_SHOPPING">Express Shopping</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Service Date *</Label>
          <Input
            type="date"
            value={form.jobDate}
            onChange={(e) => updateForm({ jobDate: e.target.value })}
            className="border-border bg-card text-foreground h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Pick Up Time</Label>
          <Input
            type="datetime-local"
            value={form.pickUpTime}
            onChange={(e) => updateForm({ pickUpTime: e.target.value })}
            className="border-border bg-card text-foreground h-9"
          />
        </div>
      </div>

      {/* Adults + Children */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Adults *</Label>
          <Input
            type="number"
            min="1"
            value={form.adultCount}
            onChange={(e) => updateForm({ adultCount: e.target.value })}
            className="border-border bg-card text-foreground h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Children</Label>
          <Input
            type="number"
            min="0"
            value={form.childCount}
            onChange={(e) => updateForm({ childCount: e.target.value })}
            className="border-border bg-card text-foreground h-9"
          />
        </div>
      </div>

      {/* Origin + Destination */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Origin *</Label>
          <LocationCombobox
            value={form.originSelectedId}
            onChange={(id, type) => {
              const clear = { originAirportId: "", originZoneId: "", originHotelId: "", originSelectedId: id };
              if (type === "AIRPORT") updateForm({ ...clear, originAirportId: id });
              else if (type === "ZONE") updateForm({ ...clear, originZoneId: id });
              else if (type === "HOTEL") updateForm({ ...clear, originHotelId: id });
            }}
            placeholder="Search origin..."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Destination *</Label>
          <LocationCombobox
            value={form.destinationSelectedId}
            onChange={(id, type) => {
              const clear = { destinationAirportId: "", destinationZoneId: "", destinationHotelId: "", destinationSelectedId: id };
              if (type === "AIRPORT") updateForm({ ...clear, destinationAirportId: id });
              else if (type === "ZONE") updateForm({ ...clear, destinationZoneId: id });
              else if (type === "HOTEL") updateForm({ ...clear, destinationHotelId: id });
            }}
            placeholder="Search destination..."
          />
        </div>
      </div>

      {/* Flight fields (ARR/DEP only) */}
      {showFlightFields && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <Label className="text-muted-foreground text-xs font-medium">
            Flight Information
          </Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Flight No</Label>
              <Input
                value={form.flightNo}
                onChange={(e) => updateForm({ flightNo: e.target.value })}
                placeholder="e.g. MS800"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Carrier</Label>
              <Input
                value={form.carrier}
                onChange={(e) => updateForm({ carrier: e.target.value })}
                placeholder="e.g. EgyptAir"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Terminal</Label>
              <Input
                value={form.terminal}
                onChange={(e) => updateForm({ terminal: e.target.value })}
                placeholder="e.g. T2"
                className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.serviceType === "ARR" && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Arrival Time
                </Label>
                <Input
                  type="datetime-local"
                  value={form.arrivalTime}
                  onChange={(e) => updateForm({ arrivalTime: e.target.value })}
                  className="border-border bg-card text-foreground h-9"
                />
              </div>
            )}
            {form.serviceType === "DEP" && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Departure Time
                </Label>
                <Input
                  type="datetime-local"
                  value={form.departureTime}
                  onChange={(e) =>
                    updateForm({ departureTime: e.target.value })
                  }
                  className="border-border bg-card text-foreground h-9"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs">Notes</Label>
        <Input
          value={form.notes}
          onChange={(e) => updateForm({ notes: e.target.value })}
          placeholder="Optional notes"
          className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traffic Jobs"
        description="Manage transport bookings and assignments"
        action={{ label: "New Job", onClick: () => setDialogOpen(true) }}
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search by ref, agent, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border bg-card pl-9 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 border-border bg-card text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover text-foreground">
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ASSIGNED">Assigned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="NO_SHOW">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Briefcase className="mb-2 h-8 w-8" />
            <p>No traffic jobs found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Ref</TableHead>
                <TableHead className="text-muted-foreground">Channel</TableHead>
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Agent / Customer</TableHead>
                <TableHead className="text-muted-foreground">Route</TableHead>
                <TableHead className="text-muted-foreground">Pax</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Assignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => (
                <TableRow
                  key={job.id}
                  className="border-border hover:bg-accent"
                >
                  <TableCell className="text-foreground font-mono text-xs">
                    {job.internalRef}
                    {job.agentRef && (
                      <span className="ml-1 text-muted-foreground">
                        ({job.agentRef})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        job.bookingChannel === "ONLINE"
                          ? "bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs"
                      }
                    >
                      {job.bookingChannel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-border text-muted-foreground"
                    >
                      {serviceTypeLabels[job.serviceType] || job.serviceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(job.jobDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {job.bookingChannel === "ONLINE"
                      ? job.agent?.legalName || "—"
                      : job.customer?.legalName || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {job.fromZone?.name || "?"} &rarr; {job.toZone?.name || "?"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.paxCount}
                    <span className="ml-1 text-xs text-muted-foreground/60">
                      ({job.adultCount}A
                      {job.childCount > 0 && `+${job.childCount}C`})
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusColors[job.status] || ""}
                    >
                      {job.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {job.assignment ? (
                      <span>
                        {job.assignment.vehicle?.plateNumber || "—"}
                        {job.assignment.driver &&
                          ` / ${job.assignment.driver.name}`}
                      </span>
                    ) : (
                      "Unassigned"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create Dialog – Two Tabs */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>New Traffic Job</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new transport booking
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={form.bookingChannel}
            onValueChange={(v) =>
              updateForm({ bookingChannel: v as BookingChannel })
            }
            className="w-full"
          >
            <TabsList className="w-full">
              <TabsTrigger value="ONLINE" className="flex-1">
                Online
              </TabsTrigger>
              <TabsTrigger value="B2B" className="flex-1">
                B2B
              </TabsTrigger>
            </TabsList>

            {/* Online Tab */}
            <TabsContent value="ONLINE" className="space-y-3 pt-2">
              {/* Agent + Agent Ref */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    Transfer Provider *
                  </Label>
                  <Select
                    value={form.agentId}
                    onValueChange={(v) => updateForm({ agentId: v })}
                  >
                    <SelectTrigger className="border-border bg-card text-foreground h-9">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-foreground">
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.legalName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">
                    Agent Ref *
                  </Label>
                  <Input
                    value={form.agentRef}
                    onChange={(e) => updateForm({ agentRef: e.target.value })}
                    placeholder="Agent reference"
                    className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
                  />
                </div>
              </div>

              <TransferFields />

              {/* Client Name */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Client Name
                </Label>
                <Input
                  value={form.clientName}
                  onChange={(e) => updateForm({ clientName: e.target.value })}
                  placeholder="Passenger name"
                  className="border-border bg-card text-foreground placeholder:text-muted-foreground h-9"
                />
              </div>

              {/* Extras */}
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Extras</Label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={form.boosterSeat}
                      onCheckedChange={(v) =>
                        updateForm({ boosterSeat: v === true })
                      }
                    />
                    Booster Seat
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={form.babySeat}
                      onCheckedChange={(v) =>
                        updateForm({ babySeat: v === true })
                      }
                    />
                    Baby Seat
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={form.wheelChair}
                      onCheckedChange={(v) =>
                        updateForm({ wheelChair: v === true })
                      }
                    />
                    Wheelchair
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* B2B Tab */}
            <TabsContent value="B2B" className="space-y-3 pt-2">
              {/* Customer */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Customer *
                </Label>
                <Select
                  value={form.customerId}
                  onValueChange={(v) => updateForm({ customerId: v })}
                >
                  <SelectTrigger className="border-border bg-card text-foreground h-9">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover text-foreground">
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.legalName}
                        {c.tradeName && (
                          <span className="ml-1 text-muted-foreground">
                            ({c.tradeName})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <TransferFields />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
