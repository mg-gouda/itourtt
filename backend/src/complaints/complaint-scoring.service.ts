import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { calcRepScore, scoreToFeeAndEval } from '../common/utils/rep-score.util.js';
import {
  calcDriverScore,
  driverScoreToMultiplier,
} from '../common/utils/driver-score.util.js';

/**
 * Applies a complaint's score penalty to the rep or driver it blames.
 *
 * The penalty is deducted from the job score total, never re-weighted into the
 * criteria, so historical scores don't move. Because the score drives the pay
 * band, this changes what someone is paid — which is the intent, but only while
 * the pay is still open:
 *
 * **Settled pay is never rewritten.** If the job's fee row is already
 * `isPosted`, the penalty is skipped and the reason recorded on the complaint,
 * rather than silently clawing back money that has been paid out. The monetary
 * `ComplaintCharge` is the tool for that case and is unaffected by this guard.
 */
@Injectable()
export class ComplaintScoringService {
  private readonly logger = new Logger(ComplaintScoringService.name);

  /**
   * Called from the complaint transition when an outcome blames a rep or
   * driver. Runs inside the caller's transaction. Returns a note to store on
   * the complaint, or null when there was nothing to do.
   */
  async applyPenalty(
    tx: Prisma.TransactionClient,
    complaint: {
      id: string;
      complaintNo: string;
      trafficJobId: string;
      categoryId: string;
      responsibleParty: string | null;
      responsibleRepId: string | null;
      responsibleDriverId: string | null;
    },
  ): Promise<{ applied: number; note: string | null }> {
    const party = complaint.responsibleParty;
    if (party !== 'REP' && party !== 'DRIVER') {
      return { applied: 0, note: null };
    }

    const category = await tx.complaintCategory.findUnique({
      where: { id: complaint.categoryId },
      select: { defaultPenaltyPoints: true, nameEn: true },
    });
    const points = category?.defaultPenaltyPoints ?? 0;
    if (points <= 0) {
      // Categories seed at 0 so nothing touches pay until someone configures it.
      return { applied: 0, note: null };
    }

    return party === 'REP'
      ? this.applyRepPenalty(tx, complaint, points)
      : this.applyDriverPenalty(tx, complaint, points);
  }

  private async applyRepPenalty(
    tx: Prisma.TransactionClient,
    complaint: { complaintNo: string; trafficJobId: string; responsibleRepId: string | null },
    points: number,
  ): Promise<{ applied: number; note: string | null }> {
    const repId = complaint.responsibleRepId;
    if (!repId) return { applied: 0, note: null };

    const score = await tx.repJobScore.findUnique({
      where: { trafficJobId: complaint.trafficJobId },
    });
    if (!score) {
      return {
        applied: 0,
        note: `No rep score exists for this job, so the ${points}-point penalty was not applied.`,
      };
    }

    const fee = await tx.repFee.findFirst({
      where: { trafficJobId: complaint.trafficJobId, repId },
    });
    if (fee?.isPosted) {
      return {
        applied: 0,
        note: `The rep fee for this job is already posted, so the ${points}-point penalty was not applied — settled pay is not rewritten. Raise a charge instead.`,
      };
    }

    await tx.repJobScore.update({
      where: { trafficJobId: complaint.trafficJobId },
      data: { complaintPenalty: points },
    });

    const total = calcRepScore(score, points);
    const { fee: newFee } = scoreToFeeAndEval(total);

    if (fee) {
      await tx.repFee.update({ where: { id: fee.id }, data: { amount: newFee } });
    }

    this.logger.log(
      `Complaint ${complaint.complaintNo}: rep score penalty ${points} → total ${total}, fee ${newFee}`,
    );

    return {
      applied: points,
      note: `${points}-point penalty applied; the rep's job score is now ${total} and the fee ${newFee} EGP.`,
    };
  }

  private async applyDriverPenalty(
    tx: Prisma.TransactionClient,
    complaint: {
      complaintNo: string;
      trafficJobId: string;
      responsibleDriverId: string | null;
    },
    points: number,
  ): Promise<{ applied: number; note: string | null }> {
    const driverId = complaint.responsibleDriverId;
    if (!driverId) return { applied: 0, note: null };

    const score = await tx.driverJobScore.findUnique({
      where: { trafficJobId: complaint.trafficJobId },
    });
    if (!score) {
      return {
        applied: 0,
        note: `No driver score exists for this job, so the ${points}-point penalty was not applied.`,
      };
    }

    const fee = await tx.driverTripFee.findFirst({
      where: { trafficJobId: complaint.trafficJobId, driverId },
    });
    if (fee?.isPosted) {
      return {
        applied: 0,
        note: `The driver fee for this job is already posted, so the ${points}-point penalty was not applied — settled pay is not rewritten. Raise a charge instead.`,
      };
    }

    await tx.driverJobScore.update({
      where: { trafficJobId: complaint.trafficJobId },
      data: { complaintPenalty: points },
    });

    const total = calcDriverScore(score, points);
    const multiplier = driverScoreToMultiplier(total);

    if (fee) {
      // tariffAmount is the pre-multiplier base; fall back to the current
      // amount the first time a score touches this fee.
      const base = Number(fee.tariffAmount ?? fee.amount);
      await tx.driverTripFee.update({
        where: { id: fee.id },
        data: {
          tariffAmount: fee.tariffAmount ?? fee.amount,
          amount: Math.round(base * multiplier * 100) / 100,
        },
      });
    }

    this.logger.log(
      `Complaint ${complaint.complaintNo}: driver score penalty ${points} → total ${total}, multiplier ${multiplier}`,
    );

    return {
      applied: points,
      note: `${points}-point penalty applied; the driver's job score is now ${total} and the fee multiplier ${multiplier}.`,
    };
  }
}
