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
  Truck,
  Users,
  UserCheck,
  Download,
  Lock,
  LockOpen,
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
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { usePermission } from "@/hooks/use-permission";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface Job {
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
  custRepName: string | null;
  custRepMobile: string | null;
  custRepMeetingPoint: string | null;
  custRepMeetingTime: string | null;
  dispatchUnlockedAt: string | null;
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  originAirport?: { name: string; code: string } | null;
  originZone?: { name: string } | null;
  originHotel?: { name: string } | null;
  destinationAirport?: { name: string; code: string } | null;
  destinationZone?: { name: string } | null;
  destinationHotel?: { name: string } | null;
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
    driver?: { name: string; mobileNumber?: string };
    rep?: { name: string };
  } | null;
}

interface SupplierResource {
  id: string;
  legalName: string;
  tradeName: string | null;
  vehicleCount: number;
}

interface VehicleResource {
  id: string;
  plateNumber: string;
  vehicleType?: { name: string; seatCapacity: number };
  supplierId?: string | null;
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
}

interface PersonResource {
  id: string;
  name: string;
  mobileNumber?: string;
  supplierId?: string | null;
}

type EditField = "source" | "vehicle" | "driver" | "rep";

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

function fmtTime(iso: string | undefined, locale = "en-US") {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

// ────────────────────────────────────────────
// Editable Cell
// ────────────────────────────────────────────

function EditableSourceCell({
  job,
  vehicles,
  suppliers,
  selectedSource,
  isEditing,
  onStartEdit,
  onSelect,
  onCancel,
  cellRef,
  locked,
}: {
  job: Job;
  vehicles: VehicleResource[];
  suppliers: SupplierResource[];
  selectedSource: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSelect: (source: string) => void;
  onCancel: () => void;
  cellRef: (el: HTMLTableCellElement | null) => void;
  locked?: boolean;
}) {
  const t = useT();
  const ownedCount = vehicles.filter((v) => !v.supplierId).length;

  // Derive display label for the current source
  const sourceLabel = selectedSource === "owned"
    ? t("dispatch.ownedVehicles")
    : selectedSource
      ? (suppliers.find((s) => s.id === selectedSource)?.tradeName ||
         suppliers.find((s) => s.id === selectedSource)?.legalName || "—")
      : "";

  if (locked) {
    return (
      <TableCell ref={cellRef} className="text-sm text-muted-foreground">
        {sourceLabel || "—"}
      </TableCell>
    );
  }

  if (isEditing) {
    return (
      <TableCell ref={cellRef} className="p-1">
        <Select
          defaultOpen
          value={selectedSource}
          onValueChange={(val) => onSelect(val)}
          onOpenChange={(open) => {
            if (!open) onCancel();
          }}
        >
          <SelectTrigger className="h-7 w-full border-border bg-secondary text-foreground text-xs">
            <SelectValue placeholder={t("dispatch.selectSource")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-foreground max-h-60">
            <SelectItem value="owned" className="text-xs font-medium">
              {t("dispatch.ownedVehicles")} ({ownedCount})
            </SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.tradeName || s.legalName} ({s.vehicleCount})
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
      {sourceLabel ? (
        <span className="text-muted-foreground text-xs">{sourceLabel}</span>
      ) : (
        <span className="text-orange-600 dark:text-orange-400 text-xs">{t("dispatch.selectSource")}</span>
      )}
    </TableCell>
  );
}

function EditableVehicleCell({
  job,
  vehicles,
  selectedSource,
  isEditing,
  onStartEdit,
  onSelect,
  onCancel,
  cellRef,
  locked,
}: {
  job: Job;
  vehicles: VehicleResource[];
  selectedSource: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSelect: (vehicleId: string) => void;
  onCancel: () => void;
  cellRef: (el: HTMLTableCellElement | null) => void;
  locked?: boolean;
}) {
  const t = useT();
  const current = job.assignment?.vehicle;

  // Filter vehicles based on the source column selection
  const filteredVehicles = selectedSource === "owned"
    ? vehicles.filter((v) => !v.supplierId)
    : selectedSource
      ? vehicles.filter((v) => v.supplierId === selectedSource)
      : vehicles;

  if (locked) {
    return (
      <TableCell ref={cellRef} className="text-sm">
        {current ? (
          <Badge variant="outline" className="border-zinc-500/30 text-zinc-600 dark:text-zinc-400">
            {current.plateNumber}
          </Badge>
        ) : (
          <span className="text-muted-foreground/60 text-xs">—</span>
        )}
      </TableCell>
    );
  }

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
            <SelectValue placeholder={t("dispatch.select")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-foreground max-h-60">
            {filteredVehicles.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("dispatch.noVehiclesAvailable")}</div>
            ) : (
              filteredVehicles.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.plateNumber} — {v.vehicleType?.name} (
                  {v.vehicleType?.seatCapacity})
                </SelectItem>
              ))
            )}
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
        <span className="text-red-600 dark:text-red-400 text-xs">{t("dispatch.clickToAssign")}</span>
      )}
    </TableCell>
  );
}

