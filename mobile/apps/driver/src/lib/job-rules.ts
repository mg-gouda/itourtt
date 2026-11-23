import { formatTimeCairo, tf, type DriverPortalJob } from '@itour/shared';

/**
 * Driver leg gating, mirrored from the web driver portal
 * (frontend/src/app/(driver-portal)/driver/page.tsx). The server enforces it
 * all again (see docs/map/11 › "Why can't the driver complete this job?");
 * these only decide which buttons are live and what they say.
 *
 *   PENDING → IN_PROGRESS  from job time, 1–10 photos + GPS
 *   IN_PROGRESS → COMPLETED from job time +15 min, cash collected, 1–10 photos + GPS
 *   NO SHOW after the server's noShowAvailableFrom; CANCELLED with GPS
 */

export const TERMINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export function isTerminal(job: DriverPortalJob): boolean {
  return TERMINAL.includes(job.driverStatus);
}

/** Job time = flight arrival for ARR, pickUpTime otherwise. */
export function jobTimeIso(job: DriverPortalJob): string | null {
  if (job.serviceType === 'ARR') return job.flight?.arrivalTime ?? job.pickUpTime ?? null;
  return job.pickUpTime ?? job.flight?.departureTime ?? null;
}

export function jobTimeLabel(job: DriverPortalJob): string {
  return formatTimeCairo(jobTimeIso(job));
}

/** Driver Time: when the driver must be ready — always 1 hour before the job time ('' when none). */
export function driverTimeLabel(job: DriverPortalJob): string {
  const iso = jobTimeIso(job);
  return iso ? formatTimeCairo(new Date(new Date(iso).getTime() - 60 * 60_000).toISOString()) : '';
}

/** Start is live from the job time onwards. */
export function startGate(job: DriverPortalJob, now = new Date()): { open: boolean; hint: string } {
  const iso = jobTimeIso(job);
  if (!iso) return { open: true, hint: '' };
  const at = new Date(iso);
  const open = now >= at;
  return { open, hint: open ? '' : tf('repApp.availableFrom', { time: formatTimeCairo(at.toISOString()) }) };
}

/** Complete: IN_PROGRESS, ≥ 15 min after job time, and cash collected when required. */
export function completeGate(job: DriverPortalJob, now = new Date()): { open: boolean; hint: string; needsCollection: boolean } {
  const needsCollection = job.collectionRequired && !job.collectionCollected;
  if (job.driverStatus !== 'IN_PROGRESS') return { open: false, hint: tf('driverApp.startFirst', {}), needsCollection };
  if (needsCollection) return { open: false, hint: tf('driverApp.collectFirst', {}), needsCollection };
  const iso = jobTimeIso(job);
  if (iso) {
    const at = new Date(new Date(iso).getTime() + 15 * 60000);
    if (now < at) return { open: false, hint: tf('repApp.availableFrom', { time: formatTimeCairo(at.toISOString()) }), needsCollection };
  }
  return { open: true, hint: '', needsCollection };
}

/** NO SHOW unlocks at the server's noShowAvailableFrom — never computed here. */
export function noShowGate(job: DriverPortalJob, now = new Date()): { open: boolean; hint: string } {
  const at = job.noShowAvailableFrom ? new Date(job.noShowAvailableFrom) : null;
  const open = !at || now >= at;
  return { open, hint: open || !at ? '' : tf('repApp.availableFrom', { time: formatTimeCairo(at.toISOString()) }) };
}

export function originLabel(job: DriverPortalJob): string {
  return (
    (job.originAirport ? `${job.originAirport.name} (${job.originAirport.code})` : null) ||
    job.originHotel?.name ||
    job.originZone?.name ||
    job.fromZone?.name ||
    '—'
  );
}

export function destinationLabel(job: DriverPortalJob): string {
  return (
    (job.destinationAirport ? `${job.destinationAirport.name} (${job.destinationAirport.code})` : null) ||
    job.destinationHotel?.name ||
    job.destinationZone?.name ||
    job.toZone?.name ||
    '—'
  );
}

export function originSub(job: DriverPortalJob): string | null {
  return (job.originHotel as { zone?: { name: string } } | null | undefined)?.zone?.name ?? null;
}
export function destinationSub(job: DriverPortalJob): string | null {
  return (job.destinationHotel as { zone?: { name: string } } | null | undefined)?.zone?.name ?? null;
}

/** Service date as YYYY-MM-DD (DATE stored at 00:00 UTC). */
export function jobDay(job: { jobDate: string }): string {
  return job.jobDate.slice(0, 10);
}

/** The rep assigned alongside this driver, if any. */
export function repLine(job: DriverPortalJob): { name: string; phone: string | null } | null {
  const rep = (job.assignment as { rep?: { name: string; mobileNumber?: string | null } | null } | undefined)?.rep;
  return rep ? { name: rep.name, phone: rep.mobileNumber ?? null } : null;
}

export function collectionAmount(job: DriverPortalJob): number {
  return Number(job.collectionAmount) || 0;
}
