import { BadRequestException } from '@nestjs/common';

/**
 * How long a driver or rep must wait past the job time before NO SHOW unlocks.
 *
 * The delay exists so nobody can tap the button by mistake the moment a job
 * appears. It is not one number: departures are far shorter than arrivals — a
 * guest who misses a hotel pick-up is established long before one who never
 * comes out of an airport — and the occasional agent negotiates their own.
 *
 * So the wait is resolved per job: **agent override ?? company default ??
 * the constants below**, which are only the last resort for a database with no
 * `CompanySettings` row yet. Only DEP is split out; arrivals, day tours, going
 * and return all use the standard wait.
 */
export const DEFAULT_NO_SHOW_WAIT_STANDARD_MINUTES = 80;
export const DEFAULT_NO_SHOW_WAIT_DEP_MINUTES = 15;

/** Either side of the fallback chain — an Agent row or the CompanySettings row. */
export interface NoShowWaitSource {
  noShowWaitStandardMinutes?: number | null;
  noShowWaitDepMinutes?: number | null;
}

interface NoShowJob {
  serviceType: string;
  pickUpTime?: Date | null;
  flight?: { arrivalTime?: Date | null } | null;
}

/** Job time used for the guard: flight arrival for ARR, pick-up time otherwise. */
export function getNoShowJobTime(job: NoShowJob): Date | null {
  const raw =
    job.serviceType === 'ARR'
      ? (job.flight?.arrivalTime ?? null)
      : (job.pickUpTime ?? null);
  return raw ? new Date(raw) : null;
}

/**
 * The wait that applies to one job, in minutes. The agent's own number wins;
 * otherwise the company default. A job with no agent — a B2B booking carries a
 * customer, not an agent — simply falls through to the default, which is why
 * this takes the agent as nullable rather than demanding one.
 */
export function resolveNoShowWaitMinutes(
  serviceType: string,
  agent: NoShowWaitSource | null | undefined,
  settings: NoShowWaitSource | null | undefined,
): number {
  const isDeparture = serviceType === 'DEP';

  const agentValue = isDeparture
    ? agent?.noShowWaitDepMinutes
    : agent?.noShowWaitStandardMinutes;
  if (agentValue != null) return agentValue;

  const companyValue = isDeparture
    ? settings?.noShowWaitDepMinutes
    : settings?.noShowWaitStandardMinutes;
  if (companyValue != null) return companyValue;

  return isDeparture
    ? DEFAULT_NO_SHOW_WAIT_DEP_MINUTES
    : DEFAULT_NO_SHOW_WAIT_STANDARD_MINUTES;
}

/**
 * The instant NO SHOW becomes reportable, or null when the job has no
 * resolvable time — which, as before, means no guard at all.
 *
 * This is what the portals render and gate their button on, so the countdown a
 * driver sees is the same instant the server enforces. They used to compute it
 * from their own copy of the constant, which could only stay right while there
 * was exactly one number.
 */
export function getNoShowAvailableFrom(
  job: NoShowJob,
  waitMinutes: number,
): Date | null {
  const jobTime = getNoShowJobTime(job);
  if (!jobTime) return null;
  return new Date(jobTime.getTime() + waitMinutes * 60 * 1000);
}

/** Throws unless we are at least `waitMinutes` past the job time. */
export function checkNoShowWindow(job: NoShowJob, waitMinutes: number): void {
  const availableFrom = getNoShowAvailableFrom(job, waitMinutes);
  if (!availableFrom) return;

  if (new Date() < availableFrom) {
    const timeStr = availableFrom.toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    throw new BadRequestException(
      `NO SHOW can only be reported ${waitMinutes} minutes after the job time (from ${timeStr})`,
    );
  }
}
