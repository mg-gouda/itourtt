"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronDown, Loader2, Phone, Navigation, AlertTriangle, Plane, Banknote, RefreshCw } from "lucide-react";
import { RouteNavLink } from "@/components/route-nav-link";
import { jobNavUrl, type NavJob } from "@/lib/maps-nav";
import { useT } from "@/lib/i18n";
import { statusBadgeClass, useStatusLabel } from "@/lib/status-colors";
import { driverTimeFromDate } from "@/lib/driver-time";
import { formatMoney, formatDateLong, formatTime24 } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rep / driver / supplier portal job view (UI review 1a + 5).
 *
 * Replaces the office JobDetailModal on phones: it was 50vw wide (188px on a
 * 375px phone) with two columns, so values were clipped. This is a full-screen,
 * one-column sheet: the times first and big, warnings (notes / cash) next, then
 * the operational facts with tap-to-call and tap-to-navigate, and one main
 * action at the bottom (passed in by the page — same button as the job card).
 *
 * Data visibility is unchanged: it shows exactly what the portal API returns,
 * as the old modal did. Commercial / bookkeeping fields sit folded under
 * "More details" so they no longer crowd the field view.
 */

interface Place { code?: string; name: string }

interface JobDetail extends NavJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  bookingChannel: string;
  serviceType: string;
  jobDate: string;
  pickUpTime: string | null;
  status: string;
  bookingStatus: string;
  adultCount: number;
  childCount: number;
  paxCount: number;
  clientName: string | null;
  clientMobile: string | null;
  notes: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  transferPrice: number | null;
  transferPriceCurrency: string | null;
  jobExtras?: { name: string; qty: number }[];
  printSign: boolean;
  collectionRequired: boolean;
  collectionAmount: number | null;
  collectionCurrency: string | null;
  agent: { legalName: string; tradeName: string | null } | null;
  customer: { legalName: string } | null;
  originAirport: (Place & { code: string }) | null;
  originZone: Place | null;
  originHotel: Place | null;
  destinationAirport: (Place & { code: string }) | null;
  destinationZone: Place | null;
  destinationHotel: Place | null;
  flight: { flightNo: string; carrier: string | null; terminal: string | null; arrivalTime: string | null; departureTime: string | null } | null;
  assignment: {
    vehicle: { plateNumber: string; vehicleType: { name: string } | null; supplier: { legalName: string; tradeName: string | null } | null } | null;
    driver: { name: string; mobileNumber: string } | null;
    rep: { name: string; mobileNumber: string } | null;
    driverStatus: string | null;
    repStatus: string | null;
  } | null;
  createdBy: { name: string } | null;
  createdAt: string;
}

interface Props {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  /** e.g. "/rep-portal/jobs" */
  apiBase: string;
  /** The status this viewer works with (repStatus / driverStatus). */
  status?: string | null;
  /** Who is looking — decides which "call" buttons make sense. */
  viewer: "rep" | "driver" | "supplier";
  /** The main next-step button (same as on the card). */
  action?: React.ReactNode;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 text-[15px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end font-medium text-foreground break-words">{children}</span>
    </div>
  );
}

