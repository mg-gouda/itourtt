// ─────────────────────────────────────────────
// REP JOB SCORING (single source of truth)
// ─────────────────────────────────────────────
// Point weights sum to 100. Keep in sync with the RepJobScore model and the
// score checkboxes in the Rep Fees modal.
//
//   Attendance 20 · Appearance 15 · Work 15 · Survey 15 · Review 35 = 100

export interface RepScoreFlags {
  attendance: boolean;
  appearance: boolean;
  work: boolean;
  survey: boolean;
  review: boolean;
}

export const REP_SCORE_WEIGHTS = {
  attendance: 20,
  appearance: 15,
  work: 15,
  survey: 15,
  review: 35,
} as const;

/**
 * The job score out of 100, less any complaint penalty, floored at 0.
 *
 * `complaintPenalty` comes from `RepJobScore.complaintPenalty`, written when a
 * complaint blaming this rep is settled as lost. It is deducted from the total
 * rather than re-weighting the criteria, so existing scores never move.
 */
export function calcRepScore(s: RepScoreFlags, complaintPenalty = 0): number {
  const earned =
    (s.attendance ? REP_SCORE_WEIGHTS.attendance : 0) +
    (s.appearance ? REP_SCORE_WEIGHTS.appearance : 0) +
    (s.work ? REP_SCORE_WEIGHTS.work : 0) +
    (s.survey ? REP_SCORE_WEIGHTS.survey : 0) +
    (s.review ? REP_SCORE_WEIGHTS.review : 0);

  return Math.max(0, earned - complaintPenalty);
}

export function scoreToFeeAndEval(total: number): {
  fee: number;
  evaluation: string;
} {
  if (total >= 90) return { fee: 50, evaluation: 'Excellent' };
  if (total >= 75) return { fee: 40, evaluation: 'Good' };
  if (total >= 61) return { fee: 30, evaluation: 'Average' };
  return { fee: 20, evaluation: 'Poor' };
}
