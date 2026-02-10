"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plane,
  MapPin,
  Users,
  Car,
  Clock,
  CheckCircle2,
  XCircle,
  UserX,
  Bell,
  CalendarDays,
  Loader2,
  RefreshCw,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { NoShowEvidenceDialog } from "@/components/no-show-evidence-dialog";
import { useT, useLocaleId } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { captureGPS } from "@/lib/gps";

interface RepJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  serviceType: string;
  jobDate: string;
  status: string;
  repStatus: string;
  paxCount: number;
  notes: string | null;
  custRepName: string | null;
  custRepMobile: string | null;
  custRepMeetingPoint: string | null;
  custRepMeetingTime: string | null;
  fromZone?: { name: string };
  toZone?: { name: string };
  originAirport?: { name: string; code: string } | null;
  originZone?: { name: string } | null;
  originHotel?: { name: string } | null;
  destinationAirport?: { name: string; code: string } | null;
  destinationZone?: { name: string } | null;
  destinationHotel?: { name: string } | null;
  flight?: {
    flightNo: string;
    carrier: string;
    terminal: string | null;
    arrivalTime: string | null;
    departureTime: string | null;
  };
  agent?: { legalName: string };
  customer?: { legalName: string };
  assignment?: {
    vehicle?: { plateNumber: string; vehicleType?: { name: string } };
    driver?: { name: string; mobileNumber: string };
  };
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  trafficJob?: {
    internalRef: string;
    serviceType: string;
    jobDate: string;
  };
}

