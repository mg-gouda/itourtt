// ─────────────────────────────────────────────
// DRIVER JOB SCORING (single source of truth)
// ─────────────────────────────────────────────
// Point weights sum to 100. Keep in sync with the DriverJobScore model and the
// score checkboxes in the Driver Fees modal.
//
//   Attendance 30 · Appearance 20 · Car cleanliness 10 · Maintenance 10 · Work 30 = 100
//
// This file exists because the calculation was copy-pasted into
// reports.service.ts and export.service.ts, and the two copies had drifted:
// the multiplier table in the export read 1.0/0.9/0.75/0.5 while the one that
// actually writes DriverTripFee.amount read 1.0/0.8/0.6/0.4, so the Excel
// export over-reported what every driver scoring below 90 was really paid.
// The pay-writing table is the canonical one kept here.

export interface DriverScoreFlags {
  attendance: boolean;
  appearance: boolean;
  carCleanliness: boolean;
  maintenance: boolean;
  work: boolean;
}

export const DRIVER_SCORE_WEIGHTS = {
  attendance: 30,
  appearance: 20,
  carCleanliness: 10,
  maintenance: 10,
  work: 30,
} as const;

/**
 * The job score out of 100, less any complaint penalty, floored at 0.
 *
 * `complaintPenalty` comes from `DriverJobScore.complaintPenalty`, written when
 * a complaint blaming this driver is settled as lost. It is deducted from the
 * total rather than re-weighting the criteria, so existing scores never move.
 */
export function calcDriverScore(s: DriverScoreFlags, complaintPenalty = 0): number {
  const earned =
    (s.attendance ? DRIVER_SCORE_WEIGHTS.attendance : 0) +
    (s.appearance ? DRIVER_SCORE_WEIGHTS.appearance : 0) +
    (s.carCleanliness ? DRIVER_SCORE_WEIGHTS.carCleanliness : 0) +
    (s.maintenance ? DRIVER_SCORE_WEIGHTS.maintenance : 0) +
    (s.work ? DRIVER_SCORE_WEIGHTS.work : 0);

  return Math.max(0, earned - complaintPenalty);
}

export function driverScoreToEval(total: number): string {
  if (total >= 90) return 'Excellent';
  if (total >= 70) return 'Good';
  if (total >= 50) return 'Average';
  return 'Poor';
}

/** Fraction of the tariff amount a driver is paid for this score. */
export function driverScoreToMultiplier(total: number): number {
  if (total >= 90) return 1.0;
  if (total >= 70) return 0.8;
  if (total >= 50) return 0.6;
  return 0.4;
}
