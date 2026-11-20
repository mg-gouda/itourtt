import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service.js';
import { GoogleDriveService, isDriveFileId } from '../google-drive/google-drive.service.js';
import { PushNotificationsService } from '../push-notifications/push-notifications.service.js';

/** The party a thread belongs to: each blamed rep / driver talks to the office in their own thread. */
export type ThreadParty = 'REP' | 'DRIVER';

const TERMINAL = ['WON', 'PARTIALLY_LOST', 'LOST', 'CANCELLED'];
const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|jpg|png|webp|heic|heif|gif)|application\/pdf)$/i;
const uploadsDir = path.join(process.cwd(), 'uploads', 'complaints');

/** Pipes an opened complaint file to the response, shown inline (images / PDF). */
export function sendComplaintFile(
  res: { set: (h: Record<string, string>) => unknown },
  file: { stream: Readable; mimeType: string; fileName: string },
) {
  res.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, max-age=3600',
  });
  file.stream.pipe(res as unknown as NodeJS.WritableStream);
}

/**
 * Complaint threads between the office and the rep / driver a complaint blames
 * (rules: docs/map/11-business-rules.md › Complaints › Rep / driver answers).
 *
 * - A rep / driver sees a complaint **as soon as it names them** (any status) — the story (job,
 *   category, subject, description), never the money (claimed / loss amounts). A deduction only
 *   shows once POSTED (History › Deductions), as before.
 * - Each named party has its own thread: they answer with text and evidence (images / PDF, e.g.
 *   WhatsApp screenshots), the office replies in the same thread. A resolved or cancelled complaint's
 *   threads are read-only.
 * - Evidence is a ComplaintAttachment (kind EVIDENCE, linked to its message), stored on Drive in the
 *   job's Rep / Driver Evidence folder (local uploads/complaints when Drive is off), so it also shows
 *   on the complaint in the admin area.
 * - Notifications: the party when a complaint names them and when the office replies; the complaint's
 *   owner (or the admins, when nobody owns it) when the party answers.
 */
@Injectable()
export class ComplaintThreadService {
  private readonly logger = new Logger(ComplaintThreadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: GoogleDriveService,
    private readonly push: PushNotificationsService,
  ) {}

  private partyWhere(party: ThreadParty, partyId: string) {
    return party === 'REP'
      ? { responsibleParties: { has: 'REP' as const }, responsibleRepId: partyId }
      : { responsibleParties: { has: 'DRIVER' as const }, responsibleDriverId: partyId };
  }