const SERVICE_TYPE_COLORS: Record<string, string> = {
  ARR: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DEP: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  EXCURSION: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  ASSIGNED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  IN_PROGRESS: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  COMPLETED: "bg-green-500/10 text-green-400 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
  NO_SHOW: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export default function RepDashboardPage() {
  const t = useT();
  const locale = useLocaleId();
  const [jobs, setJobs] = useState<RepJob[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    jobId: string;
    jobRef: string;
    status: string;
  }>({ open: false, jobId: "", jobRef: "", status: "" });
  const [updating, setUpdating] = useState(false);
  const [noShowDialog, setNoShowDialog] = useState<{
    open: boolean;
    jobId: string;
    jobRef: string;
  }>({ open: false, jobId: "", jobRef: "" });
  const [today] = useState(() => new Date().toISOString().split("T")[0]);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await api.get("/rep-portal/jobs", {
        params: { date: today },
      });
      setJobs(data.data?.jobs ?? []);
    } catch {
      toast.error(t("portal.failedLoadJobs"));
    }
  }, [today]);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/rep-portal/notifications");
      setNotifications(data.data?.notifications ?? []);
      setUnreadCount(data.data?.unreadCount ?? 0);
    } catch {
      // ignore
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchJobs(), fetchNotifications()]);
    setLoading(false);
  }, [fetchJobs, fetchNotifications]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleStatusChange = (jobId: string, jobRef: string, status: string) => {
    if (status === "NO_SHOW") {
      setNoShowDialog({ open: true, jobId, jobRef });
      return;
    }
    setConfirmDialog({ open: true, jobId, jobRef, status });
  };

  const confirmStatusChange = async () => {
    setUpdating(true);
    try {
      toast.info("Capturing location...");
      const gps = await captureGPS();
      await api.patch(`/rep-portal/jobs/${confirmDialog.jobId}/status`, {
        status: confirmDialog.status,
        latitude: gps.lat,
        longitude: gps.lng,
      });
      toast.success(`Job ${confirmDialog.jobRef} marked as ${confirmDialog.status.replace("_", " ")}`);
      setConfirmDialog({ open: false, jobId: "", jobRef: "", status: "" });
      fetchJobs();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || (err instanceof Error ? err.message : t("portal.failedUpdateStatus"));
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await api.patch(`/rep-portal/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/rep-portal/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return null;
    return new Date(isoString).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const activeJobs = jobs.filter((j) => !TERMINAL_STATUSES.includes(j.repStatus));
  const completedJobs = jobs.filter((j) => TERMINAL_STATUSES.includes(j.repStatus));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("portal.myJobs")}</h1>
          <p className="text-sm text-muted-foreground">
            <CalendarDays className="mr-1 inline h-4 w-4" />
            {t("portal.today")} &mdash;{" "}
            {formatDate(today)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {t("portal.refresh")}
        </Button>
      </div>

      {/* Active Jobs */}
      {activeJobs.length === 0 && completedJobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {t("portal.noJobs")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t("portal.active")} ({activeJobs.length})
              </h2>
              <div className="grid gap-3">
                {activeJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onStatusChange={handleStatusChange}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </div>
          )}

          {completedJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {t("portal.completedClosed")} ({completedJobs.length})
              </h2>
              <div className="grid gap-3">
                {completedJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onStatusChange={handleStatusChange}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Notifications */}
      <div className="space-y-3" id="notifications">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            <Bell className="mr-1 inline h-4 w-4" />
            {t("portal.notifications")}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {unreadCount}
              </Badge>
            )}
          </h2>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              {t("portal.markAllRead")}
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t("portal.noNotifications")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={`cursor-pointer transition-colors ${!n.isRead ? "border-primary/30 bg-primary/5" : ""}`}
                onClick={() => !n.isRead && markNotificationRead(n.id)}
              >
                <CardContent className="flex items-start gap-3 py-3">
                  <Bell
                    className={`mt-0.5 h-4 w-4 shrink-0 ${!n.isRead ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      {new Date(n.createdAt).toLocaleString(locale)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Status Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, jobId: "", jobRef: "", status: "" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.confirmStatusChange")}</DialogTitle>
            <DialogDescription>
              {t("portal.confirmStatusMsg")}{" "}
              <span className="font-semibold">{confirmDialog.jobRef}</span> {t("portal.as")}{" "}
              <span className="font-semibold">
                {confirmDialog.status.replace("_", " ")}
              </span>
              {t("portal.cannotBeUndone")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog({ open: false, jobId: "", jobRef: "", status: "" })
              }
              disabled={updating}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={updating}
              variant={confirmDialog.status === "COMPLETED" ? "default" : "destructive"}
            >
              {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("portal.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Show Evidence Dialog */}
      <NoShowEvidenceDialog
        open={noShowDialog.open}
        onOpenChange={(open) => {
          if (!open) setNoShowDialog({ open: false, jobId: "", jobRef: "" });
        }}
        jobId={noShowDialog.jobId}
        jobRef={noShowDialog.jobRef}
        portalApiBase="/rep-portal"
        onSuccess={fetchJobs}
      />
    </div>
  );
}

function JobCard({
  job,
  onStatusChange,
  formatTime,
}: {
  job: RepJob;
  onStatusChange: (jobId: string, jobRef: string, status: string) => void;
  formatTime: (iso: string | null) => string | null;
}) {
  const t = useT();
  const repStatus = job.repStatus;
  const isTerminal = TERMINAL_STATUSES.includes(repStatus);
  const flightTime =
    job.serviceType === "ARR"
      ? formatTime(job.flight?.arrivalTime ?? null)
      : formatTime(job.flight?.departureTime ?? null);

  return (
    <Card className={isTerminal ? "opacity-60" : ""}>
      <CardContent className="p-4">
        {/* Top row: ref + badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            {job.internalRef}
          </span>
          <Badge
            variant="outline"
            className={SERVICE_TYPE_COLORS[job.serviceType] || ""}
          >
            {job.serviceType}
          </Badge>
          <Badge
            variant="outline"
            className={STATUS_COLORS[repStatus] || ""}
          >
            {repStatus.replace("_", " ")}
          </Badge>
          {(job.agent || job.customer) && (
            <span className="ml-auto text-xs text-muted-foreground">
              {job.agent?.legalName || job.customer?.legalName}
            </span>
          )}
        </div>

        {/* Flight info */}
        {job.flight && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Plane className="h-3.5 w-3.5" />
              {job.flight.carrier} {job.flight.flightNo}
            </span>
            {job.flight.terminal && <span>T{job.flight.terminal}</span>}
            {flightTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {flightTime}
              </span>
            )}
          </div>
        )}

        {/* Route */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {job.originAirport?.code || job.fromZone?.name || job.originZone?.name || job.originHotel?.name || "—"} &rarr; {job.destinationAirport?.code || job.toZone?.name || job.destinationZone?.name || job.destinationHotel?.name || "—"}
          </span>
        </div>

        {/* Pax + vehicle + driver */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {job.paxCount} {t("portal.pax")}
          </span>
          {job.assignment?.vehicle && (
            <span className="flex items-center gap-1">
              <Car className="h-3.5 w-3.5" />
              {job.assignment.vehicle.plateNumber}
              {job.assignment.vehicle.vehicleType && (
                <span className="text-xs">
                  ({job.assignment.vehicle.vehicleType.name})
                </span>
              )}
            </span>
          )}
          {job.assignment?.driver && (
            <span className="text-xs">
              {t("portal.driverLabel")} {job.assignment.driver.name} ({job.assignment.driver.mobileNumber})
            </span>
          )}
        </div>

        {/* Customer Rep Meeting Info */}
        {(job.custRepName || job.custRepMobile || job.custRepMeetingPoint || job.custRepMeetingTime) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {job.custRepName && <span>{t("jobs.custRepName")}: <b className="text-foreground">{job.custRepName}</b></span>}
            {job.custRepMobile && (
              <a href={`tel:${job.custRepMobile}`} className="text-blue-400 underline">
                {job.custRepMobile}
              </a>
            )}
            {job.custRepMeetingPoint && <span>{t("jobs.custRepMeetingPoint")}: <b className="text-foreground">{job.custRepMeetingPoint}</b></span>}
            {job.custRepMeetingTime && <span>{t("jobs.custRepMeetingTime")}: <b className="text-foreground">{new Date(job.custRepMeetingTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b></span>}
          </div>
        )}

        {/* Notes */}
        {job.notes && (
          <p className="mt-2 text-xs text-muted-foreground/70 italic">
            {job.notes}
          </p>
        )}

        {/* Action buttons */}
        {!isTerminal && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={() => onStatusChange(job.id, job.internalRef, "COMPLETED")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("portal.complete")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-orange-400 hover:text-orange-300"
              onClick={() => onStatusChange(job.id, job.internalRef, "NO_SHOW")}
            >
              <UserX className="h-3.5 w-3.5" />
              {t("portal.noShow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onStatusChange(job.id, job.internalRef, "CANCELLED")}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("portal.cancelJob")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

