import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ComplaintAnalyticsQueryDto } from './dto/complaint-analytics-query.dto.js';
import { TERMINAL_STATUSES, LOSS_STATUSES } from './complaints.service.js';
import type { ComplaintParty } from '../../generated/prisma/enums.js';

const CAIRO_TZ = 'Africa/Cairo';
const DEFAULT_RANGE_DAYS = 90;

/** One row of any breakdown: how many, how late, and how much it cost. */
export interface Slice {
  key: string;
  label: string;
  total: number;
  breached: number;
  lost: number;
  won: number;
  /** Omitted for viewers without financial.viewAmounts. */
  lossAmount?: number;
}

interface Bucket {
  label: string;
  total: number;
  breached: number;
  lost: number;
  won: number;
  lossAmount: number;
}

/**
 * Read-only aggregation behind the Complaint Analytics screen.
 *
 * Everything is computed from one pass over the complaints in range rather than
 * a dozen groupBy queries: complaint volumes are small next to jobs, and a
 * single snapshot keeps every breakdown consistent with the headline numbers.
 * Money is dropped entirely for viewers without `complaints.financial.viewAmounts`,
 * the same rule `redactAmounts` applies to the complaint itself.
 */
@Injectable()
export class ComplaintAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: ComplaintAnalyticsQueryDto, canViewAmounts: boolean) {
    const { from, to } = this.resolveRange(query);

    const rows = await this.prisma.complaint.findMany({
      where: {
        deletedAt: null,
        complaintDate: { gte: from, lte: to },
        ...(query.agentId && { agentId: query.agentId }),
        // Filter across the whole set — a complaint's second category or second
        // responsible party counts as much as its first.
        ...(query.categoryId && {
          categoryLinks: { some: { categoryId: query.categoryId } },
        }),
        ...(query.responsibleParty && {
          responsibleParties: { has: query.responsibleParty as ComplaintParty },
        }),
      },
      select: {
        id: true,
        status: true,
        stage: true,
        source: true,
        outcome: true,
        complaintDate: true,
        replyDueAt: true,
        repliedAt: true,
        resolvedAt: true,
        slaBreached: true,
        claimedAmount: true,
        lossAmount: true,
        currency: true,
        exchangeRate: true,
        scorePenaltyApplied: true,
        responsibleParty: true,
        categoryId: true,
        agentId: true,
        category: { select: { nameEn: true } },
        agent: { select: { legalName: true, tradeName: true } },
        responsibleDriverId: true,
        responsibleRepId: true,
        responsibleSupplierId: true,
        responsibleDriver: { select: { name: true } },
        responsibleRep: { select: { name: true } },
        responsibleSupplier: { select: { legalName: true, tradeName: true } },
        charge: { select: { status: true, amount: true, currency: true } },
      },
      orderBy: { complaintDate: 'asc' },
    });

    // The denominator for "how often are we complained about" — jobs operated
    // in the same window, not jobs booked in it.
    const jobsInRange = await this.prisma.trafficJob.count({
      where: { deletedAt: null, jobDate: { gte: from, lte: to } },
    });

    const now = new Date();
    const terminal = new Set<string>(TERMINAL_STATUSES);
    const lossStatuses = new Set<string>(LOSS_STATUSES);

    const byStatus = new Map<string, Bucket>();
    const byStage = new Map<string, Bucket>();
    const bySource = new Map<string, Bucket>();
    const byParty = new Map<string, Bucket>();
    const byCategory = new Map<string, Bucket>();
    const byAgent = new Map<string, Bucket>();
    const byMonth = new Map<string, Bucket>();
    const byResponsible = new Map<
      string,
      Bucket & { party: string; penaltyPoints: number }
    >();
    const byCurrency = new Map<string, { claimed: number; loss: number; count: number }>();

    let open = 0;
    let settled = 0;
    let cancelled = 0;
    let won = 0;
    let lost = 0;
    let partiallyLost = 0;
    let breached = 0;
    let awaitingReply = 0;
    let overdueNow = 0;
    let repliedInTime = 0;
    let repliedLate = 0;

    let replyHoursTotal = 0;
    let replyHoursCount = 0;
    let resolutionDaysTotal = 0;
    let resolutionDaysCount = 0;

    let claimedTotal = 0;
    let lossTotal = 0;
    let lostWithAmount = 0;
    let penaltyPointsTotal = 0;
    let chargesPostedTotal = 0;
    let chargesPostedCount = 0;
    let chargesPendingCount = 0;