  private messageInclude = {
    user: { select: { name: true } },
    attachments: { select: { id: true, fileName: true, mimeType: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
  };

  // ── Portal (rep / driver) ────────────────────────────────────────────────────

  /**
   * Thread state for the portal complaint list: open?, message count and whether the party owes an
   * answer (nothing sent yet, or the office spoke last). Keyed by complaint id.
   */
  async summaries(party: ThreadParty, rows: { id: string; status: string }[]) {
    const ids = rows.map((r) => r.id);
    const msgs = ids.length
      ? await this.prisma.complaintMessage.findMany({
          where: { complaintId: { in: ids }, party },
          select: { complaintId: true, authorType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const out = new Map<string, { open: boolean; messageCount: number; lastMessageAt: Date | null; awaitingYou: boolean }>();
    for (const r of rows) {
      const mine = msgs.filter((m) => m.complaintId === r.id);
      const last = mine[mine.length - 1];
      const open = !TERMINAL.includes(r.status);
      out.set(r.id, {
        open,
        messageCount: mine.length,
        lastMessageAt: last?.createdAt ?? null,
        awaitingYou: open && (!last || last.authorType === 'STAFF'),
      });
    }
    return out;
  }

  /** One complaint as the rep / driver sees it: the story and their thread. */
  async detailForParty(party: ThreadParty, partyId: string, complaintId: string) {
    const c = await this.prisma.complaint.findFirst({
      where: { id: complaintId, deletedAt: null, ...this.partyWhere(party, partyId) },
      select: {
        id: true,
        complaintNo: true,
        subject: true,
        description: true,
        status: true,
        stage: true,
        complaintDate: true,
        resolvedAt: true,
        category: { select: { nameEn: true, nameAr: true } },
        trafficJob: {
          select: {
            internalRef: true,
            jobDate: true,
            serviceType: true,
            clientName: true,
            paxCount: true,
            jobServiceType: { select: { name: true } },
            originAirport: { select: { name: true } },
            originHotel: { select: { name: true } },
            originZone: { select: { name: true } },
            destinationAirport: { select: { name: true } },
            destinationHotel: { select: { name: true } },
            destinationZone: { select: { name: true } },
          },
        },
        messages: { where: { party }, orderBy: { createdAt: 'asc' }, include: this.messageInclude },
      },
    });
    if (!c) throw new NotFoundException('Complaint not found');
    const j = c.trafficJob;
    const end = (a?: { name: string } | null, h?: { name: string } | null, z?: { name: string } | null) => a?.name ?? h?.name ?? z?.name ?? null;
    return {
      id: c.id,
      complaintNo: c.complaintNo,
      subject: c.subject,
      description: c.description,
      status: c.status,
      stage: c.stage,
      open: !TERMINAL.includes(c.status),
      complaintDate: c.complaintDate,
      resolvedAt: c.resolvedAt,
      categoryEn: c.category.nameEn,
      categoryAr: c.category.nameAr,
      job: {
        internalRef: j.internalRef,
        jobDate: j.jobDate,
        serviceType: j.serviceType,
        route: j.jobServiceType?.name ?? null,
        from: end(j.originAirport, j.originHotel, j.originZone),
        to: end(j.destinationAirport, j.destinationHotel, j.destinationZone),
        guest: j.clientName,
        pax: j.paxCount,
      },
      messages: c.messages.map((m) => this.toMessage(m)),
    };
  }

  private toMessage(m: any) {
    return {
      id: m.id,
      authorType: m.authorType, // REP | DRIVER | STAFF
      authorName: m.authorType === 'STAFF' ? m.user?.name ?? 'Office' : m.user?.name ?? null,
      message: m.message,
      createdAt: m.createdAt,
      attachments: m.attachments,
    };
  }

  // ── Writing a message (party or office) ──────────────────────────────────────

  /**
   * Adds a message to a party's thread. `author` PARTY = the rep / driver themself (they must be the
   * one named); STAFF = the office replying in that party's thread.
   */
  async addMessage(input: {
    complaintId: string;
    party: ThreadParty;
    author: 'PARTY' | 'STAFF';
    userId: string;
    partyId?: string; // required for PARTY
    message?: string;
    files?: Express.Multer.File[];
  }) {
    const files = (input.files ?? []).filter((f) => f?.buffer?.length);
    const text = (input.message ?? '').trim();
    if (!text && !files.length) throw new BadRequestException('Write an answer or attach evidence');
    if (files.length > MAX_FILES) throw new BadRequestException(`At most ${MAX_FILES} files per answer`);
    for (const f of files) {
      if (!ALLOWED.test(f.mimetype)) throw new BadRequestException(`${f.originalname}: only images and PDF files are accepted`);
      if (f.size > MAX_BYTES) throw new BadRequestException(`${f.originalname} is larger than 15 MB`);
    }

    const c = await this.prisma.complaint.findFirst({
      where: { id: input.complaintId, deletedAt: null },
      select: {
        id: true,
        complaintNo: true,
        subject: true,
        status: true,
        trafficJobId: true,
        assignedToId: true,
        responsibleParties: true,
        responsibleRepId: true,
        responsibleDriverId: true,
        responsibleRep: { select: { name: true } },
        responsibleDriver: { select: { name: true } },
      },
    });
    if (!c) throw new NotFoundException('Complaint not found');
    const partyId = input.party === 'REP' ? c.responsibleRepId : c.responsibleDriverId;
    if (!c.responsibleParties.includes(input.party) || !partyId) {
      throw new BadRequestException(`This complaint does not name a ${input.party === 'REP' ? 'rep' : 'driver'}`);
    }
    if (input.author === 'PARTY' && input.partyId !== partyId) throw new ForbiddenException('This complaint does not name you');
    if (TERMINAL.includes(c.status)) throw new BadRequestException('This complaint is closed — its answers are read-only');

    const author = await this.prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } });
    const stored: { fileUrl: string; fileName: string; mimeType: string }[] = [];
    for (const [i, f] of files.entries()) {
      const safe = f.originalname.replace(/[^\w.\-]+/g, '_').slice(-80) || `evidence-${i + 1}`;
      const name = `complaint-${c.complaintNo}-${Date.now()}-${i}-${safe}`;
      const driveId = await this.drive.uploadFile(f.buffer, name, f.mimetype, c.trafficJobId, input.party === 'REP' ? 'rep' : 'driver');
      if (driveId) stored.push({ fileUrl: driveId, fileName: f.originalname, mimeType: f.mimetype });
      else {
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, name), f.buffer);
        stored.push({ fileUrl: `/uploads/complaints/${name}`, fileName: f.originalname, mimeType: f.mimetype });
      }
    }

    const created = await this.prisma.complaintMessage.create({
      data: {
        complaintId: c.id,
        party: input.party,
        authorType: input.author === 'STAFF' ? 'STAFF' : input.party,
        repId: input.party === 'REP' ? partyId : null,
        driverId: input.party === 'DRIVER' ? partyId : null,
        userId: input.userId,
        message: text,
        attachments: {
          create: stored.map((s) => ({
            complaintId: c.id,
            kind: 'EVIDENCE' as const,
            fileUrl: s.fileUrl,
            fileName: s.fileName,
            mimeType: s.mimeType,
            submittedBy: input.author === 'STAFF' ? `Office (${author?.name ?? ''})` : `${input.party === 'REP' ? 'Rep' : 'Driver'} ${author?.name ?? ''}`.trim(),
            uploadedById: input.userId,
          })),
        },
      },
      include: this.messageInclude,
    });

    // Notify the other side (never blocks the answer).
    void this.notifyMessage(c, input.party, input.author, author?.name ?? '', text, stored.length).catch((e) =>
      this.logger.warn(`Complaint message notification failed: ${e?.message}`),
    );
    return this.toMessage(created);
  }

