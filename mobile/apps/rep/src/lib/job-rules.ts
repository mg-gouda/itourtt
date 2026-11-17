import { formatTimeCairo, tf, type RepPortalJob } from '@itour/shared';

/**
 * The rep leg's client-side gating, mirroring the web rep portal
 * (frontend/src/app/(rep-portal)/rep/page.tsx). The server enforces all of
 * it again — these only decide which buttons are live and what they say.
 *
 *   PENDING → IN_PLACE (2 photos + GPS) → COMPLETED (1–10 photos + GPS)
 *   NO SHOW any time after the server's `noShowAvailableFrom`
 *   CANCELLED from PENDING / IN_PLACE (GPS)
 */

export const TERMINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

export function isTerminal(job: RepPortalJob): boolean {
  return TERMINAL.includes(job.repStatus);
}

/** Job time = flight arrival for ARR, pickUpTime otherwise. */
export function jobTimeIso(job: RepPortalJob): string | null {
  if (job.serviceType === 'ARR') return job.flight?.arrivalTime ?? job.pickUpTime ?? null;
  return job.pickUpTime ?? job.flight?.departureTime ?? null;
}

export function jobTimeLabel(job: RepPortalJob): string {
  return formatTimeCairo(jobTimeIso(job));
}

/** IN PLACE is ARR-only windowed (arrival −10 → +80 min), bypassed by an admin unlock. */
export function inPlaceWindow(job: RepPortalJob, now = new Date()): { open: boolean; hint: string } {
  if (job.serviceType !== 'ARR' || !job.flight?.arrivalTime || job.repUnlockedAt) return { open: true, hint: '' };
  const arr = new Date(job.flight.arrivalTime).getTime();
  const start = new Date(arr - 10 * 60000);
  const end = new Date(arr + 80 * 60000);
  const open = now >= start && now <= end;
  return {
    open,
    hint: open
      ? ''
      : tf('repApp.availableWindow', { start: formatTimeCairo(start.toISOString()), end: formatTimeCairo(end.toISOString()) }),
  };
}

/** NO SHOW unlocks at the server's noShowAvailableFrom — never computed here. */
export function noShowGate(job: RepPortalJob, now = new Date()): { open: boolean; hint: string } {
  const at = job.noShowAvailableFrom ? new Date(job.noShowAvailableFrom) : null;
  const open = !at || now >= at;
  return { open, hint: open || !at ? '' : tf('repApp.availableFrom', { time: formatTimeCairo(at.toISOString()) }) };
}

/** IN PLACE is offered for every service type except DEP (as on the web portal). */
export function canOfferInPlace(job: RepPortalJob): boolean {
  return job.repStatus === 'PENDING' && job.serviceType !== 'DEP';
}

export function canComplete(job: RepPortalJob): boolean {
  return job.repStatus === 'IN_PLACE';
}

export function originLabel(job: RepPortalJob): string {
  return (
    (job.originAirport ? `${job.originAirport.name} (${job.originAirport.code})` : null) ||
    job.originHotel?.name ||
    job.originZone?.name ||
    job.fromZone?.name ||
    '—'
  );
}

export function destinationLabel(job: RepPortalJob): string {
  return (
    (job.destinationAirport ? `${job.destinationAirport.name} (${job.destinationAirport.code})` : null) ||
    job.destinationHotel?.name ||
    job.destinationZone?.name ||
    job.toZone?.name ||
    '—'
  );
}

/** Secondary line under a stop: the hotel's zone, if any. */
export function originSub(job: RepPortalJob): string | null {
  return (job.originHotel as { zone?: { name: string } } | null | undefined)?.zone?.name ?? null;
}
export function destinationSub(job: RepPortalJob): string | null {
  return (job.destinationHotel as { zone?: { name: string } } | null | undefined)?.zone?.name ?? null;
}

/** The job's service date as YYYY-MM-DD (stored as a DATE at 00:00 UTC). */
export function jobDay(job: { jobDate: string }): string {
  return job.jobDate.slice(0, 10);
}

export function driverLine(job: RepPortalJob): { name: string; phone: string | null; supplier: string | null } | null {
  const a = job.assignment as
    | {
        driver?: { name: string; mobileNumber: string } | null;
        externalDriverName?: string | null;
        externalDriverPhone?: string | null;
        supplier?: { tradeName?: string | null; legalName: string } | null;
      }
    | undefined;
  if (!a) return null;
  if (a.driver) return { name: a.driver.name, phone: a.driver.mobileNumber, supplier: null };
  if (a.externalDriverName)
    return {
      name: a.externalDriverName,
      phone: a.externalDriverPhone ?? null,
      supplier: a.supplier ? a.supplier.tradeName ?? a.supplier.legalName : null,
    };
  return null;
}