function EditablePersonCell({
  job,
  field,
  resources,
  selectedSource,
  isEditing,
  onStartEdit,
  onSelect,
  onCancel,
  cellRef,
  locked,
}: {
  job: Job;
  field: "driver" | "rep";
  resources: PersonResource[];
  selectedSource?: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSelect: (id: string) => void;
  onCancel: () => void;
  cellRef: (el: HTMLTableCellElement | null) => void;
  locked?: boolean;
}) {
  const t = useT();
  const currentId =
    field === "driver" ? job.assignment?.driverId : job.assignment?.repId;
  const currentName =
    field === "driver"
      ? job.assignment?.driver?.name
      : job.assignment?.rep?.name;
  const canEdit = !locked && !!job.assignment; // must have vehicle first, and not locked

  // Filter drivers by source (owned vs supplier), reps show all
  const filteredResources = field === "driver" && selectedSource
    ? selectedSource === "owned"
      ? resources.filter((r) => !r.supplierId)
      : resources.filter((r) => r.supplierId === selectedSource)
    : resources;

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
            <SelectValue placeholder={t("dispatch.select")} />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-foreground max-h-60">
            <SelectItem value="__none__" className="text-xs text-muted-foreground">
              {t("dispatch.none")}
            </SelectItem>
            {filteredResources.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("dispatch.noDriversAvailable")}</div>
            ) : (
              filteredResources.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.name}
                </SelectItem>
              ))
            )}
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
      {currentName ? (
        <div>
          <span>{currentName}</span>
          {field === "driver" && job.assignment?.driver?.mobileNumber && (
            <div className="text-[10px] text-muted-foreground/70 font-mono">{job.assignment.driver.mobileNumber}</div>
          )}
        </div>
      ) : (
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
  const t = useT();
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
            {t("dispatch.total")}{" "}
            <span className="font-medium text-foreground">{total}</span>
          </span>
          <span>
            {t("dispatch.arr")}{" "}
            <span className="font-medium text-foreground">{arrivals.length}</span>
          </span>
          <span>
            {t("dispatch.dep")}{" "}
            <span className="font-medium text-foreground">
              {departures.length}
            </span>
          </span>
          <span>
            {t("dispatch.excursionLabel")}{" "}
            <span className="font-medium text-foreground">
              {cityTransfers.length}
            </span>
          </span>
          <span className="border-l border-border pl-6">
            {t("dispatch.paxLabel")}{" "}
            <span className="font-medium text-foreground">{totalPax}</span>
          </span>
        </div>
        <div className="flex gap-6 text-muted-foreground">
          <span>
            {t("dispatch.assignedLabel")}{" "}
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {assigned}/{total}
            </span>
          </span>
          <span>
            {t("dispatch.pendingLabel")}{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">{pending}</span>
          </span>
          <span>
            {t("dispatch.completedLabel")}{" "}
            <span className="font-medium text-blue-600 dark:text-blue-400">{completed}</span>
          </span>
          <span className="border-l border-border pl-6">
            {t("dispatch.rate")}{" "}
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
  suppliers,
  drivers,
  reps,
  onStartEdit,
  onCancelEdit,
  onInlineAssign,
  onDialogAssign,
  locked,
  showLockColumn,
  canUnlock,
  onToggleLock,
}: {
  jobs: Job[];
  title: string;
  icon: React.ElementType;
  activeCell: ActiveCell | null;
  vehicles: VehicleResource[];
  suppliers: SupplierResource[];
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
  locked?: boolean;
  showLockColumn?: boolean;
  canUnlock?: boolean;
  onToggleLock?: (jobId: string, unlock: boolean) => void;
}) {
  const t = useT();
  const locale = useLocaleId();
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  // Per-job source selection state (keyed by jobId)
  const [jobSources, setJobSources] = useState<Record<string, string>>({});

  // Derive initial sources from existing vehicle assignments
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const job of jobs) {
      if (job.assignment?.vehicleId) {
        const v = vehicles.find((veh) => veh.id === job.assignment?.vehicleId);
        if (v) {
          initial[job.id] = v.supplierId || "owned";
        }
      }
    }
    setJobSources((prev) => ({ ...initial, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, vehicles]);

  const setJobSource = (jobId: string, source: string) => {
    setJobSources((prev) => ({ ...prev, [jobId]: source }));
  };

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
      const fields: EditField[] = ["source", "vehicle", "driver", "rep"];
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
          <p className="text-sm">{t(`dispatch.no${title}Jobs`)}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border bg-gray-700/75 dark:bg-gray-800/75">
            {showLockColumn && <TableHead className="text-white text-xs w-8" />}
            <TableHead className="text-white text-xs w-28">{t("dispatch.ref")}</TableHead>
            <TableHead className="text-white text-xs">{t("dispatch.agent")}</TableHead>
            <TableHead className="text-white text-xs">{t("dispatch.route")}</TableHead>
            <TableHead className="text-white text-xs w-14">{t("dispatch.pax")}</TableHead>
            <TableHead className="text-white text-xs">{t("dispatch.flight")}</TableHead>
            <TableHead className="text-white text-xs w-36">{t("dispatch.carSource")}</TableHead>
            <TableHead className="text-white text-xs w-36">{t("dispatch.vehicle")}</TableHead>
            <TableHead className="text-white text-xs w-32">{t("dispatch.driver")}</TableHead>
            <TableHead className="text-white text-xs w-32">{t("dispatch.rep")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job, idx) => {
            const isJobLocked = locked && !job.dispatchUnlockedAt;
            const isEditable =
              !isJobLocked && (job.status === "PENDING" || job.status === "ASSIGNED");
            const stripe = idx % 2 === 0 ? "bg-gray-100/25 dark:bg-gray-800/25" : "bg-gray-200/50 dark:bg-gray-700/50";
            const jobSource = jobSources[job.id] || "";

            return (
              <TableRow
                key={job.id}
                className={`border-border ${statusRowClass[job.status] || stripe}`}
              >
                {showLockColumn && (
                  <TableCell className="w-8 px-1">
                    {canUnlock && onToggleLock ? (
                      <button
                        type="button"
                        onClick={() => onToggleLock(job.id, !job.dispatchUnlockedAt)}
                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted/50 transition-colors"
                        title={job.dispatchUnlockedAt ? t("dispatch.lockJob") : t("dispatch.unlockJob")}
                      >
                        {job.dispatchUnlockedAt ? (
                          <LockOpen className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </button>
                    ) : (
                      job.dispatchUnlockedAt ? (
                        <LockOpen className="h-3.5 w-3.5 text-emerald-500/60 mx-auto" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-amber-500/60 mx-auto" />
                      )
                    )}
                  </TableCell>
                )}
                <TableCell
                  className="text-foreground font-mono text-xs cursor-pointer"
                  onClick={() => isEditable && onDialogAssign(job)}
                  title={t("dispatch.fullAssignTitle")}
                >
                  {job.internalRef}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {job.bookingChannel === "ONLINE"
                    ? job.agent?.legalName || "—"
                    : job.customer?.legalName || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {job.originAirport?.code || job.fromZone?.name || job.originZone?.name || job.originHotel?.name || "\u2014"} → {job.destinationAirport?.code || job.toZone?.name || job.destinationZone?.name || job.destinationHotel?.name || "\u2014"}
                </TableCell>
                <TableCell className="text-muted-foreground text-center">
                  {job.paxCount}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {job.flight
                    ? `${job.flight.flightNo} ${fmtTime(job.flight.arrivalTime || job.flight.departureTime, locale)}`
                    : "—"}
                </TableCell>

                {isEditable ? (
                  <>
                    <EditableSourceCell
                      job={job}
                      vehicles={vehicles}
                      suppliers={suppliers}
                      selectedSource={jobSource}
                      isEditing={
                        activeCell?.jobId === job.id &&
                        activeCell?.field === "source"
                      }
                      onStartEdit={() => onStartEdit(job.id, "source")}
                      onSelect={(val) => {
                        setJobSource(job.id, val);
                        onCancelEdit();
                      }}
                      onCancel={onCancelEdit}
                      cellRef={setCellRef(job.id, "source")}
                      locked={isJobLocked}
                    />
                    <EditableVehicleCell
                      job={job}
                      vehicles={vehicles}
                      selectedSource={jobSource}
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
                      locked={isJobLocked}
                    />
                    <EditablePersonCell
                      job={job}
                      field="driver"
                      resources={drivers}
                      selectedSource={jobSource}
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
                      locked={isJobLocked}
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
                      locked={isJobLocked}
                    />
                  </>
                ) : (
                  <>
                    <TableCell className="text-sm text-muted-foreground">
                      {(() => {
                        const v = job.assignment?.vehicleId
                          ? vehicles.find((veh) => veh.id === job.assignment?.vehicleId)
                          : null;
                        if (!v) return "—";
                        if (!v.supplierId) return t("dispatch.ownedVehicles");
                        const s = suppliers.find((sup) => sup.id === v.supplierId);
                        return s?.tradeName || s?.legalName || "—";
                      })()}
                    </TableCell>
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
                      {job.assignment?.driver?.name ? (
                        <div>
                          <span>{job.assignment.driver.name}</span>
                          {job.assignment.driver.mobileNumber && (
                            <div className="text-[10px] text-muted-foreground/70 font-mono">{job.assignment.driver.mobileNumber}</div>
                          )}
                        </div>
                      ) : "—"}
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
    </div>
  );
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export default function DispatchPage() {
  const t = useT();
  const locale = useLocaleId();
  const { user } = useAuthStore();
  const [date, setDate] = useState(new Date());
  const [arrivals, setArrivals] = useState<Job[]>([]);
  const [departures, setDepartures] = useState<Job[]>([]);
  const [cityTransfers, setCityTransfers] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Available resources for the day (pre-fetched)
  const [suppliers, setSuppliers] = useState<SupplierResource[]>([]);
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
  const [dialogSupplier, setDialogSupplier] = useState("");
  const [dialogVehicle, setDialogVehicle] = useState("");
  const [dialogDriver, setDialogDriver] = useState("");
  const [dialogRep, setDialogRep] = useState("");
  const [dialogSaving, setDialogSaving] = useState(false);

  // Filtered vehicles for dialog based on owned/supplier selection
  const dialogFilteredVehicles = dialogSupplier === "owned"
    ? vehicles.filter((v) => !v.supplierId)
    : dialogSupplier
      ? vehicles.filter((v) => v.supplierId === dialogSupplier)
      : [];

  // ── Fetch day data + available resources ──

  const fetchDay = useCallback(async () => {
    setLoading(true);
    const dateStr = fmtDate(date);
    try {
      const [dayRes, sRes, vRes, dRes, rRes] = await Promise.allSettled([
        api.get(`/dispatch/day?date=${dateStr}`),
        api.get(`/dispatch/available-suppliers`),
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
      if (sRes.status === "fulfilled") {
        const s = sRes.value.data?.data || sRes.value.data;
        setSuppliers(Array.isArray(s) ? s : []);
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
      toast.error(t("dispatch.failedLoad"));
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

  const exportExcel = async () => {
    setExporting(true);
    try {
      const dateStr = fmtDate(date);
      const res = await api.get(`/export/odoo/dispatch?date=${dateStr}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `dispatch_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t("dispatch.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

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
        toast.success(t("dispatch.vehicleAssigned"));
        fetchDay(); // refresh to get full assignment data
      } catch (err: unknown) {
        rollback();
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || t("dispatch.assignmentFailed");
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
            const driverRes = drivers.find((d) => d.id === actualValue);
            updated.assignment.driver = actualValue
              ? { name: driverRes?.name || "", mobileNumber: driverRes?.mobileNumber }
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
        toast.success(t(`dispatch.${field}Updated`));
      } catch (err: unknown) {
        rollback();
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || t("dispatch.updateFailed");
        toast.error(msg);
      }
    }
  };

  // ── Dialog-based assignment (fallback) ──

  const openDialog = (job: Job) => {
    if (dispatcherLocked && !job.dispatchUnlockedAt) return;
    setDialogJob(job);
    // Pre-select source: owned vs supplier based on current vehicle
    const currentVehicle = job.assignment?.vehicleId
      ? vehicles.find((v) => v.id === job.assignment?.vehicleId)
      : null;
    setDialogSupplier(currentVehicle ? (currentVehicle.supplierId || "owned") : "");
    setDialogVehicle(job.assignment?.vehicleId || "");
    setDialogDriver(job.assignment?.driverId || "");
    setDialogRep(job.assignment?.repId || "");
  };

  const handleDialogSave = async () => {
    if (!dialogJob || !dialogVehicle) {
      toast.error(t("dispatch.vehicleRequired"));
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
      toast.success(t("dispatch.assignmentSaved"));
      setDialogJob(null);
      fetchDay();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("dispatch.assignmentFailed");
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

  // ── Dispatcher 48-hour lock ──

  const isDispatcher = user?.role === "DISPATCHER" || user?.roleSlug === "dispatcher";
  const isPast48h = new Date() > new Date(date.getTime() + FORTY_EIGHT_HOURS_MS);
  const dispatcherLocked = isDispatcher && isPast48h;
  const canUnlock = usePermission("dispatch.assignment.unlock48h");

  const handleToggleLock = async (jobId: string, shouldUnlock: boolean) => {
    try {
      if (shouldUnlock) {
        await api.post(`/dispatch/jobs/${jobId}/unlock`);
        toast.success(t("dispatch.jobUnlocked"));
      } else {
        await api.post(`/dispatch/jobs/${jobId}/lock`);
        toast.success(t("dispatch.jobLocked"));
      }
      fetchDay();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || t("dispatch.lockToggleFailed");
      toast.error(msg);
    }
  };

  // ── Grid props ──

  const showLockColumn = isPast48h;

  const gridProps = {
    activeCell,
    vehicles,
    suppliers,
    drivers,
    reps,
    onStartEdit: (jobId: string, field: EditField) =>
      setActiveCell({ jobId, field }),
    onCancelEdit: () => setActiveCell(null),
    onInlineAssign: handleInlineAssign,
    onDialogAssign: openDialog,
    locked: dispatcherLocked,
    showLockColumn,
    canUnlock: canUnlock && isPast48h,
    onToggleLock: handleToggleLock,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-4 overflow-auto pb-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dispatch.title")}
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {assignedCount}/{totalJobs} {t("dispatch.assigned")}
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
            className="h-8 w-8 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToday}
            className="text-muted-foreground"
          >
            {t("dispatch.today")}
          </Button>
          <span className="min-w-[140px] text-center text-lg font-medium text-foreground">
            {formatDate(date)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextDay}
            className="h-8 w-8 text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={exporting || loading}
              className="gap-1.5 text-muted-foreground"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("dispatch.exportExcel")}
            </Button>
          </div>
        </div>

        {/* Legend + keyboard hints */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {t("dispatch.unassigned")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("dispatch.assigned")}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" /> {t("dispatch.inProgress")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground/60">
            {t("dispatch.clickCells")} &middot; {t("dispatch.clickRefDialog")}
          </div>
        </div>

        {dispatcherLocked && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
            {t("dispatch.lockedBanner")}
          </div>
        )}

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
                {t("dispatch.splitView")}
              </TabsTrigger>
              <TabsTrigger
                value="arrivals"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                {t("dispatch.arrivals")} ({arrivals.length})
              </TabsTrigger>
              <TabsTrigger
                value="departures"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                {t("dispatch.departures")} ({departures.length})
              </TabsTrigger>
              <TabsTrigger
                value="city"
                className="data-[state=active]:bg-accent text-muted-foreground data-[state=active]:text-accent-foreground"
              >
                {t("dispatch.excursion")} ({cityTransfers.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="split">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Plane className="h-4 w-4" /> {t("dispatch.arrivals")} ({arrivals.length})
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
                    <PlaneTakeoff className="h-4 w-4" /> {t("dispatch.departures")} (
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
                    <Bus className="h-4 w-4" /> {t("dispatch.excursion")} (
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
              {t("dispatch.assignJob")} — {dialogJob?.internalRef}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>
                {t("dispatch.type")} <b className="text-foreground">{dialogJob?.serviceType}</b>
              </span>
              <span>
                {t("dispatch.paxLabel")} <b className="text-foreground">{dialogJob?.paxCount}</b>
              </span>
              <span>
                {t("dispatch.routeLabel")}{" "}
                <b className="text-foreground">
                  {dialogJob?.originAirport?.code || dialogJob?.fromZone?.name || dialogJob?.originZone?.name || dialogJob?.originHotel?.name || "\u2014"} → {dialogJob?.destinationAirport?.code || dialogJob?.toZone?.name || dialogJob?.destinationZone?.name || dialogJob?.destinationHotel?.name || "\u2014"}
                </b>
              </span>
            </div>

            {/* Customer Rep Meeting Info */}
            {(dialogJob?.custRepName || dialogJob?.custRepMobile || dialogJob?.custRepMeetingPoint || dialogJob?.custRepMeetingTime) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {dialogJob.custRepName && (
                  <span>{t("jobs.custRepName")}: <b className="text-foreground">{dialogJob.custRepName}</b></span>
                )}
                {dialogJob.custRepMobile && (
                  <span>{t("jobs.custRepMobile")}: <b className="text-foreground">{dialogJob.custRepMobile}</b></span>
                )}
                {dialogJob.custRepMeetingPoint && (
                  <span>{t("jobs.custRepMeetingPoint")}: <b className="text-foreground">{dialogJob.custRepMeetingPoint}</b></span>
                )}
                {dialogJob.custRepMeetingTime && (
                  <span>{t("jobs.custRepMeetingTime")}: <b className="text-foreground">{new Date(dialogJob.custRepMeetingTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b></span>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Truck className="h-4 w-4" /> {t("dispatch.vehicleSource")}
              </div>
              <Select
                value={dialogSupplier}
                onValueChange={(val) => {
                  setDialogSupplier(val);
                  setDialogVehicle(""); // reset vehicle when source changes
                  setDialogDriver(""); // reset driver when source changes
                }}
              >
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("dispatch.selectSource")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  <SelectItem value="owned" className="font-medium">
                    {t("dispatch.ownedVehicles")} ({vehicles.filter((v) => !v.supplierId).length})
                  </SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.tradeName || s.legalName} ({s.vehicleCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Car className="h-4 w-4" /> {t("dispatch.vehicle")} *
              </div>
              <Select
                value={dialogVehicle}
                onValueChange={setDialogVehicle}
              >
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("dispatch.selectVehicle")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {dialogFilteredVehicles.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("dispatch.noVehiclesAvailable")}</div>
                  ) : (
                    dialogFilteredVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plateNumber} — {v.vehicleType?.name} (
                        {v.vehicleType?.seatCapacity} {t("dispatch.seats")})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> {t("dispatch.driver")}
              </div>
              <Select
                value={dialogDriver}
                onValueChange={setDialogDriver}
              >
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("dispatch.selectDriver")} />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-foreground">
                  {(() => {
                    const filtered = dialogSupplier === "owned"
                      ? drivers.filter((d) => !d.supplierId)
                      : dialogSupplier
                        ? drivers.filter((d) => d.supplierId === dialogSupplier)
                        : drivers;
                    return filtered.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("dispatch.noDriversAvailable")}</div>
                    ) : (
                      filtered.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCheck className="h-4 w-4" /> {t("dispatch.rep")}
              </div>
              <Select value={dialogRep} onValueChange={setDialogRep}>
                <SelectTrigger className="border-border bg-card text-foreground">
                  <SelectValue placeholder={t("dispatch.selectRep")} />
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
              className="text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleDialogSave}
              disabled={dialogSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {dialogSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("dispatch.saveAssignment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
