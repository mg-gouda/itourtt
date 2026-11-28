import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatService } from '../chat/chat.service.js';
import { WebPushService } from '../push-notifications/web-push.service.js';

export type OfflineRole = 'REP' | 'DRIVER';
export type OfflineKind = 'IN_PLACE' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'STATUS' | 'COLLECTED';

/** Who is told about actions done offline (owner, 2026-11-25). */
const ROLES_FOR: Record<OfflineRole, string[]> = {
  DRIVER: ['dispatcher', 'dispatch-manager'],
  REP: ['online-operator', 'online-manager'],
};

const KIND_LABEL: Record<string, string> = {
  IN_PLACE: 'IN PLACE',
  IN_PROGRESS: 'STARTED THE TRIP',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO SHOW',
  STATUS: 'STATUS',
  COLLECTED: 'CASH COLLECTED',
};

const hm = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false });
const dayHm = (d: Date) =>
  d.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export interface OfflineReport {
  userId: string;
  role: OfflineRole;
  jobId: string;
  kind: OfflineKind;
  occurredAt: Date;
  latitude?: number | null;
  longitude?: number | null;
  photos: number;
  photosLater: boolean;
  /** STATUS: the new status. */
  status?: string;
}

/**
 * Offline actions (6.9.0). Phones queue actions done without signal and send them later with the
 * time they were really done. Up to 2 h late they are applied at that time by the portal services
 * (request clock); older ones are held here for the office to approve or reject. Either way the
 * system writes a complete chat message from the rep / driver to the office roles that follow
 * them, and late ones are also pushed / listed in Job Control › Offline actions.
 */
@Injectable()
export class OfflineActionsService {
  private readonly logger = new Logger(OfflineActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly webPush: WebPushService,
  ) {}

  private async jobRef(jobId: string) {
    const j = await this.prisma.trafficJob.findUnique({ where: { id: jobId }, select: { internalRef: true } });
    return j?.internalRef ?? jobId.slice(0, 8);
  }

  private message(r: OfflineReport, ref: string, held: boolean) {
    const now = new Date();
    const what = r.kind === 'STATUS' && r.status ? r.status.replace(/_/g, ' ') : KIND_LABEL[r.kind] ?? r.kind;
    const lines = [
      `📶 Sent without signal — ${ref}: ${what}`,
      `Done at ${dayHm(r.occurredAt)} · received ${hm(now)}`,
    ];
    if (r.latitude != null && r.longitude != null) lines.push(`Location: https://www.google.com/maps?q=${r.latitude},${r.longitude}`);
    if (r.photos > 0) lines.push(`Photos: ${r.photos} attached`);
    else if (r.photosLater) lines.push('Photos: following when the signal allows');
    lines.push(
      held
        ? '⚠️ More than 2 hours late — waiting for office approval (Offline actions page).'
        : 'Applied at the time it was done.',
    );
    return lines.join('\n');
  }

  /** Applied offline action (≤ 2 h late): tell the office roles in chat. Never throws. */
  async announce(r: OfflineReport) {
    try {
      const ref = await this.jobRef(r.jobId);
      await this.chat.postFromPortalUser(r.userId, ROLES_FOR[r.role], this.message(r, ref, false));
    } catch (e) {
      this.logger.warn(`Offline announce failed: ${String(e)}`);
    }
  }

  /** More than 2 h late: keep it for approval, tell the office (chat + notification + push). */
  async hold(r: OfflineReport & { imageUrls: string[]; payload?: Record<string, unknown> }) {
    // The same action sent twice (double tap without signal, FT-5531) is kept once.
    const twin = await this.prisma.offlineActionRequest.findFirst({
      where: { userId: r.userId, trafficJobId: r.jobId, kind: r.kind, status: 'PENDING' },
      orderBy: { occurredAt: 'asc' },
    });
    if (twin && (r.kind !== 'STATUS' || (twin.payload as { status?: string } | null)?.status === r.status)) {
      if (r.imageUrls.length) {
        await this.prisma.offlineActionRequest.update({ where: { id: twin.id }, data: { imageUrls: [...twin.imageUrls, ...r.imageUrls] } });
      }
      return { held: true, id: twin.id, message: 'Saved — more than 2 hours late, so the office will approve it.' };
    }
    const row = await this.prisma.offlineActionRequest.create({
      data: {
        trafficJobId: r.jobId, userId: r.userId, role: r.role, kind: r.kind, occurredAt: r.occurredAt,
        latitude: r.latitude ?? null, longitude: r.longitude ?? null, imageUrls: r.imageUrls,
        payload: (r.payload ?? (r.status ? { status: r.status } : undefined)) as object | undefined,
      },
    });
    const ref = await this.jobRef(r.jobId);
    try {
      await this.chat.postFromPortalUser(r.userId, ROLES_FOR[r.role], this.message(r, ref, true));
      const staff = await this.prisma.user.findMany({
        where: { isActive: true, deletedAt: null, roleRef: { slug: { in: ROLES_FOR[r.role] } } },
        select: { id: true },
      });
      const title = `Offline action needs approval: ${ref}`;
      const body = `${KIND_LABEL[r.kind] ?? r.kind} done at ${dayHm(r.occurredAt)}, received more than 2 hours later.`;
      if (staff.length) {
        await this.prisma.userNotification.createMany({
          data: staff.map((u) => ({ userId: u.id, title, message: body, type: 'GENERAL' as const, trafficJobId: r.jobId })),
        });
        await this.webPush.sendToOffice(staff.map((u) => u.id), { title, body, url: '/dashboard/offline-actions', tag: `offline-${row.id}`, urgent: true });
      }
    } catch (e) {
      this.logger.warn(`Offline hold notice failed: ${String(e)}`);
    }
    return { held: true, id: row.id, message: 'Saved — more than 2 hours late, so the office will approve it.' };
  }

