import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ChatMessageKind } from '../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushNotificationsService } from '../push-notifications/push-notifications.service.js';
import {
  CHAT_IMAGE_MAX_EDGE,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  CHAT_MAX_VOICE_SEC,
  CHAT_NON_STAFF_ROLES,
  CHAT_ONLINE_WINDOW_MS,
  CHAT_PORTAL_ROLES,
  type ChatPortalRole,
  sniffAudio,
} from './chat.constants.js';
import type { SendMessageDto, UpdateChatSettingsDto } from './dto/chat.dto.js';

/** The caller as the JWT strategy hands it over. */
export interface ChatActor {
  sub: string;
  role: string;
}

type Side = 'PORTAL' | 'STAFF';

/** Mirrors the column defaults, for a database with no company_settings row yet. */
const DEFAULT_CONTACT_ROLES = {
  driver: ['dispatcher', 'dispatch-operator', 'dispatch-manager'],
  rep: ['online-manager', 'online-operator'],
};

/**
 * Attachments live on the uploads volume (shared by every backend pod) in a
 * dot-folder: express.static ignores dot-segments, so the public /uploads
 * route can never serve them. They are only streamed by streamAttachment().
 */
const CHAT_DIR = path.join(process.cwd(), 'uploads', '.chat');

const PERSON_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
  deletedAt: true,
  roleRef: { select: { name: true, slug: true } },
} as const;

type Person = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