    for (const row of rows) {
      const isTerminal = terminal.has(row.status);
      const isLoss = lossStatuses.has(row.status);
      // Everything is normalised to EGP through the rate stored on the row, so
      // a EUR claim and an EGP one can sit in the same total.
      const rate = Number(row.exchangeRate ?? 1) || 1;
      const claimed = Number(row.claimedAmount ?? 0) * rate;
      const loss = Number(row.lossAmount ?? 0) * rate;

      if (isTerminal) settled++;
      else open++;
      if (row.status === 'CANCELLED') cancelled++;
      if (row.status === 'WON') won++;
      if (row.status === 'LOST') lost++;
      if (row.status === 'PARTIALLY_LOST') partiallyLost++;
      if (row.slaBreached) breached++;

      if (row.repliedAt) {
        const hours =
          (row.repliedAt.getTime() - row.complaintDate.getTime()) / 3_600_000;
        replyHoursTotal += hours;
        replyHoursCount++;
        if (row.repliedAt > row.replyDueAt) repliedLate++;
        else repliedInTime++;
      } else if (row.status !== 'CANCELLED') {
        awaitingReply++;
        if (row.replyDueAt < now) overdueNow++;
      }

      if (row.resolvedAt) {
        resolutionDaysTotal +=
          (row.resolvedAt.getTime() - row.complaintDate.getTime()) / 86_400_000;
        resolutionDaysCount++;
      }

      claimedTotal += claimed;
      lossTotal += loss;
      if (loss > 0) lostWithAmount++;
      penaltyPointsTotal += row.scorePenaltyApplied;

      if (row.charge) {
        const chargeAmount = Number(row.charge.amount ?? 0);
        if (row.charge.status === 'POSTED') {
          chargesPostedTotal += chargeAmount;
          chargesPostedCount++;
        } else if (row.charge.status === 'PENDING' || row.charge.status === 'APPROVED') {
          chargesPendingCount++;
        }
      }

      const currency = row.currency ?? 'EGP';
      const money = byCurrency.get(currency) ?? { claimed: 0, loss: 0, count: 0 };
      money.claimed += Number(row.claimedAmount ?? 0);
      money.loss += Number(row.lossAmount ?? 0);
      money.count++;
      byCurrency.set(currency, money);

      const add = (
        map: Map<string, Bucket>,
        key: string | null | undefined,
        label: string,
      ) => {
        if (!key) return;
        const bucket = map.get(key) ?? {
          label,
          total: 0,
          breached: 0,
          lost: 0,
          won: 0,
          lossAmount: 0,
        };
        bucket.total++;
        if (row.slaBreached) bucket.breached++;
        if (isLoss) bucket.lost++;
        if (row.status === 'WON') bucket.won++;
        bucket.lossAmount += loss;
        map.set(key, bucket);
      };

      add(byStatus, row.status, row.status);
      add(byStage, row.stage, row.stage);
      add(bySource, row.source, row.source);
      // Breakdowns count each complaint exactly once, against its primary
      // party and primary category. Counting it under every party and every
      // category it carries would make the slices add up to more than the
      // headline total, which is the one thing this screen must never do.
      add(byParty, row.responsibleParty ?? 'NONE', row.responsibleParty ?? 'NONE');
      add(byCategory, row.categoryId, row.category?.nameEn ?? 'Uncategorised');
      add(
        byAgent,
        row.agentId,
        row.agent?.tradeName || row.agent?.legalName || 'No agent',
      );
      add(byMonth, this.monthKey(row.complaintDate), this.monthKey(row.complaintDate));

      // Named people, so a repeat offender is visible without reading every row.
      const person =
        row.responsibleDriverId && row.responsibleDriver
          ? { id: row.responsibleDriverId, name: row.responsibleDriver.name, party: 'DRIVER' }
          : row.responsibleRepId && row.responsibleRep
            ? { id: row.responsibleRepId, name: row.responsibleRep.name, party: 'REP' }
            : row.responsibleSupplierId && row.responsibleSupplier
              ? {
                  id: row.responsibleSupplierId,
                  name:
                    row.responsibleSupplier.tradeName ||
                    row.responsibleSupplier.legalName,
                  party: 'SUPPLIER',
                }
              : null;

      if (person) {
        const entry =
          byResponsible.get(person.id) ??
          ({
            label: person.name,
            party: person.party,
            total: 0,
            breached: 0,
            lost: 0,
            won: 0,
            lossAmount: 0,
            penaltyPoints: 0,
          } as Bucket & { party: string; penaltyPoints: number });
        entry.total++;
        if (row.slaBreached) entry.breached++;
        if (isLoss) entry.lost++;
        if (row.status === 'WON') entry.won++;
        entry.lossAmount += loss;
        entry.penaltyPoints += row.scorePenaltyApplied;
        byResponsible.set(person.id, entry);
      }
    }

