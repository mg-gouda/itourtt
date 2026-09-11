import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SLA_WARNING_HOURS } from './dto/complaint-constants.js';

const CAIRO_TZ = 'Africa/Cairo';

/**
 * The reply-window sweep.
 *
 * It does exactly two things: flip `slaBreached`, and write notifications. It
 * **never touches `status`** — a missed deadline is a flag on the complaint, not
 * an outcome. Deciding a complaint is always a person's act, and letting a cron
 * advance the lifecycle would quietly resolve disputes nobody had answered.
 */
@Injectable()
export class ComplaintSlaService {
  private readonly logger = new Logger(ComplaintSlaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Hourly, so the T-12h warning lands close to the right hour rather than
  // whenever midnight happens to fall.
  @Cron('0 * * * *', { timeZone: CAIRO_TZ })
  async sweep() {
    const now = new Date();

    // Single-replica guard, matching supplier-auto-complete: with several pods,
    // @nestjs/schedule fires on every replica, and the unique (jobName, runDate)
    // row means only the first one through actually runs.
    //
    // CronRunLock.runDate is @db.Date, so it cannot separate hours — all 24 runs
    // would collide on one row and only the day's first sweep would ever
    // execute. The hour therefore goes in the jobName instead, which needs no
    // migration to a table other jobs share.
    const cairoNow = new Date(now.toLocaleString('en-US', { timeZone: CAIRO_TZ }));
    const hour = String(cairoNow.getHours()).padStart(2, '0');
    const runDate = new Date(
      Date.UTC(cairoNow.getFullYear(), cairoNow.getMonth(), cairoNow.getDate()),
    );

    try {
      await this.prisma.cronRunLock.create({
        data: { jobName: `complaint-sla-sweep-${hour}`, runDate },
      });
    } catch {
      return; // another replica already claimed this hour
    }

    const breached = await this.flagBreaches(now);
    const warned = await this.warnDueSoon(now);

    if (breached > 0 || warned > 0) {
      this.logger.log(
        `Complaint SLA sweep: ${breached} newly breached, ${warned} warned of a deadline within ${SLA_WARNING_HOURS}h`,
      );
    }
  }

  /** Unanswered complaints whose deadline has passed. Flag only. */
  private async flagBreaches(now: Date): Promise<number> {
    const due = await this.prisma.complaint.findMany({
      where: {
        deletedAt: null,
        repliedAt: null,
        slaBreached: false,
        replyDueAt: { lt: now },
        // A cancelled complaint owes nobody a reply.
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        complaintNo: true,
        subject: true,
        trafficJobId: true,
        assignedToId: true,
        replyDueAt: true,
      },
    });

    for (const c of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.complaint.update({
          where: { id: c.id },
          data: { slaBreached: true },
        });

        if (c.assignedToId) {
          await tx.userNotification.create({
            data: {
              userId: c.assignedToId,
              title: `Reply deadline missed — ${c.complaintNo}`,
              message: `The ${'48-hour'} reply window for "${c.subject}" closed on ${c.replyDueAt.toISOString()}. It is still unanswered.`,
              trafficJobId: c.trafficJobId,
              metadata: { complaintId: c.id, kind: 'SLA_BREACH' },
            },
          });
        }
      });
    }

    return due.length;
  }

  /**
   * Complaints coming up on their deadline. One nudge each — the notification
   * metadata is what stops it repeating every hour.
   */
  private async warnDueSoon(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + SLA_WARNING_HOURS * 3_600_000);

    const soon = await this.prisma.complaint.findMany({
      where: {
        deletedAt: null,
        repliedAt: null,
        slaBreached: false,
        replyDueAt: { gte: now, lte: horizon },
        status: { not: 'CANCELLED' },
        assignedToId: { not: null },
      },
      select: {
        id: true,
        complaintNo: true,
        subject: true,
        trafficJobId: true,
        assignedToId: true,
        replyDueAt: true,
      },
    });

    let sent = 0;

    for (const c of soon) {
      const alreadyWarned = await this.prisma.userNotification.findFirst({
        where: {
          userId: c.assignedToId!,
          metadata: { path: ['complaintId'], equals: c.id },
        },
      });
      if (alreadyWarned) continue;

      const hoursLeft = Math.max(
        0,
        Math.round((c.replyDueAt.getTime() - now.getTime()) / 3_600_000),
      );

      await this.prisma.userNotification.create({
        data: {
          userId: c.assignedToId!,
          title: `Reply due in ${hoursLeft}h — ${c.complaintNo}`,
          message: `"${c.subject}" still has no reply. The window closes in about ${hoursLeft} hours.`,
          trafficJobId: c.trafficJobId,
          metadata: { complaintId: c.id, kind: 'SLA_WARNING' },
        },
      });
      sent++;
    }

    return sent;
  }

  /**
   * Tells a rep or driver about a complaint that named them — but only once it
   * is settled and lost. They should never see a dispute still being argued.
   * Called from the complaint transition, inside its transaction.
   */
  async notifyResponsibleParty(
    tx: {
      repNotification: { create: (args: any) => Promise<unknown> };
      driverNotification: { create: (args: any) => Promise<unknown> };
    },
    complaint: {
      complaintNo: string;
      subject: string;
      status: string;
      trafficJobId: string;
      responsibleParties: string[];
      responsibleRepId: string | null;
      responsibleDriverId: string | null;
    },
  ): Promise<void> {
    if (complaint.status !== 'LOST' && complaint.status !== 'PARTIALLY_LOST') {
      return;
    }

    const title = `Complaint upheld — ${complaint.complaintNo}`;
    const message = `A complaint about one of your jobs was settled against us: "${complaint.subject}".`;

    // A complaint can blame the rep and the driver at once; both hear about it.
    if (complaint.responsibleParties.includes('REP') && complaint.responsibleRepId) {
      await tx.repNotification.create({
        data: {
          repId: complaint.responsibleRepId,
          title,
          message,
          trafficJobId: complaint.trafficJobId,
        },
      });
    }

    if (complaint.responsibleParties.includes('DRIVER') && complaint.responsibleDriverId) {
      await tx.driverNotification.create({
        data: {
          driverId: complaint.responsibleDriverId,
          title,
          message,
          trafficJobId: complaint.trafficJobId,
        },
      });
    }
  }
}