const isPortalRole = (role: string): role is ChatPortalRole =>
  (CHAT_PORTAL_ROLES as readonly string[]).includes(role);

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  // ─── Settings ──────────────────────────────────────────────────────────────

  /** Which staff roles (Role.slug) drivers / reps can message. */
  async contactRoles(): Promise<{ driver: string[]; rep: string[] }> {
    const s = await this.prisma.companySettings.findFirst({
      select: { chatDriverContactRoles: true, chatRepContactRoles: true },
    });
    return s
      ? { driver: s.chatDriverContactRoles, rep: s.chatRepContactRoles }
      : DEFAULT_CONTACT_ROLES;
  }

  /** Settings card: the two role lists plus every staff role to choose from. */
  async getSettings() {
    const [roles, all] = await Promise.all([
      this.contactRoles(),
      this.prisma.role.findMany({
        where: { isActive: true, slug: { notIn: ['rep', 'driver', 'supplier', 'b2c-client'] } },
        select: { slug: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { driverContactRoles: roles.driver, repContactRoles: roles.rep, availableRoles: all };
  }

  async updateSettings(dto: UpdateChatSettingsDto) {
    const known = new Set(
      (await this.prisma.role.findMany({ select: { slug: true } })).map((r) => r.slug),
    );
    const clean = (list?: string[]) => {
      if (list === undefined) return undefined;
      const unique = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
      const bad = unique.filter((s) => !known.has(s));
      if (bad.length) throw new BadRequestException(`Unknown role(s): ${bad.join(', ')}`);
      return unique;
    };
    const data: Prisma.CompanySettingsUpdateInput = {};
    const driver = clean(dto.driverContactRoles);
    const rep = clean(dto.repContactRoles);
    if (driver) data.chatDriverContactRoles = driver;
    if (rep) data.chatRepContactRoles = rep;

    const existing = await this.prisma.companySettings.findFirst({ select: { id: true } });
    if (existing) {
      await this.prisma.companySettings.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.companySettings.create({
        data: { chatDriverContactRoles: driver, chatRepContactRoles: rep },
      });
    }
    return this.getSettings();
  }

  // ─── Who may talk to whom ──────────────────────────────────────────────────

  private async loadPerson(userId: string): Promise<Person | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: PERSON_SELECT });
  }

  private sideOf(role: string): Side | null {
    if (isPortalRole(role)) return 'PORTAL';
    if (CHAT_NON_STAFF_ROLES.includes(role)) return null;
    return 'STAFF';
  }

  /** Which portal roles a staff user may chat with, from their role slug. */
  private staffReach(
    person: Pick<Person, 'roleRef'>,
    roles: { driver: string[]; rep: string[] },
  ): ChatPortalRole[] {
    const slug = person.roleRef?.slug;
    if (!slug) return [];
    const out: ChatPortalRole[] = [];
    if (roles.driver.includes(slug)) out.push('DRIVER');
    if (roles.rep.includes(slug)) out.push('REP');
    return out;
  }

  private isLive(p: Pick<Person, 'isActive' | 'deletedAt'>): boolean {
    return p.isActive && !p.deletedAt;
  }

  /**
   * Can `portal` (a REP/DRIVER) and `staff` talk? True when the staff user's
   * role is in the contact list for the portal user's role.
   */
  private canPair(
    portal: Person,
    staff: Person,
    roles: { driver: string[]; rep: string[] },
  ): boolean {
    if (!isPortalRole(portal.role) || this.sideOf(staff.role) !== 'STAFF') return false;
    if (!this.isLive(portal) || !this.isLive(staff)) return false;
    return this.staffReach(staff, roles).includes(portal.role);
  }

  // ─── Me / unread ───────────────────────────────────────────────────────────

  /**
   * What the chat UI needs on every poll: whether chat is available, and the
   * unread total plus the newest unread message (the admin widget opens on it).
   */
  async me(actor: ChatActor) {
    const side = this.sideOf(actor.role);
    if (!side) return { enabled: false as const };
    const [person, roles] = await Promise.all([this.loadPerson(actor.sub), this.contactRoles()]);
    if (!person) return { enabled: false as const };

    const reach = side === 'STAFF' ? this.staffReach(person, roles) : [];
    const unread = await this.unreadByConversation(actor.sub, side);
    let unreadTotal = 0;
    let latest: { conversationId: string; at: Date } | null = null;
    for (const [conversationId, u] of unread) {
      unreadTotal += u.count;
      if (!latest || u.latestAt > latest.at) latest = { conversationId, at: u.latestAt };
    }
    const hasHistory =
      side === 'STAFF' && reach.length === 0
        ? (await this.prisma.chatConversation.count({ where: { staffUserId: actor.sub } })) > 0
        : false;

    return {
      enabled: side === 'PORTAL' || reach.length > 0 || hasHistory,
      side,
      canStartWith: side === 'STAFF' ? reach : [],
      unreadTotal,
      latestUnread: latest
        ? { conversationId: latest.conversationId, at: latest.at.toISOString() }
        : null,
    };
  }

  /** conversationId → unread count + newest unread instant, for one user. */
  private async unreadByConversation(
    userId: string,
    side: Side,
  ): Promise<Map<string, { count: number; latestAt: Date }>> {
    const rows =
      side === 'STAFF'
        ? await this.prisma.$queryRaw<{ id: string; n: bigint; latest: Date }[]>`
            SELECT c.id, COUNT(m.id) AS n, MAX(m.created_at) AS latest
            FROM chat_conversations c
            JOIN chat_messages m ON m.conversation_id = c.id
             AND m.sender_id <> ${userId}
             AND m.created_at > COALESCE(c.staff_last_read_at, 'epoch'::timestamp)
            WHERE c.staff_user_id = ${userId}
            GROUP BY c.id`
        : await this.prisma.$queryRaw<{ id: string; n: bigint; latest: Date }[]>`
            SELECT c.id, COUNT(m.id) AS n, MAX(m.created_at) AS latest
            FROM chat_conversations c
            JOIN chat_messages m ON m.conversation_id = c.id
             AND m.sender_id <> ${userId}
             AND m.created_at > COALESCE(c.portal_last_read_at, 'epoch'::timestamp)
            WHERE c.portal_user_id = ${userId}
            GROUP BY c.id`;
    return new Map(rows.map((r) => [r.id, { count: Number(r.n), latestAt: r.latest }]));
  }

  private async onlineSet(userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: { in: userIds },
        endedAt: null,
        lastSeenAt: { gte: new Date(Date.now() - CHAT_ONLINE_WINDOW_MS) },
      },
      select: { userId: true },
    });
    return new Set(sessions.map((s) => s.userId));
  }

  // ─── Conversations ─────────────────────────────────────────────────────────

  /** Every thread the caller is in, newest activity first. */
  async listConversations(actor: ChatActor) {
    const side = this.requireSide(actor);
    const convs = await this.prisma.chatConversation.findMany({
      where: side === 'STAFF' ? { staffUserId: actor.sub } : { portalUserId: actor.sub },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: {
        portalUser: { select: PERSON_SELECT },
        staffUser: { select: PERSON_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const unread = await this.unreadByConversation(actor.sub, side);
    const others = convs.map((c) => (side === 'STAFF' ? c.portalUser : c.staffUser));
    const online = await this.onlineSet(others.map((o) => o.id));

    return convs.map((c, i) => {
      const other = others[i];
      const last = c.messages[0];
      return {
        id: c.id,
        portalRole: c.portalRole,
        other: this.personView(other, online),
        lastMessage: last
          ? {
              kind: last.kind,
              body: last.body ? last.body.slice(0, 120) : null,
              fromMe: last.senderId === actor.sub,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unread: unread.get(c.id)?.count ?? 0,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      };
    });
  }

  private personView(p: Person, online: Set<string>) {
    return {
      userId: p.id,
      name: p.name,
      role: p.role,
      roleName: p.roleRef?.name ?? p.role,
      online: online.has(p.id),
      active: this.isLive(p),
    };
  }

  /**
   * People the caller may start a chat with. Portal users get the staff in
   * their role's contact list; staff get drivers and/or reps with a portal
   * account, depending on their own role.
   */
  async contacts(actor: ChatActor, search?: string, role?: ChatPortalRole) {
    const side = this.requireSide(actor);
    const roles = await this.contactRoles();
    const q = search?.trim();
    const nameFilter = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};

    let people: Person[];
    if (side === 'PORTAL') {
      const slugs = actor.role === 'DRIVER' ? roles.driver : roles.rep;
      people = slugs.length
        ? await this.prisma.user.findMany({
            where: {
              isActive: true,
              deletedAt: null,
              role: { notIn: CHAT_NON_STAFF_ROLES as never[] },
              roleRef: { slug: { in: slugs } },
              ...nameFilter,
            },
            select: PERSON_SELECT,
            orderBy: { name: 'asc' },
            take: 200,
          })
        : [];
    } else {
      const me = await this.loadPerson(actor.sub);
      const reach = me ? this.staffReach(me, roles) : [];
      const wanted = role ? reach.filter((r) => r === role) : reach;
      people = wanted.length
        ? await this.prisma.user.findMany({
            where: {
              isActive: true,
              deletedAt: null,
              role: { in: wanted },
              OR: [
                { driver: { is: { isActive: true, deletedAt: null } } },
                { rep: { is: { isActive: true, deletedAt: null } } },
              ],
              ...nameFilter,
            },
            select: PERSON_SELECT,
            orderBy: { name: 'asc' },
            take: 100,
          })
        : [];
    }
    const online = await this.onlineSet(people.map((p) => p.id));
    return people.map((p) => this.personView(p, online));
  }

  /** Get or create the thread between the caller and `otherUserId`. */
  async openConversation(actor: ChatActor, otherUserId: string) {
    const side = this.requireSide(actor);
    if (otherUserId === actor.sub) throw new BadRequestException('You cannot chat with yourself');
    const [me, other, roles] = await Promise.all([
      this.loadPerson(actor.sub),
      this.loadPerson(otherUserId),
      this.contactRoles(),
    ]);
    if (!me || !other) throw new NotFoundException('User not found');
    const portal = side === 'PORTAL' ? me : other;
    const staff = side === 'PORTAL' ? other : me;
    if (!this.canPair(portal, staff, roles)) {
      throw new ForbiddenException('You cannot start a chat with this user');
    }

    const conv = await this.prisma.chatConversation.upsert({
      where: { portalUserId_staffUserId: { portalUserId: portal.id, staffUserId: staff.id } },
      update: {},
      create: {
        portalUserId: portal.id,
        staffUserId: staff.id,
        portalRole: portal.role as ChatPortalRole,
        createdById: actor.sub,
      },
    });
    return { id: conv.id };
  }

  /** The thread header: who the other side is and how far they have read. */
  async getConversation(actor: ChatActor, conversationId: string) {
    const { conv, side } = await this.participant(actor, conversationId);
    const other = side === 'STAFF' ? conv.portalUser : conv.staffUser;
    const online = await this.onlineSet([other.id]);
    return {
      id: conv.id,
      portalRole: conv.portalRole,
      other: this.personView(other, online),
      otherLastReadAt:
        (side === 'STAFF' ? conv.portalLastReadAt : conv.staffLastReadAt)?.toISOString() ?? null,
    };
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  async listMessages(
    actor: ChatActor,
    conversationId: string,
    opts: { after?: string; before?: string; limit?: number },
  ) {
    const { conv, side } = await this.participant(actor, conversationId);
    const limit = opts.limit ?? 50;
    let rows;
    if (opts.after) {
      rows = await this.prisma.chatMessage.findMany({
        where: { conversationId, createdAt: { gt: new Date(opts.after) } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
    } else {
      rows = (
        await this.prisma.chatMessage.findMany({
          where: {
            conversationId,
            ...(opts.before && { createdAt: { lt: new Date(opts.before) } }),
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
      ).reverse();
    }
    return {
      messages: rows.map((m) => this.messageView(m, actor.sub)),
      otherLastReadAt:
        (side === 'STAFF' ? conv.portalLastReadAt : conv.staffLastReadAt)?.toISOString() ?? null,
      hasMore: !opts.after && rows.length === limit,
    };
  }

  private messageView(
    m: {
      id: string;
      senderId: string;
      kind: ChatMessageKind;
      body: string | null;
      attachmentPath: string | null;
      attachmentMime: string | null;
      attachmentSize: number | null;
      durationSec: number | null;
      createdAt: Date;
    },
    me: string,
  ) {
    return {
      id: m.id,
      fromMe: m.senderId === me,
      kind: m.kind,
      body: m.body,
      hasAttachment: !!m.attachmentPath,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      durationSec: m.durationSec,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async sendMessage(
    actor: ChatActor,
    conversationId: string,
    dto: SendMessageDto,
    file?: { buffer: Buffer; size: number; mimetype: string },
  ) {
    const { conv, side } = await this.participant(actor, conversationId);

    // Both people must still be allowed to talk — a staff user moved to a role
    // outside the contact list (or deactivated) can no longer be messaged.
    const roles = await this.contactRoles();
    if (!this.canPair(conv.portalUser, conv.staffUser, roles)) {
      throw new ForbiddenException(
        side === 'PORTAL'
          ? 'This person is no longer available for chat. Pick someone else from the list.'
          : 'This user can no longer receive chat messages.',
      );
    }

    const body = dto.body?.trim() || null;
    if (body && body.length > CHAT_MAX_TEXT) throw new BadRequestException('Message is too long');

    let stored: { rel: string; mime: string; size: number } | null = null;
    const id = randomUUID();
    if (dto.kind === 'TEXT') {
      if (!body) throw new BadRequestException('Message is empty');
      if (file) throw new BadRequestException('A text message cannot carry a file');
    } else {
      if (!file?.buffer?.length) throw new BadRequestException('Attachment is missing');
      if (file.size > CHAT_MAX_FILE_BYTES) throw new BadRequestException('File is larger than 10 MB');
      stored =
        dto.kind === 'IMAGE'
          ? await this.storeImage(conversationId, id, file.buffer)
          : await this.storeVoice(conversationId, id, file.buffer);
      if (dto.kind === 'VOICE') {
        const d = dto.durationSec ?? 0;
        if (d < 1 || d > CHAT_MAX_VOICE_SEC) {
          await this.removeFile(stored.rel);
          throw new BadRequestException('Voice note must be 1 s to 5 min long');
        }
      }
    }

    try {
      const now = new Date();
      const [msg] = await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: {
            id,
            conversationId,
            senderId: actor.sub,
            kind: dto.kind,
            body,
            attachmentPath: stored?.rel ?? null,
            attachmentMime: stored?.mime ?? null,
            attachmentSize: stored?.size ?? null,
            durationSec: dto.kind === 'VOICE' ? (dto.durationSec ?? null) : null,
            createdAt: now,
          },
        }),
        this.prisma.chatConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            ...(side === 'STAFF' ? { staffLastReadAt: now } : { portalLastReadAt: now }),
          },
        }),
      ]);
      if (side === 'STAFF') this.pushToPortal(conv, msg.kind, body);
      return this.messageView(msg, actor.sub);
    } catch (err) {
      if (stored) await this.removeFile(stored.rel);
      throw err;
    }
  }

  /** Mark everything in the thread read for the caller. */
  async markRead(actor: ChatActor, conversationId: string) {
    const { side } = await this.participant(actor, conversationId);
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: side === 'STAFF' ? { staffLastReadAt: new Date() } : { portalLastReadAt: new Date() },
    });
  }

  /** Absolute path + type of a message's attachment, after a participant check. */
  async attachment(actor: ChatActor, messageId: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, attachmentPath: true, attachmentMime: true },
    });
    if (!msg?.attachmentPath) throw new NotFoundException('Attachment not found');
    await this.participant(actor, msg.conversationId);
    const abs = path.join(CHAT_DIR, msg.attachmentPath);
    if (!abs.startsWith(CHAT_DIR + path.sep)) throw new NotFoundException('Attachment not found');
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('Attachment file is missing');
    }
    return { path: abs, mime: msg.attachmentMime ?? 'application/octet-stream' };
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  /**
   * Staff → rep/driver: phone/browser push so they see it with the portal
   * closed. One notification per thread (same tag) — a burst of messages
   * replaces rather than stacks. Fire-and-forget.
   */
  private pushToPortal(
    conv: { id: string; portalUserId: string; portalRole: string; staffUser: { name: string } },
    kind: ChatMessageKind,
    body: string | null,
  ) {
    const preview =
      kind === 'IMAGE'
        ? `📷 Photo${body ? ` — ${body}` : ''}`
        : kind === 'VOICE'
          ? '🎤 Voice note'
          : (body ?? '');
    const base = conv.portalRole === 'REP' ? '/rep' : '/driver';
    this.push
      .sendToUser(conv.portalUserId, `💬 ${conv.staffUser.name}`, preview.slice(0, 180), {
        type: 'CHAT',
        conversationId: conv.id,
        url: `${base}/chat?c=${conv.id}`,
        tag: `chat-${conv.id}`,
      })
      .catch((err) => this.logger.warn(`Chat push failed: ${String(err)}`));
  }

  private requireSide(actor: ChatActor): Side {
    const side = this.sideOf(actor.role);
    if (!side) throw new ForbiddenException('Chat is not available for this account');
    return side;
  }

  private async participant(actor: ChatActor, conversationId: string) {
    const side = this.requireSide(actor);
    const conv = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: { portalUser: { select: PERSON_SELECT }, staffUser: { select: PERSON_SELECT } },
    });
    const mine =
      conv && (side === 'STAFF' ? conv.staffUserId === actor.sub : conv.portalUserId === actor.sub);
    if (!conv || !mine) throw new NotFoundException('Conversation not found');
    return { conv, side };
  }

  /** Validate + normalise an image: re-encoded JPEG, EXIF (incl. GPS) stripped. */
  private async storeImage(conversationId: string, id: string, buf: Buffer) {
    let out: Buffer;
    try {
      out = await sharp(buf, { failOn: 'error' })
        .rotate()
        .resize({
          width: CHAT_IMAGE_MAX_EDGE,
          height: CHAT_IMAGE_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('That file is not a supported image');
    }
    return this.writeFile(conversationId, `${id}.jpg`, out, 'image/jpeg');
  }

  private async storeVoice(conversationId: string, id: string, buf: Buffer) {
    const kind = sniffAudio(buf);
    if (!kind) throw new BadRequestException('That file is not a supported voice recording');
    return this.writeFile(conversationId, `${id}.${kind[1]}`, buf, kind[0]);
  }

  private async writeFile(conversationId: string, name: string, buf: Buffer, mime: string) {
    const rel = path.join(conversationId, name);
    const abs = path.join(CHAT_DIR, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return { rel, mime, size: buf.length };
  }

  private async removeFile(rel: string) {
    try {
      await fs.unlink(path.join(CHAT_DIR, rel));
    } catch (err) {
      this.logger.warn(`Could not remove orphan chat file ${rel}: ${String(err)}`);
    }
  }
}