  /** Photos that followed later belong to a held request too. */
  async addHeldPhotos(userId: string, jobId: string, kind: string, urls: string[]) {
    const row = await this.prisma.offlineActionRequest.findFirst({
      where: { userId, trafficJobId: jobId, kind, status: 'PENDING' },
      orderBy: { receivedAt: 'desc' },
    });
    if (!row) return false;
    await this.prisma.offlineActionRequest.update({ where: { id: row.id }, data: { imageUrls: [...row.imageUrls, ...urls] } });
    return true;
  }

  /** Photos that followed an applied action: add them to its latest evidence row. */
  async appendEvidence(jobId: string, kind: string, urls: string[]) {
    const model = ({ IN_PLACE: 'inPlaceEvidence', COMPLETED: 'completedEvidence', NO_SHOW: 'noShowEvidence', IN_PROGRESS: 'inProgressEvidence' } as Record<string, string>)[kind];
    if (!model) throw new BadRequestException('Unknown evidence kind');
    const delegate = (this.prisma as unknown as Record<string, {
      findFirst: (a: unknown) => Promise<{ id: string; imageUrls: string[] } | null>;
      update: (a: unknown) => Promise<unknown>;
    }>)[model];
    const row = await delegate.findFirst({ where: { trafficJobId: jobId }, orderBy: { createdAt: 'desc' }, select: { id: true, imageUrls: true } });
    if (!row) throw new NotFoundException('No evidence to add photos to yet');
    await delegate.update({ where: { id: row.id }, data: { imageUrls: [...row.imageUrls, ...urls] } });
  }

  async list(status = 'PENDING') {
    const rows = await this.prisma.offlineActionRequest.findMany({
      where: status === 'ALL' ? {} : { status },
      // Waiting: oldest action first, the order they must be applied in.
      orderBy: status === 'PENDING' ? { occurredAt: 'asc' } : { receivedAt: 'desc' },
      take: 200,
    });
    const jobs = await this.prisma.trafficJob.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.trafficJobId))] } },
      select: { id: true, internalRef: true, serviceType: true, jobDate: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => [r.userId, r.decidedById].filter(Boolean) as string[]))] } },
      select: { id: true, name: true },
    });
    const job = new Map(jobs.map((j) => [j.id, j]));
    const user = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      ...r,
      job: job.get(r.trafficJobId) ?? null,
      personName: user.get(r.userId) ?? null,
      decidedByName: r.decidedById ? user.get(r.decidedById) ?? null : null,
    }));
  }

  /** A waiting action; with `retry`, one that could not be applied may be tried again. */
  async get(id: string, retry = false) {
    const row = await this.prisma.offlineActionRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Offline action not found');
    if (row.status !== 'PENDING' && !(retry && row.status === 'FAILED')) throw new BadRequestException(`Already ${row.status.toLowerCase()}`);
    return row;
  }

  /** Waiting actions by the same person on the same job done before this one, oldest first. */
  async earlierPending(row: { id: string; userId: string; trafficJobId: string; occurredAt: Date }) {
    return this.prisma.offlineActionRequest.findMany({
      where: { userId: row.userId, trafficJobId: row.trafficJobId, status: 'PENDING', occurredAt: { lte: row.occurredAt }, id: { not: row.id } },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async decide(id: string, status: 'APPROVED' | 'REJECTED' | 'FAILED', officeUserId: string, note?: string) {
    const row = await this.prisma.offlineActionRequest.update({
      where: { id },
      data: { status, decidedById: officeUserId, decidedAt: new Date(), note: note?.slice(0, 500) ?? null },
    });
    // Tell the rep / driver in their thread with the office user who decided.
    const ref = await this.jobRef(row.trafficJobId);
    const word = status === 'APPROVED' ? 'approved and applied' : status === 'REJECTED' ? 'rejected' : 'could not be applied';
    try {
      const conv = await this.prisma.chatConversation.findFirst({ where: { portalUserId: row.userId, staffUserId: officeUserId } });
      if (conv) {
        const now = new Date();
        await this.prisma.chatMessage.create({
          data: {
            conversationId: conv.id, senderId: officeUserId, kind: 'TEXT', createdAt: now,
            body: `Your offline ${KIND_LABEL[row.kind] ?? row.kind} on ${ref} (done ${dayHm(row.occurredAt)}) was ${word}.${note ? ` ${note}` : ''}`,
          },
        });
        await this.prisma.chatConversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, staffLastReadAt: now } });
      }
    } catch {
      /* best effort */
    }
    return row;
  }
}
