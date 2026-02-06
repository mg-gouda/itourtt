"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plane,
  PlaneTakeoff,
  Bus,
  Car,
  Users,
  UserCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface Job {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: "ONLINE" | "B2B";
  serviceType: string;
  status: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  fromZone?: { name: string } | null;
  toZone?: { name: string } | null;
  flight?: {
    flightNo: string;
    carrier: string;
    arrivalTime?: string;
    departureTime?: string;
  } | null;
  assignment?: {
    id: string;
    vehicleId: string;
    driverId: string | null;
    repId: string | null;
    vehicle?: {
      plateNumber: string;
      vehicleType?: { name: string; seatCapacity: number };
    };
    driver?: { name: string };
    rep?: { name: string };
  } | null;
}

interface VehicleResource {
  id: string;
  plateNumber: string;
  vehicleType?: { name: string; seatCapacity: number };
}

interface PersonResource {
  id: string;
  name: string;
}

type EditField = "vehicle" | "driver" | "rep";

interface ActiveCell {
  jobId: string;
  field: EditField;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const statusRowClass: Record<string, string> = {
  PENDING: "border-l-4 border-l-red-500",
  ASSIGNED: "border-l-4 border-l-emerald-500",
  IN_PROGRESS: "border-l-4 border-l-blue-500",
  COMPLETED: "border-l-4 border-l-zinc-500",
  CANCELLED: "border-l-4 border-l-zinc-700",
};

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmtTime(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ────────────────────────────────────────────
// Editable Cell
// ────────────────────────────────────────────

function EditableVehicleCell({
  job,
  vehicles,
  isEditing,
  onStartEdit,
  onSelect,
  onCancel,
  cellRef,
}: {
  job: Job;
  vehicles: VehicleResource[];
  isEditing: boolean;
  onStartEdit: () => void;
  onSelect: (vehicleId: string) => void;
  onCancel: () => void;
  cellRef: (el: HTMLTableCellElement | null) => void;
}) {
  const current = job.assignment?.vehicle;

  if (isEditing) {
    return (
      <TableCell ref={cellRef} className="p-1">
        <Select
          defaultOpen
          value={job.assignment?.vehicleId || ""}
          onValueChange={(val) => onSelect(val)}
          onOpenChange={(open) => {
            if (!open) onCancel();
          }}
        >
          <SelectTrigger className="h-7 w-full border-border bg-secondary text-foreground text-xs">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-foreground max-h-60">
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                {v.plateNumber} — {v.vehicleType?.name} (
                {v.vehicleType?.seatCapacity})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }

  return (
    <TableCell
      ref={cellRef}
      tabIndex={0}
      className="cursor-pointer text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:ring-inset"
      onClick={onStartEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStartEdit();
        }
      }}
    >
      {current ? (
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
        >
          {current.plateNumber}
        </Badge>
      ) : (
        <span className="text-red-600 dark:text-red-400 text-xs">— click to assign</span>
      )}
    </TableCell>
  );
}

function EditablePersonCell({
  job,
  field,
  resources,
  isEditing,
  onStartEdit,
  onSelect,
  onCancel,
  cellRef,
}: {
  job: Job;
  field: "driver" | "rep";
  resources: PersonResource[];
  isEditing: boolean;
  onStartEdit: () => void;
  onSelect: (id: string) => void;
  onCancel: () => void;
  cellRef: (el: HTMLTableCellElement | null) => void;
}) {
  const currentId =
    field === "driver" ? job.assignment?.driverId : job.assignment?.repId;
  const currentName =
    field === "driver"
      ? job.assignment?.driver?.name
      : job.assignment?.rep?.name;
  const canEdit = !!job.assignment; // must have vehicle first

  if (isEditing && canEdit) {
    return (
      <TableCell ref={cellRef} className="p-1">
        <Select
          defaultOpen
          value={currentId || ""}
          onValueChange={(val) => onSelect(val)}
          onOpenChange={(open) => {
            if (!open) onCancel();
          }}
        >
          <SelectTrigger className="h-7 w-full border-border bg-secondary text-foreground text-xs">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-foreground max-h-60">
            <SelectItem value="__none__" className="text-xs text-muted-foreground">
              None
            </SelectItem>
            {resources.map((r) => (
              <SelectItem key={r.id} value={r.id} className="text-xs">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    );
  }

  return (
    <TableCell
      ref={cellRef}
      tabIndex={canEdit ? 0 : -1}
      className={`text-sm text-muted-foreground ${canEdit ? "cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring focus:ring-inset" : ""}`}
      onClick={canEdit ? onStartEdit : undefined}
      onKeyDown={
        canEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onStartEdit();
              }
            }
          : undefined
      }
    >
      {currentName || (
        <span
          className={
            field === "driver" ? "text-yellow-600 dark:text-yellow-400 text-xs" : "text-muted-foreground/60 text-xs"
          }
        >
          —
        </span>
      )}
    </TableCell>
  );
}

// ────────────────────────────────────────────
// SummaryFooter
// ────────────────────────────────────────────

function SummaryFooter({
  arrivals,
  departures,
  cityTransfers,
}: {
  arrivals: Job[];
  departures: Job[];
  cityTransfers: Job[];
}) {
  const all = [...arrivals, ...departures, ...cityTransfers];
  const total = all.length;
  const assigned = all.filter((j) => j.assignment).length;
  const pending = all.filter((j) => j.status === "PENDING").length;
  const completed = all.filter((j) => j.status === "COMPLETED").length;
  const totalPax = all.reduce((s, j) => s + j.paxCount, 0);

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-popover/95 backdrop-blur px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex gap-6 text-muted-foreground">
          <span>
            Total:{" "}
            <span className="font-medium text-foreground">{total}</span>
          </span>
          <span>
            ARR:{" "}
            <span className="font-medium text-foreground">{arrivals.length}</span>
          </span>
          <span>
            DEP:{" "}
            <span className="font-medium text-foreground">
              {departures.length}
            </span>
          </span>
          <span>
            Excursion:{" "}
            <span className="font-medium text-foreground">
              {cityTransfers.length}
            </span>
          </span>
          <span className="border-l border-border pl-6">
            Pax:{" "}
            <span className="font-medium text-foreground">{totalPax}</span>
          </span>
        </div>
        <div className="flex gap-6 text-muted-foreground">
          <span>
            Assigned:{" "}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {assigned}/{total}
            </span>
          </span>
          <span>
            Pending:{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">{pending}</span>
          </span>
          <span>
            Completed:{" "}
            <span className="font-medium text-blue-600 dark:text-blue-400">{completed}</span>
          </span>
          <span className="border-l border-border pl-6">
            Rate:{" "}
            <span className="font-medium text-foreground">
              {total > 0 ? Math.round((assigned / total) * 100) : 0}%
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// JobGrid with inline editing
// ────────────────────────────────────────────

function JobGrid({
  jobs,
  title,
  icon: Icon,
  activeCell,
  vehicles,
  drivers,
  reps,
  onStartEdit,
  onCancelEdit,
  onInlineAssign,
  onDialogAssign,
}: {
  jobs: Job[];
  title: string;
  icon: React.ElementType;
  activeCell: ActiveCell | null;
  vehicles: VehicleResource[];
  drivers: PersonResource[];
  reps: PersonResource[];
  onStartEdit: (jobId: string, field: EditField) => void;
  onCancelEdit: () => void;
  onInlineAssign: (
    job: Job,
    field: EditField,
    value: string
  ) => void;
  onDialogAssign: (job: Job) => void;
}) {
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const setCellRef = useCallback(
    (jobId: string, field: EditField) =>
      (el: HTMLTableCellElement | null) => {
        const key = `${jobId}-${field}`;
        if (el) cellRefs.current.set(key, el);
        else cellRefs.current.delete(key);
      },
    []
  );

  // Keyboard navigation between cells
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, jobId: string, field: EditField) => {
      const fields: EditField[] = ["vehicle", "driver", "rep"];
      const fieldIdx = fields.indexOf(field);
      const jobIdx = jobs.findIndex((j) => j.id === jobId);

      if (e.key === "Tab") {
        e.preventDefault();
        let nextFieldIdx = e.shiftKey ? fieldIdx - 1 : fieldIdx + 1;
        let nextJobIdx = jobIdx;

        if (nextFieldIdx >= fields.length) {
          nextFieldIdx = 0;
          nextJobIdx++;
        } else if (nextFieldIdx < 0) {
          nextFieldIdx = fields.length - 1;
          nextJobIdx--;
        }

        if (nextJobIdx >= 0 && nextJobIdx < jobs.length) {
          const nextKey = `${jobs[nextJobIdx].id}-${fields[nextFieldIdx]}`;
          cellRefs.current.get(nextKey)?.focus();
        }
      } else if (e.key === "ArrowDown" && jobIdx < jobs.length - 1) {
        e.preventDefault();
        const nextKey = `${jobs[jobIdx + 1].id}-${field}`;
        cellRefs.current.get(nextKey)?.focus();
      } else if (e.key === "ArrowUp" && jobIdx > 0) {
        e.preventDefault();
        const nextKey = `${jobs[jobIdx - 1].id}-${field}`;
        cellRefs.current.get(nextKey)?.focus();
      }
    },
    [jobs]
  );

  if (jobs.length === 0) {
    return (
      <Card className="border-border bg-card p-6">
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/60">
          <Icon className="mb-2 h-8 w-8" />
          <p className="text-sm">No {title.toLowerCase()} jobs</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground w-28">Ref</TableHead>
            <TableHead className="text-muted-foreground">Agent</TableHead>
            <TableHead className="text-muted-foreground">Route</TableHead>
            <TableHead className="text-muted-foreground w-14">Pax</TableHead>
            <TableHead className="text-muted-foreground">Flight</TableHead>
            <TableHead className="text-muted-foreground w-40">Vehicle</TableHead>
            <TableHead className="text-muted-foreground w-32">Driver</TableHead>
            <TableHead className="text-muted-foreground w-32">Rep</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isEditable =
              job.status === "PENDING" || job.status === "ASSIGNED";

            return (
              <TableRow
                key={job.id}
                className={`border-border hover:bg-accent ${statusRowClass[job.status] || ""}`}
              >
                <TableCell
                  className="text-foreground font-mono text-xs cursor-pointer"
                  onClick={() => isEditable && onDialogAssign(job)}
                  title="Click to open full assignment dialog"
                >
                  {job.internalRef}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {job.bookingChannel === "ONLINE"
                    ? job.agent?.legalName || "—"
                    : job.customer?.legalName || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {job.fromZone?.name} → {job.toZone?.name}
                </TableCell>
                <TableCell className="text-muted-foreground text-center">
                  {job.paxCount}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {job.flight
                    ? `${job.flight.flightNo} ${fmtTime(job.flight.arrivalTime || job.flight.departureTime)}`
                    : "—"}
                </TableCell>

                {isEditable ? (
                  <>
                    <EditableVehicleCell
                      job={job}
                      vehicles={vehicles}
                      isEditing={
                        activeCell?.jobId === job.id &&
                        activeCell?.field === "vehicle"
                      }
                      onStartEdit={() => onStartEdit(job.id, "vehicle")}
                      onSelect={(val) =>
                        onInlineAssign(job, "vehicle", val)
                      }
                      onCancel={onCancelEdit}
                      cellRef={setCellRef(job.id, "vehicle")}
                    />
                    <EditablePersonCell
                      job={job}
                      field="driver"
                      resources={drivers}
                      isEditing={
                        activeCell?.jobId === job.id &&
                        activeCell?.field === "driver"
                      }
                      onStartEdit={() => onStartEdit(job.id, "driver")}
                      onSelect={(val) =>
                        onInlineAssign(job, "driver", val)
                      }
                      onCancel={onCancelEdit}
                      cellRef={setCellRef(job.id, "driver")}
                    />
                    <EditablePersonCell
                      job={job}
                      field="rep"
                      resources={reps}
                      isEditing={
                        activeCell?.jobId === job.id &&
                        activeCell?.field === "rep"
                      }
                      onStartEdit={() => onStartEdit(job.id, "rep")}
                      onSelect={(val) =>
                        onInlineAssign(job, "rep", val)
                      }
                      onCancel={onCancelEdit}
                      cellRef={setCellRef(job.id, "rep")}
                    />
                  </>
                ) : (
                  <>
                    <TableCell className="text-sm">
                      {job.assignment?.vehicle ? (
                        <Badge
                          variant="outline"
                          className="border-zinc-500/30 text-zinc-600 dark:text-zinc-400"
                        >
                          {job.assignment.vehicle.plateNumber}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.assignment?.driver?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.assignment?.rep?.name || "—"}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

export default function DispatchPage() {
  const [date, setDate] = useState(new Date());
  const [arrivals, setArrivals] = useState<Job[]>([]);
  const [departures, setDepartures] = useState<Job[]>([]);
  const [cityTransfers, setCityTransfers] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Available resources for the day (pre-fetched)
  const [vehicles, setVehicles] = useState<VehicleResource[]>([]);
  const [drivers, setDrivers] = useState<PersonResource[]>([]);
  const [reps, setReps] = useState<PersonResource[]>([]);

  // Inline editing state
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);

  // Optimistic rollback state
  const prevState = useRef<{
    arrivals: Job[];
    departures: Job[];
    cityTransfers: Job[];
  } | null>(null);

  // Dialog fallback
  const [dialogJob, setDialogJob] = useState<Job | null>(null);
  const [dialogVehicle, setDialogVehicle] = useState("");
  const [dialogDriver, setDialogDriver] = useState("");
  const [dialogRep, setDialogRep] = useState("");
  const [dialogSaving, setDialogSaving] = useState(false);

  // ── Fetch day data + available resources ──

  const fetchDay = useCallback(async () => {
    setLoading(true);
    const dateStr = fmtDate(date);
    try {
      const [dayRes, vRes, dRes, rRes] = await Promise.allSettled([
        api.get(`/dispatch/day?date=${dateStr}`),
        api.get(`/dispatch/available-vehicles?date=${dateStr}`),
        api.get(`/dispatch/available-drivers?date=${dateStr}`),
        api.get(`/dispatch/available-reps?date=${dateStr}`),
      ]);

      if (dayRes.status === "fulfilled") {
        const d = dayRes.value.data?.data || dayRes.value.data;
        setArrivals(d.arrivals || []);
        setDepartures(d.departures || []);
        setCityTransfers(d.cityJobs || d.cityTransfers || []);
      }
      if (vRes.status === "fulfilled") {
        const v = vRes.value.data?.data || vRes.value.data;
        setVehicles(Array.isArray(v) ? v : []);
      }
      if (dRes.status === "fulfilled") {
        const d = dRes.value.data?.data || dRes.value.data;
        setDrivers(Array.isArray(d) ? d : []);
      }
      if (rRes.status === "fulfilled") {
        const r = rRes.value.data?.data || rRes.value.data;
        setReps(Array.isArray(r) ? r : []);
      }
    } catch {
      toast.error("Failed to load dispatch data");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchDay();
  }, [fetchDay]);

  // ── Date navigation ──

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  };
  const goToday = () => setDate(new Date());

  // ── Optimistic helpers ──

  const saveSnapshot = () => {
    prevState.current = {
      arrivals: arrivals.map((j) => ({ ...j, assignment: j.assignment ? { ...j.assignment } : undefined })),
      departures: departures.map((j) => ({ ...j, assignment: j.assignment ? { ...j.assignment } : undefined })),
      cityTransfers: cityTransfers.map((j) => ({ ...j, assignment: j.assignment ? { ...j.assignment } : undefined })),
    };
  };

  const rollback = () => {
    if (prevState.current) {
      setArrivals(prevState.current.arrivals);
      setDepartures(prevState.current.departures);
      setCityTransfers(prevState.current.cityTransfers);
      prevState.current = null;
    }
  };

  const updateJobInList = (
    setter: React.Dispatch<React.SetStateAction<Job[]>>,
    jobId: string,
    updater: (job: Job) => Job
  ) => {
    setter((prev) => prev.map((j) => (j.id === jobId ? updater(j) : j)));
  };

  const findJobList = (
    jobId: string
  ): [Job[], React.Dispatch<React.SetStateAction<Job[]>>] | null => {
    if (arrivals.find((j) => j.id === jobId)) return [arrivals, setArrivals];
    if (departures.find((j) => j.id === jobId))
      return [departures, setDepartures];
    if (cityTransfers.find((j) => j.id === jobId))
      return [cityTransfers, setCityTransfers];
    return null;
  };

  // ── Inline assignment handler ──

  const handleInlineAssign = async (
    job: Job,
    field: EditField,
    value: string
  ) => {
    setActiveCell(null);

    // Handle "none" selection for optional fields
    const actualValue = value === "__none__" ? null : value;

    // For vehicle field on unassigned jobs: full assign (POST)
    if (!job.assignment && field === "vehicle" && actualValue) {
      saveSnapshot();

      // Optimistic: create placeholder assignment
      const vehicle = vehicles.find((v) => v.id === actualValue);
      const found = findJobList(job.id);
      if (found) {
        updateJobInList(found[1], job.id, (j) => ({
          ...j,
          status: "ASSIGNED",
          assignment: {
            id: "__pending__",
            vehicleId: actualValue,
            driverId: null,
            repId: null,
            vehicle: vehicle
              ? {
                  plateNumber: vehicle.plateNumber,
                  vehicleType: vehicle.vehicleType,
                }
              : undefined,
            driver: undefined,
            rep: undefined,
          },
        }));
      }

      try {
        await api.post("/dispatch/assign", {
          trafficJobId: job.id,
          vehicleId: actualValue,
        });
        toast.success("Vehicle assigned");
        fetchDay(); // refresh to get full assignment data
      } catch (err: unknown) {
        rollback();
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || "Assignment failed";
        toast.error(msg);
      }
      return;
    }

    // For reassigning an existing assignment (PATCH)
    if (job.assignment && job.assignment.id !== "__pending__") {
      saveSnapshot();

      // Build optimistic update
      const found = findJobList(job.id);
      if (found) {
        updateJobInList(found[1], job.id, (j) => {
          if (!j.assignment) return j;
          const updated = { ...j, assignment: { ...j.assignment } };
          if (field === "vehicle" && actualValue) {
            const v = vehicles.find((x) => x.id === actualValue);
            updated.assignment.vehicleId = actualValue;
            updated.assignment.vehicle = v
              ? { plateNumber: v.plateNumber, vehicleType: v.vehicleType }
              : updated.assignment.vehicle;
          } else if (field === "driver") {
            updated.assignment.driverId = actualValue;
            updated.assignment.driver = actualValue
              ? { name: drivers.find((d) => d.id === actualValue)?.name || "" }
              : undefined;
          } else if (field === "rep") {
            updated.assignment.repId = actualValue;
            updated.assignment.rep = actualValue
              ? { name: reps.find((r) => r.id === actualValue)?.name || "" }
              : undefined;
          }
          return updated;
        });
      }

      try {
        const payload: Record<string, string | null> = {};
        if (field === "vehicle" && actualValue) payload.vehicleId = actualValue;
        if (field === "driver") payload.driverId = actualValue;
        if (field === "rep") payload.repId = actualValue;

        await api.patch(
          `/dispatch/assignments/${job.assignment.id}`,
          payload
        );
        toast.success(
          `${field.charAt(0).toUpperCase() + field.slice(1)} updated`
        );
      } catch (err: unknown) {
        rollback();
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || "Update failed";
        toast.error(msg);
      }
    }
  };

  // ── Dialog-based assignment (fallback) ──

  const openDialog = (job: Job) => {
    setDialogJob(job);
    setDialogVehicle(job.assignment?.vehicleId || "");
    setDialogDriver(job.assignment?.driverId || "");
    setDialogRep(job.assignment?.repId || "");
  };

  const handleDialogSave = async () => {
    if (!dialogJob || !dialogVehicle) {
      toast.error("Vehicle is required");
      return;
    }
    setDialogSaving(true);
    try {
      if (dialogJob.assignment) {
        // Reassign
        const payload: Record<string, string> = {};
        if (dialogVehicle !== dialogJob.assignment.vehicleId)
          payload.vehicleId = dialogVehicle;
        if (dialogDriver !== (dialogJob.assignment.driverId || ""))
          payload.driverId = dialogDriver;
        if (dialogRep !== (dialogJob.assignment.repId || ""))
          payload.repId = dialogRep;

        if (Object.keys(payload).length > 0) {
          await api.patch(
            `/dispatch/assignments/${dialogJob.assignment.id}`,
            payload
          );
        }
      } else {
        // New assign
        const payload: Record<string, string> = {
          trafficJobId: dialogJob.id,
          vehicleId: dialogVehicle,
        };
        if (dialogDriver) payload.driverId = dialogDriver;
        if (dialogRep) payload.repId = dialogRep;
        await api.post("/dispatch/assign", payload);
      }
      toast.success("Assignment saved");
      setDialogJob(null);
      fetchDay();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Assignment failed";
      toast.error(msg);
    } finally {
      setDialogSaving(false);
    }
  };

  // ── Stats ──

  const totalJobs =
    arrivals.length + departures.length + cityTransfers.length;
  const assignedCount = [...arrivals, ...departures, ...cityTransfers].filter(
    (j) => j.assignment
  ).length;

  // ── Grid props ──

  const gridProps = {
    activeCell,
    vehicles,
    drivers,
    reps,
    onStartEdit: (jobId: string, field: EditField) =>
      setActiveCell({ jobId, field }),
    onCancelEdit: () => setActiveCell(null),
    onInlineAssign: handleInlineAssign,
    onDialogAssign: openDialog,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4 overflow-auto pb-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">
              Dispatch Console
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {assignedCount}/{totalJobs} assigned
            </span>
            <Badge
              variant="outline"
              className={
                assignedCount === totalJobs && totalJobs > 0
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 text-amber-600 dark:text-amber-400"
              }
            >
              {totalJobs > 0
                ? Math.round((assignedCount / totalJobs) * 100)
                : 0}
              %
            </Badge>
          </div>
        </div>

        {/* Date toolbar */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevDay}
            className="h-8 w-8 text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToday}
            className="text-muted-foreground hover:bg-accent"
          >
            Today
          </Button>
          <span className="min-w-[140px] text-center text-lg font-medium text-foreground">
            {date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextDay}
            className="h-8 w-8 text-muted-foreground hover:bg-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Legend + keyboard hints */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Unassigned
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Assigned
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> In Progress
            </span>
          </div>
          <div className="text-xs text-muted-foreground/60">
            Click cells to edit inline &middot; Click ref for full dialog
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/60" />
          </div>
        ) : (
          <Tabs defaultValue="split" className="space-y-4">
            <TabsList className="bg-card border border-border">
              <TabsTrigger
                value="split"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                Split View
              </TabsTrigger>
              <TabsTrigger
                value="arrivals"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                Arrivals ({arrivals.length})
              </TabsTrigger>
              <TabsTrigger
                value="departures"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                Departures ({departures.length})
              </TabsTrigger>
              <TabsTrigger
                value="city"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                Excursion ({cityTransfers.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="split">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Plane className="h-4 w-4" /> Arrivals ({arrivals.length})
                  </h3>
                  <JobGrid
                    jobs={arrivals}
                    title="Arrival"
                    icon={Plane}
                    {...gridProps}
                  />
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <PlaneTakeoff className="h-4 w-4" /> Departures (
                    {departures.length})
                  </h3>
                  <JobGrid
                    jobs={departures}
                    title="Departure"
                    icon={PlaneTakeoff}
                    {...gridProps}
                  />
                </div>
              </div>
              {cityTransfers.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Bus className="h-4 w-4" /> Excursions (
                    {cityTransfers.length})
                  </h3>
                  <JobGrid
                    jobs={cityTransfers}
                    title="Excursion"
                    icon={Bus}
                    {...gridProps}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="arrivals">
              <JobGrid
                jobs={arrivals}
                title="Arrival"
                icon={Plane}
                {...gridProps}
              />
            </TabsContent>

            <TabsContent value="departures">
              <JobGrid
                jobs={departures}
                title="Departure"
                icon={PlaneTakeoff}
                {...gridProps}
              />
            </TabsContent>

            <TabsContent value="city">
              <JobGrid
                jobs={cityTransfers}
                title="Excursion"
                icon={Bus}
                {...gridProps}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Summary Footer */}
      {!loading && (
        <SummaryFooter
          arrivals={arrivals}
          departures={departures}
          cityTransfers={cityTransfers}
        />
      )}

      {/* Full Assignment Dialog (fallback) */}
      <Dialog
        open={!!dialogJob}
        onOpenChange={(open) => !open && setDialogJob(null)}
      >
        <DialogContent className="border-border bg-popover text-foreground">
          <DialogHeader>
            <DialogTitle>
              Assign Job — {dialogJob?.internalRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>
                Type: <b className="text-foreground">{dialogJob?.serviceType}</b>
              </span>
              <span>
                Pax: <b className="text-foreground">{dialogJob?.paxCount}</b>
              </span>
              <span>
                Route:{" "}
                <b className="text-foreground">
                  {dialogJob?.fromZone?.name} → {dialogJob?.toZone?.name}
                </b>
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Car className="h-4 w-4" /> Vehicle *
              </div>
              <Select
                value={dialogVehicle}
                onValueChange={setDialogVehicle}
              >
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.plateNumber} — {v.vehicleType?.name} (
                      {v.vehicleType?.seatCapacity} seats)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> Driver
              </div>
              <Select
                value={dialogDriver}
                onValueChange={setDialogDriver}
              >
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder="Select driver (optional)" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCheck className="h-4 w-4" /> Rep
              </div>
              <Select value={dialogRep} onValueChange={setDialogRep}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder="Select rep (optional)" />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogJob(null)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDialogSave}
              disabled={dialogSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {dialogSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