  private async notifyMessage(c: any, party: ThreadParty, author: 'PARTY' | 'STAFF', authorName: string, text: string, files: number) {
    const preview = (text || `${files} file(s) attached`).slice(0, 160);
    if (author === 'STAFF') {
      const title = `Complaint ${c.complaintNo} — reply from the office`;
      await this.notifyParty(party, party === 'REP' ? c.responsibleRepId : c.responsibleDriverId, c.trafficJobId, title, preview);
      return;
    }
    // Party answered → the complaint's owner, else every admin.
    const recipients = c.assignedToId
      ? [{ id: c.assignedToId }]
      : await this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true, deletedAt: null }, select: { id: true } });
    const who = `${party === 'REP' ? 'Rep' : 'Driver'} ${authorName}`.trim();
    const title = `Complaint ${c.complaintNo}: ${who} answered`;
    const message = `${preview}${files && text ? ` (+${files} file(s))` : ''}`;
    if (recipients.length) {
      await this.prisma.userNotification.createMany({ data: recipients.map((r) => ({ userId: r.id, title, message, type: 'GENERAL' as const })) });
    }
    await Promise.allSettled(recipients.map((r) => this.push.sendToUser(r.id, title, message, { url: '/dashboard/complaints', tag: `complaint-${c.id}` })));
  }

  /** In-app notification (portal + app bell) and a push to the rep / driver. */
  private async notifyParty(party: ThreadParty, partyId: string | null, trafficJobId: string, title: string, message: string) {
    if (!partyId) return;
    if (party === 'REP') {
      await this.prisma.repNotification.create({ data: { repId: partyId, title, message, trafficJobId } });
      await this.push.sendToRep(partyId, title, message, { url: '/rep/complaints', tag: `complaint-${trafficJobId}` });
    } else {
      await this.prisma.driverNotification.create({ data: { driverId: partyId, title, message, trafficJobId } });
      await this.push.sendToDriver(partyId, title, message, { url: '/driver/complaints', tag: `complaint-${trafficJobId}` });
    }
  }

  /**
   * A complaint now names a rep / driver it did not name before (created, or its responsibility
   * changed): tell them so they can answer. `before` is null on create.
   */
  async notifyNamed(
    before: { responsibleParties: string[]; responsibleRepId: string | null; responsibleDriverId: string | null } | null,
    after: { complaintNo: string; subject: string; status: string; trafficJobId: string; responsibleParties: string[]; responsibleRepId: string | null; responsibleDriverId: string | null },
  ) {
    try {
      if (TERMINAL.includes(after.status)) return;
      const title = `New complaint ${after.complaintNo} — please answer`;
      const message = `A complaint names you: "${after.subject}". Open Complaints to read it and send your answer with any evidence.`;
      const newly = (party: ThreadParty, id: string | null, prevId: string | null | undefined, prevParties: string[] | undefined) =>
        after.responsibleParties.includes(party) && id && !(prevParties?.includes(party) && prevId === id);
      if (newly('REP', after.responsibleRepId, before?.responsibleRepId, before?.responsibleParties)) {
        await this.notifyParty('REP', after.responsibleRepId, after.trafficJobId, title, message);
      }
      if (newly('DRIVER', after.responsibleDriverId, before?.responsibleDriverId, before?.responsibleParties)) {
        await this.notifyParty('DRIVER', after.responsibleDriverId, after.trafficJobId, title, message);
      }
    } catch (e: any) {
      this.logger.warn(`Complaint named-party notification failed: ${e?.message}`);
    }
  }

  // ── Office side ──────────────────────────────────────────────────────────────

  /** Both threads of a complaint, for the admin complaint view. */
  async threadsForStaff(complaintId: string) {
    const c = await this.prisma.complaint.findFirst({
      where: { id: complaintId, deletedAt: null },
      select: {
        status: true,
        responsibleParties: true,
        responsibleRep: { select: { id: true, name: true } },
        responsibleDriver: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: this.messageInclude },
      },
    });
    if (!c) throw new NotFoundException('Complaint not found');
    const thread = (party: ThreadParty) => c.messages.filter((m) => m.party === party).map((m) => this.toMessage(m));
    return {
      open: !TERMINAL.includes(c.status),
      threads: [
        ...(c.responsibleParties.includes('REP') && c.responsibleRep ? [{ party: 'REP' as const, name: c.responsibleRep.name, messages: thread('REP') }] : []),
        ...(c.responsibleParties.includes('DRIVER') && c.responsibleDriver ? [{ party: 'DRIVER' as const, name: c.responsibleDriver.name, messages: thread('DRIVER') }] : []),
      ],
    };
  }

  // ── Files ────────────────────────────────────────────────────────────────────

  /**
   * Streams a complaint attachment. For a rep / driver (`party` + `partyId`) the file must belong to
   * their own thread of a complaint that names them.
   */
  async openAttachment(attachmentId: string, viewer?: { party: ThreadParty; partyId: string }) {
    const a = await this.prisma.complaintAttachment.findUnique({
      where: { id: attachmentId },
      select: { fileUrl: true, fileName: true, mimeType: true, complaint: { select: { deletedAt: true, responsibleParties: true, responsibleRepId: true, responsibleDriverId: true } }, message: { select: { party: true } } },
    });
    if (!a || a.complaint.deletedAt) throw new NotFoundException('File not found');
    if (viewer) {
      const c = a.complaint;
      const named = viewer.party === 'REP' ? c.responsibleParties.includes('REP') && c.responsibleRepId === viewer.partyId : c.responsibleParties.includes('DRIVER') && c.responsibleDriverId === viewer.partyId;
      if (!named || a.message?.party !== viewer.party) throw new NotFoundException('File not found');
    }
    if (isDriveFileId(a.fileUrl)) {
      const r = await this.drive.getFileStream(a.fileUrl);
      if (!r) throw new NotFoundException('File not available (Drive not reachable)');
      return { stream: r.stream as Readable, mimeType: a.mimeType || r.mimeType, fileName: a.fileName };
    }
    const local = path.join(process.cwd(), a.fileUrl.replace(/^\/+/, ''));
    if (!local.startsWith(path.join(process.cwd(), 'uploads')) || !fs.existsSync(local)) throw new NotFoundException('File not found');
    return { stream: fs.createReadStream(local) as unknown as Readable, mimeType: a.mimeType || 'application/octet-stream', fileName: a.fileName };
  }
}