function TimeTile({ label, value, sub }: { label: string; value: string | null; sub?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex-1 rounded-xl bg-muted/60 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-bold leading-tight text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CallButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground active:bg-muted"
    >
      <Phone className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}

export function PortalJobSheet({ jobId, open, onClose, apiBase, status, viewer, action }: Props) {
  const t = useT();
  const statusLabel = useStatusLabel();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !jobId) return;
    setJob(null);
    setFailed(false);
    setMoreOpen(false);
    setLoading(true);
    api
      .get(`${apiBase}/${jobId}`)
      .then(({ data }) => setJob(data.data ?? data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [open, jobId, apiBase, attempt]);

  const shownStatus = status ?? job?.status ?? null;
  const isArr = job?.serviceType === "ARR";
  const flightIso = job?.flight ? (isArr ? job.flight.arrivalTime : job.flight.departureTime) : null;
  const jobIso = isArr ? (flightIso ?? job?.pickUpTime ?? null) : (job?.pickUpTime ?? flightIso ?? null);
  const driverAt = driverTimeFromDate(jobIso ? new Date(jobIso) : null);

  const originLabel = job?.originAirport?.code || job?.originHotel?.name || job?.originZone?.name || "—";
  const destLabel = job?.destinationAirport?.code || job?.destinationHotel?.name || job?.destinationZone?.name || "—";
  // Before the job starts you head to the pick-up; afterwards to the drop-off.
  const started = shownStatus === "IN_PLACE" || shownStatus === "IN_PROGRESS";
  const navUrl = job ? jobNavUrl(job, started ? "destination" : "origin") : null;

  const extras: string[] = (job?.jobExtras || []).filter((e) => e.qty > 0).map((e) => `${e.name} ×${e.qty}`);
  if (job?.printSign) extras.push("Print Sign");

  const driver = job?.assignment?.driver;
  const rep = job?.assignment?.rep;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:left-1/2 sm:top-1/2 sm:h-[min(90dvh,860px)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2">
          <button type="button" onClick={onClose} aria-label={t("portal.close")}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground active:bg-muted">
            <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
          </button>
          <DialogTitle className="min-w-0 flex-1 truncate font-mono text-base">{job?.internalRef ?? t("portal.details")}</DialogTitle>
          <DialogDescription className="sr-only">{t("portal.details")}</DialogDescription>
          {shownStatus && (
            <span className={cn("me-2 shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusBadgeClass(shownStatus))}>
              {statusLabel(shownStatus)}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {loading && (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}

          {!loading && failed && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">{t("portal.cantReachOffice")}</p>
              <button type="button" onClick={() => setAttempt((a) => a + 1)}
                className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
                <RefreshCw className="h-4 w-4" /> {t("portal.retry")}
              </button>
            </div>
          )}

          {!loading && job && (
            <div className="space-y-3">
              {/* Times */}
              <div className="flex gap-2">
                <TimeTile label={t("portal.pickup")} value={formatTime24(job.pickUpTime)} />
                {job.flight && (
                  <TimeTile
                    label={isArr ? t("portal.flightLands") : t("portal.flightDeparts")}
                    value={formatTime24(flightIso)}
                    sub={[job.flight.carrier, job.flight.flightNo].filter(Boolean).join(" ") + (job.flight.terminal ? ` · T${job.flight.terminal}` : "")}
                  />
                )}
                {viewer === "driver" && driverAt && (
                  <TimeTile label={t("portal.driverTime")} value={formatTime24(driverAt.toISOString())} />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{formatDateLong(job.jobDate)}</p>

              {/* Warnings first */}
              {job.notes && (
                <div className="flex gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-[15px] text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <p className="whitespace-pre-wrap">{job.notes}</p>
                </div>
              )}
              {job.collectionRequired && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-[15px]">
                  <Banknote className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span className="text-muted-foreground">{t("portal.collectCash")}</span>
                  <span className="ms-auto font-bold text-foreground">{formatMoney(job.collectionAmount ?? 0, job.collectionCurrency)}</span>
                </div>
              )}

              {/* Facts */}
              <div>
                <Row label={t("portal.guest")}>
                  {job.clientName || null}
                  {job.clientName ? " · " : ""}
                  {job.adultCount} {t("portal.adults")}
                  {job.childCount ? ` + ${job.childCount} ${t("portal.child")}` : ""}
                </Row>
                <Row label={t("portal.from")}><RouteNavLink job={job} end="origin">{originLabel}</RouteNavLink></Row>
                <Row label={t("portal.to")}><RouteNavLink job={job} end="destination">{destLabel}</RouteNavLink></Row>
                {job.flight && (
                  <Row label={t("portal.flight")}>
                    <span className="inline-flex items-center gap-1"><Plane className="h-3.5 w-3.5" aria-hidden="true" />
                      {[job.flight.carrier, job.flight.flightNo].filter(Boolean).join(" ")}{job.flight.terminal ? ` · T${job.flight.terminal}` : ""}
                    </span>
                  </Row>
                )}
                <Row label={t("portal.vehicle")}>
                  {job.assignment?.vehicle
                    ? `${job.assignment.vehicle.plateNumber}${job.assignment.vehicle.vehicleType ? ` · ${job.assignment.vehicle.vehicleType.name}` : ""}`
                    : null}
                </Row>
                {viewer !== "driver" && <Row label={t("dispatch.driverName")}>{driver?.name}</Row>}
                {viewer !== "rep" && <Row label={t("reports.repName")}>{rep?.name}</Row>}
                {extras.length > 0 && <Row label={t("portal.extras")}>{extras.join(", ")}</Row>}
              </div>

              {/* Call / navigate */}
              <div className="flex flex-wrap gap-2">
                {viewer !== "driver" && driver?.mobileNumber && <CallButton href={`tel:${driver.mobileNumber}`} label={t("portal.callDriver")} />}
                {viewer !== "rep" && rep?.mobileNumber && <CallButton href={`tel:${rep.mobileNumber}`} label={t("portal.callRep")} />}
                {/* Drivers' cards never offer the guest's number, so no call button for them either. */}
                {viewer !== "driver" && job.clientMobile && <CallButton href={`tel:${job.clientMobile}`} label={t("portal.callGuest")} />}
                {navUrl && (
                  <a href={navUrl} target="_blank" rel="noopener noreferrer"
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground active:bg-muted">
                    <Navigation className="h-4 w-4" aria-hidden="true" /> {t("portal.navigate")}
                  </a>
                )}
              </div>

              {/* Everything else the API returns, folded away */}
              <div className="rounded-xl border border-border">
                <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
                  className="flex h-12 w-full items-center justify-between px-3 text-sm font-semibold text-foreground">
                  {t("portal.moreDetails")}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
                </button>
                {moreOpen && (
                  <div className="px-3 pb-2">
                    <Row label={t("reports.agentRef")}>{job.agentRef}</Row>
                    <Row label={t("agents.legalName")}>{job.agent?.tradeName ?? job.agent?.legalName}</Row>
                    <Row label={t("dispatch.supplier")}>{job.assignment?.vehicle?.supplier?.tradeName ?? job.assignment?.vehicle?.supplier?.legalName}</Row>
                    {/* Owner, 2026-11-25: none of these for drivers (the driver API no longer sends them either). */}
                    {viewer !== "driver" && (
                      <>
                        <Row label={t("common.mobile")}>{job.clientMobile}</Row>
                        {job.transferPrice != null && <Row label={t("jobs.transferPrice")}>{formatMoney(job.transferPrice, job.transferPriceCurrency)}</Row>}
                        {job.priceAmount != null && <Row label={t("reports.applicationPrice")}>{formatMoney(job.priceAmount, job.priceCurrency)}</Row>}
                        <Row label={t("reports.driverJobStatus")}>{job.assignment?.driverStatus ? statusLabel(job.assignment.driverStatus) : null}</Row>
                        <Row label={t("reports.repJobStatus")}>{job.assignment?.repStatus ? statusLabel(job.assignment.repStatus) : null}</Row>
                        <Row label={t("common.createdBy")}>{job.createdBy?.name}</Row>
                        {job.createdAt && <Row label={t("common.createdAt")}>{formatDateLong(job.createdAt)}</Row>}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main action */}
        {action && job && (
          <div className="shrink-0 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {action}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