    const decided = won + lost + partiallyLost;
    const total = rows.length;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        total,
        open,
        settled,
        cancelled,
        won,
        lost,
        partiallyLost,
        decided,
        // Rates are percentages, rounded to one decimal so the UI can print them raw.
        winRate: this.percent(won, decided),
        breached,
        breachRate: this.percent(breached, total),
        awaitingReply,
        overdueNow,
        repliedInTime,
        repliedLate,
        avgReplyHours: this.round(this.divide(replyHoursTotal, replyHoursCount), 1),
        avgResolutionDays: this.round(
          this.divide(resolutionDaysTotal, resolutionDaysCount),
          1,
        ),
        penaltyPointsTotal,
        jobsInRange,
        complaintsPer100Jobs: this.round(this.divide(total * 100, jobsInRange), 2),
      },
      sla: {
        repliedInTime,
        repliedLate,
        awaitingWithinWindow: awaitingReply - overdueNow,
        awaitingOverdue: overdueNow,
      },
      byStatus: this.toSlices(byStatus, canViewAmounts),
      byStage: this.toSlices(byStage, canViewAmounts),
      bySource: this.toSlices(bySource, canViewAmounts),
      byParty: this.toSlices(byParty, canViewAmounts),
      byCategory: this.toSlices(byCategory, canViewAmounts),
      byAgent: this.toSlices(byAgent, canViewAmounts).slice(0, 15),
      byResponsible: Array.from(byResponsible.entries())
        .map(([key, b]) => ({
          key,
          label: b.label,
          party: b.party,
          total: b.total,
          breached: b.breached,
          lost: b.lost,
          won: b.won,
          penaltyPoints: b.penaltyPoints,
          ...(canViewAmounts && { lossAmount: this.round(b.lossAmount, 2) }),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15),
      // Chronological, unlike the other breakdowns: a trend read backwards is
      // worse than useless.
      byMonth: this.toSlices(byMonth, canViewAmounts).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      ...(canViewAmounts && {
        money: {
          claimedTotal: this.round(claimedTotal, 2),
          lossTotal: this.round(lossTotal, 2),
          avgLoss: this.round(this.divide(lossTotal, lostWithAmount), 2),
          concededRate: this.percent(lossTotal, claimedTotal),
          chargesPostedTotal: this.round(chargesPostedTotal, 2),
          chargesPostedCount,
          chargesPendingCount,
          byCurrency: Array.from(byCurrency.entries())
            .map(([currency, m]) => ({
              currency,
              count: m.count,
              claimed: this.round(m.claimed, 2),
              loss: this.round(m.loss, 2),
            }))
            .sort((a, b) => b.loss - a.loss),
        },
      }),
    };
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private resolveRange(query: ComplaintAnalyticsQueryDto): { from: Date; to: Date } {
    const to = query.dateTo ? new Date(query.dateTo) : new Date();
    const from = query.dateFrom
      ? new Date(query.dateFrom)
      : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 86_400_000);
    return { from, to };
  }

  /** Months are Cairo months — the same calendar the office works in. */
  private monthKey(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CAIRO_TZ,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
    const month = parts.find((p) => p.type === 'month')?.value ?? '00';
    return `${year}-${month}`;
  }

  private toSlices(map: Map<string, Bucket>, canViewAmounts: boolean): Slice[] {
    return Array.from(map.entries())
      .map(([key, b]) => ({
        key,
        label: b.label,
        total: b.total,
        breached: b.breached,
        lost: b.lost,
        won: b.won,
        ...(canViewAmounts && { lossAmount: this.round(b.lossAmount, 2) }),
      }))
      .sort((a, b) => b.total - a.total);
  }

  private divide(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0;
  }

  private percent(part: number, whole: number): number {
    return this.round(this.divide(part * 100, whole), 1);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
