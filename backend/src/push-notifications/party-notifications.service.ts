import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushNotificationsService } from './push-notifications.service.js';

/** What a rep / driver is told. `event` names the event (push data `type`); see the event → push table
 *  in docs/map/11-business-rules.md › Rep / driver notifications. */
export interface PartyNote {
  title: string;
  message: string;
  event: string;
  /** Stored row type: JOB_ASSIGNED / JOB_UPDATED drive the app icons, everything else GENERAL. */
  type?: 'JOB_ASSIGNED' | 'JOB_UPDATED' | 'GENERAL' | 'FLIGHT_DELAY';
  jobId?: string | null;
  complaintId?: string | null;
}

/**
 * The one way to tell a rep or driver something: writes their notification row (the apps poll it and
 * raise a phone notification; the portal bell lists it) **and** sends a push (web push to the portal,
 * FCM where a device is registered) carrying { type, jobId | complaintId, url } so a tap opens the
 * right screen. Never throws — a failed notification must not fail the action that caused it.
 */
@Injectable()
export class PartyNotificationsService {
  private readonly logger = new Logger(PartyNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  private pushData(portal: 'rep' | 'driver', n: PartyNote): Record<string, string> {
    const url = n.complaintId ? `/${portal}/complaints?id=${n.complaintId}` : `/${portal}`;
    return {
      type: n.event,
      url,
      ...(n.jobId ? { jobId: n.jobId } : {}),
      ...(n.complaintId ? { complaintId: n.complaintId, tag: `complaint-${n.complaintId}` } : {}),
    };
  }

  async notifyRep(repId: string | null | undefined, n: PartyNote): Promise<void> {
    if (!repId) return;
    try {
      await this.prisma.repNotification.create({
        data: { repId, title: n.title, message: n.message, type: n.type ?? 'GENERAL', trafficJobId: n.jobId ?? null, complaintId: n.complaintId ?? null },
      });
      await this.push.sendToRep(repId, n.title, n.message, this.pushData('rep', n)).catch(() => {});
    } catch (e: any) {
      this.logger.warn(`Rep notification (${n.event}) failed: ${e?.message}`);
    }
  }

  async notifyDriver(driverId: string | null | undefined, n: PartyNote): Promise<void> {
    if (!driverId) return;
    try {
      await this.prisma.driverNotification.create({
        data: { driverId, title: n.title, message: n.message, type: n.type ?? 'GENERAL', trafficJobId: n.jobId ?? null, complaintId: n.complaintId ?? null },
      });
      await this.push.sendToDriver(driverId, n.title, n.message, this.pushData('driver', n)).catch(() => {});
    } catch (e: any) {
      this.logger.warn(`Driver notification (${n.event}) failed: ${e?.message}`);
    }
  }

  /** Both people on a job (either may be null). */
  async notifyAssignees(a: { driverId?: string | null; repId?: string | null } | null | undefined, n: PartyNote): Promise<void> {
    await Promise.all([this.notifyDriver(a?.driverId, n), this.notifyRep(a?.repId, n)]);
  }

  /** A user account that may be a rep's or a driver's (account events). Silent for back-office users. */
  async notifyUser(userId: string, n: PartyNote): Promise<void> {
    const [rep, driver] = await Promise.all([
      this.prisma.rep.findFirst({ where: { userId }, select: { id: true } }),
      this.prisma.driver.findFirst({ where: { userId }, select: { id: true } }),
    ]).catch(() => [null, null] as const);
    await Promise.all([this.notifyRep(rep?.id, n), this.notifyDriver(driver?.id, n)]);
  }
}
