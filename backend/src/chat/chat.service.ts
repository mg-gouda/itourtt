import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type ChatBroadcastAudience,
  type ChatMessageKind,
} from '../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushNotificationsService } from '../push-notifications/push-notifications.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  CHAT_ANNOUNCEMENTS_ID,
  CHAT_BROADCAST_PERMISSION,
  CHAT_IMAGE_MAX_EDGE,
  CHAT_MAX_FILE_BYTES,
  CHAT_MAX_TEXT,
  CHAT_MAX_VOICE_SEC,
  CHAT_NON_STAFF_ROLES,
  CHAT_ONLINE_WINDOW_MS,
  CHAT_PORTAL_ROLES,
  type ChatPortalRole,
  sniffAudio,
  transcodeToAac,
} from './chat.constants.js';
import type {
  ForwardMessageDto,
  SendBroadcastDto,
  SendMessageDto,
  UpdateChatSettingsDto,
} from './dto/chat.dto.js';

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
  staff: ['admin', 'dispatch-manager', 'dispatch-operator', 'dispatcher', 'online-manager', 'online-operator'],
};
type ContactRoles = { driver: string[]; rep: string[]; staff: string[] };
/** A thread as stored: who sits in which column decides each person's "side" in it (6.2.0). */
type ConvRow = { kind: string; portalUserId: string; staffUserId: string };

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

/** Delivery state of a message the caller sent, as shown by its ticks. */
export type ChatMessageStatus = 'SENT' | 'DELIVERED' | 'SEEN';

/** The content fields a message and a broadcast share. */
interface MessageContent {
  kind: ChatMessageKind;
  body: string | null;
  attachmentPath: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  durationSec: number | null;
  latitude: Prisma.Decimal | number | null;
  longitude: Prisma.Decimal | number | null;
  accuracyM: number | null;
}

const num = (d: Prisma.Decimal | number | null) => (d === null ? null : Number(d));

/** SENT → DELIVERED → SEEN from the other side's "up to" timestamps. */
function statusOf(createdAt: Date, deliveredAt: Date | null, readAt: Date | null): ChatMessageStatus {
  if (readAt && readAt >= createdAt) return 'SEEN';
  if (deliveredAt && deliveredAt >= createdAt) return 'DELIVERED';
  return 'SENT';
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
    private readonly permissions: PermissionsGuard,
  ) {}

  // ─── Settings ──────────────────────────────────────────────────────────────

  /** Which staff roles (Role.slug) drivers / reps can message. */
  async contactRoles(): Promise<ContactRoles> {
    const s = await this.prisma.companySettings.findFirst({
      select: { chatDriverContactRoles: true, chatRepContactRoles: true, chatStaffContactRoles: true },
    });
    return s
      ? { driver: s.chatDriverContactRoles, rep: s.chatRepContactRoles, staff: s.chatStaffContactRoles }
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
    return { driverContactRoles: roles.driver, repContactRoles: roles.rep, staffContactRoles: roles.staff, availableRoles: all };
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
    const staff = clean(dto.staffContactRoles);
    if (driver) data.chatDriverContactRoles = driver;
    if (rep) data.chatRepContactRoles = rep;
    if (staff) data.chatStaffContactRoles = staff;

    const existing = await this.prisma.companySettings.findFirst({ select: { id: true } });
    if (existing) {
      await this.prisma.companySettings.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.companySettings.create({
        data: { chatDriverContactRoles: driver, chatRepContactRoles: rep, chatStaffContactRoles: staff },
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
    roles: ContactRoles,
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

  /** An office user whose role may reach every other office user (Settings › chat, "office staff"). */
  private reachesStaff(p: Person, roles: ContactRoles): boolean {
    return this.sideOf(p.role) === 'STAFF' && this.isLive(p) && !!p.roleRef?.slug && roles.staff.includes(p.roleRef.slug);
  }

  /** Two office users may talk when both are live staff and at least one of them reaches staff. */
  private canPairStaff(a: Person, b: Person, roles: ContactRoles): boolean {
    if (a.id === b.id) return false;
    if (this.sideOf(a.role) !== 'STAFF' || this.sideOf(b.role) !== 'STAFF') return false;
    if (!this.isLive(a) || !this.isLive(b)) return false;
    return this.reachesStaff(a, roles) || this.reachesStaff(b, roles);
  }

  /** Whether the two people in a thread may still message each other. */
  private canTalk(conv: ConvRow & { portalUser: Person; staffUser: Person }, roles: ContactRoles): boolean {
    return conv.kind === 'STAFF'
      ? this.canPairStaff(conv.portalUser, conv.staffUser, roles)
      : this.canPair(conv.portalUser, conv.staffUser, roles);
  }

  /** The caller's column in a thread: PORTAL = portalUserId, STAFF = staffUserId. */
  private slotOf(conv: ConvRow, userId: string): Side {
    return conv.portalUserId === userId ? 'PORTAL' : 'STAFF';
  }

  /**
   * Can `portal` (a REP/DRIVER) and `staff` talk? True when the staff user's
   * role is in the contact list for the portal user's role.
   */
  private canPair(
    portal: Person,
    staff: Person,
    roles: ContactRoles,
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
    const staffChat = side === 'STAFF' && this.reachesStaff(person, roles);
    // This poll is the proof that the caller's app is up: everything waiting
    // for them now counts as delivered.
    await this.markDelivered(actor.sub, side);
    const [unread, ann, canBroadcast] = await Promise.all([
      this.unreadByConversation(actor.sub, side),
      this.announcementUnread(actor.sub),
      side === 'STAFF' ? this.canBroadcast(actor.sub) : Promise.resolve(false),
    ]);
    let unreadTotal = ann.count;
    let latest: { conversationId: string; at: Date } | null = ann.latestAt
      ? { conversationId: CHAT_ANNOUNCEMENTS_ID, at: ann.latestAt }
      : null;
    for (const [conversationId, u] of unread) {
      unreadTotal += u.count;
      if (!latest || u.latestAt > latest.at) latest = { conversationId, at: u.latestAt };
    }
    const hasHistory =
      side === 'STAFF' && reach.length === 0 && !staffChat && !canBroadcast
        ? (await this.prisma.chatConversation.count({ where: { OR: [{ staffUserId: actor.sub }, { portalUserId: actor.sub }] } })) > 0 ||
          (await this.prisma.chatBroadcastRecipient.count({ where: { userId: actor.sub } })) > 0
        : false;

    return {
      enabled: side === 'PORTAL' || reach.length > 0 || staffChat || canBroadcast || hasHistory,
      side,
      canStartWith: side === 'STAFF' ? [...reach, ...(staffChat ? (['STAFF'] as const) : [])] : [],
      canBroadcast,
      announcementsUnread: ann.count,
      unreadTotal,
      latestUnread: latest
        ? { conversationId: latest.conversationId, at: latest.at.toISOString() }
        : null,
    };
  }

  /** conversationId → unread count + newest unread instant, for one user (either column of a thread). */
  private async unreadByConversation(
    userId: string,
    _side?: Side,
  ): Promise<Map<string, { count: number; latestAt: Date }>> {
    const rows = await this.prisma.$queryRaw<{ id: string; n: bigint; latest: Date }[]>`
      SELECT c.id, COUNT(m.id) AS n, MAX(m.created_at) AS latest
      FROM chat_conversations c
      JOIN chat_messages m ON m.conversation_id = c.id
       AND m.sender_id <> ${userId}
       AND m.created_at > COALESCE(
         CASE WHEN c.staff_user_id = ${userId} THEN c.staff_last_read_at ELSE c.portal_last_read_at END,
         'epoch'::timestamp)
      WHERE c.staff_user_id = ${userId} OR c.portal_user_id = ${userId}
      GROUP BY c.id`;
    return new Map(rows.map((r) => [r.id, { count: Number(r.n), latestAt: r.latest }]));
  }

  /**
   * Mark everything waiting for this user as delivered: their side of every
   * thread with a newer message, and every broadcast not yet delivered.
   * Field-reference compare so only stale rows are written.
   */
  private async markDelivered(userId: string, side: Side) {
    const now = new Date();
    const c = this.prisma.chatConversation.fields;
    void side; // both columns: an office user can sit on either side of an office thread
    await Promise.all([
      this.prisma.chatConversation.updateMany({
            where: {
              staffUserId: userId,
              lastMessageAt: { not: null },
              OR: [
                { staffLastDeliveredAt: null },
                { lastMessageAt: { gt: c.staffLastDeliveredAt } },
              ],
            },
            data: { staffLastDeliveredAt: now },
          }),
      this.prisma.chatConversation.updateMany({
            where: {
              portalUserId: userId,
              lastMessageAt: { not: null },
              OR: [
                { portalLastDeliveredAt: null },
                { lastMessageAt: { gt: c.portalLastDeliveredAt } },
              ],
            },
            data: { portalLastDeliveredAt: now },
          }),
      this.prisma.chatBroadcastRecipient.updateMany({
        where: { userId, deliveredAt: null },
        data: { deliveredAt: now },
      }),
    ]);
  }

  private async canBroadcast(userId: string): Promise<boolean> {
    return (await this.permissions.getUserPermissions(userId)).has(CHAT_BROADCAST_PERMISSION);
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
    await this.markDelivered(actor.sub, side);
    const convs = await this.prisma.chatConversation.findMany({
      where: { OR: [{ staffUserId: actor.sub }, { portalUserId: actor.sub }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      include: {
        portalUser: { select: PERSON_SELECT },
        staffUser: { select: PERSON_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const unread = await this.unreadByConversation(actor.sub, side);
    void side;
    const slots = convs.map((c) => this.slotOf(c, actor.sub));
    const others = convs.map((c, i) => (slots[i] === 'STAFF' ? c.portalUser : c.staffUser));
    const online = await this.onlineSet(others.map((o) => o.id));

    return convs.map((c, i) => {
      const other = others[i];
      const last = c.messages[0];
      const fromMe = last?.senderId === actor.sub;
      const mine = slots[i];
      return {
        id: c.id,
        kind: c.kind,
        portalRole: c.portalRole,
        other: this.personView(other, online),
        lastMessage: last
          ? {
              kind: last.kind,
              body: last.body ? last.body.slice(0, 120) : null,
              fromMe,
              status: fromMe
                ? statusOf(
                    last.createdAt,
                    mine === 'STAFF' ? c.portalLastDeliveredAt : c.staffLastDeliveredAt,
                    mine === 'STAFF' ? c.portalLastReadAt : c.staffLastReadAt,
                  )
                : null,
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
  async contacts(actor: ChatActor, search?: string, role?: ChatPortalRole | 'STAFF') {
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
      // Office staff (6.2.0): roles in the "office staff" list see every other live office user.
      const staffPeople =
        me && this.reachesStaff(me, roles) && (!role || role === 'STAFF')
          ? await this.prisma.user.findMany({
              where: {
                isActive: true,
                deletedAt: null,
                id: { not: actor.sub },
                role: { notIn: CHAT_NON_STAFF_ROLES as never[] },
                ...nameFilter,
              },
              select: PERSON_SELECT,
              orderBy: { name: 'asc' },
              take: 200,
            })
          : [];
      people = staffPeople;
      if (role === 'STAFF') wanted.length = 0;
      people = [...people, ...(wanted.length
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
        : [])];
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

    // Two office users (6.2.0): one thread per pair, whichever of them opened it.
    if (side === 'STAFF' && this.sideOf(other.role) === 'STAFF') {
      if (!this.canPairStaff(me, other, roles)) throw new ForbiddenException('You cannot start a chat with this user');
      const existing = await this.prisma.chatConversation.findFirst({
        where: {
          OR: [
            { portalUserId: me.id, staffUserId: other.id },
            { portalUserId: other.id, staffUserId: me.id },
          ],
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id };
      const created = await this.prisma.chatConversation.create({
        data: {
          kind: 'STAFF',
          portalUserId: other.id,
          staffUserId: me.id,
          portalRole: other.role as never,
          createdById: actor.sub,
        },
      });
      return { id: created.id };
    }

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
      kind: conv.kind,
      portalRole: conv.portalRole,
      other: this.personView(other, online),
      ...this.otherReceipts(conv, side),
    };
  }

  /** How far the other participant has received / read the thread. */
  private otherReceipts(
    conv: {
      portalLastReadAt: Date | null;
      staffLastReadAt: Date | null;
      portalLastDeliveredAt: Date | null;
      staffLastDeliveredAt: Date | null;
    },
    side: Side,
  ) {
    const read = side === 'STAFF' ? conv.portalLastReadAt : conv.staffLastReadAt;
    const delivered = side === 'STAFF' ? conv.portalLastDeliveredAt : conv.staffLastDeliveredAt;
    return {
      otherLastReadAt: read?.toISOString() ?? null,
      // Reading implies delivery, whichever was recorded later.
      otherLastDeliveredAt:
        (delivered && read ? (delivered > read ? delivered : read) : (delivered ?? read))?.toISOString() ??
        null,
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
      ...this.otherReceipts(conv, side),
      hasMore: !opts.after && rows.length === limit,
    };
  }

  private messageView(
    m: MessageContent & { id: string; senderId: string; createdAt: Date; forwarded?: boolean },
    me: string,
  ) {
    return {
      id: m.id,
      fromMe: m.senderId === me,
      forwarded: !!m.forwarded,
      ...this.contentView(m),
      createdAt: m.createdAt.toISOString(),
    };
  }

  private contentView(m: MessageContent) {
    return {
      kind: m.kind,
      body: m.body,
      hasAttachment: !!m.attachmentPath,
      attachmentMime: m.attachmentMime,
      attachmentSize: m.attachmentSize,
      durationSec: m.durationSec,
      latitude: num(m.latitude),
      longitude: num(m.longitude),
      accuracyM: m.accuracyM,
    };
  }

  /**
   * Validate a message's content (text / photo / voice / location) and store
   * its attachment under `uploads/.chat/<folder>/`. Shared by 1:1 messages and
   * broadcasts. The caller must remove `content.attachmentPath` if it then fails.
   */
  private async prepareContent(
    dto: SendMessageDto,
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
    folder: string,
    id: string,
  ): Promise<MessageContent> {
    const body = dto.body?.trim() || null;
    if (body && body.length > CHAT_MAX_TEXT) throw new BadRequestException('Message is too long');
    const content: MessageContent = {
      kind: dto.kind,
      body,
      attachmentPath: null,
      attachmentMime: null,
      attachmentSize: null,
      durationSec: null,
      latitude: null,
      longitude: null,
      accuracyM: null,
    };

    if (dto.kind === 'TEXT' || dto.kind === 'LOCATION') {
      if (file) throw new BadRequestException('This message cannot carry a file');
      if (dto.kind === 'TEXT') {
        if (!body) throw new BadRequestException('Message is empty');
        return content;
      }
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException('Location is missing');
      }
      content.latitude = Math.round(dto.latitude * 1e7) / 1e7;
      content.longitude = Math.round(dto.longitude * 1e7) / 1e7;
      content.accuracyM = dto.accuracyM !== undefined ? Math.round(dto.accuracyM) : null;
      return content;
    }

    if (!file?.buffer?.length) throw new BadRequestException('Attachment is missing');
    if (file.size > CHAT_MAX_FILE_BYTES) throw new BadRequestException('File is larger than 10 MB');
    const stored =
      dto.kind === 'IMAGE'
        ? await this.storeImage(folder, id, file.buffer)
        : await this.storeVoice(folder, id, file.buffer);
    if (dto.kind === 'VOICE') {
      const d = dto.durationSec ?? 0;
      if (d < 1 || d > CHAT_MAX_VOICE_SEC) {
        await this.removeFile(stored.rel);
        throw new BadRequestException('Voice note must be 1 s to 5 min long');
      }
      content.durationSec = d;
    }
    content.attachmentPath = stored.rel;
    content.attachmentMime = stored.mime;
    content.attachmentSize = stored.size;
    return content;
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
    if (!this.canTalk(conv, roles)) {
      throw new ForbiddenException(
        side === 'PORTAL'
          ? 'This person is no longer available for chat. Pick someone else from the list.'
          : 'This user can no longer receive chat messages.',
      );
    }

    const id = randomUUID();
    const content = await this.prepareContent(dto, file, conversationId, id);

    try {
      const now = new Date();
      const [msg] = await this.prisma.$transaction([
        this.prisma.chatMessage.create({
          data: { id, conversationId, senderId: actor.sub, ...content, createdAt: now },
        }),
        this.prisma.chatConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: now,
            ...(side === 'STAFF'
              ? { staffLastReadAt: now, staffLastDeliveredAt: now }
              : { portalLastReadAt: now, portalLastDeliveredAt: now }),
          },
        }),
      ]);
      if (side === 'STAFF' && conv.kind !== 'STAFF') this.pushToPortal(conv, msg.kind, content.body);
      else this.pushToStaff(conv, side, msg.kind, content.body);
      return { ...this.messageView(msg, actor.sub), status: 'SENT' as ChatMessageStatus };
    } catch (err) {
      if (content.attachmentPath) await this.removeFile(content.attachmentPath);
      throw err;
    }
  }

  /**
   * Forward a message to other threads / people (6.2.0). Text and locations are copied as they are;
   * photos and voice notes are copied into each target thread's folder (each thread owns its files).
   * The caller must be in the source thread and allowed to talk in every target.
   */
  async forward(actor: ChatActor, messageId: string, dto: ForwardMessageDto) {
    const src = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!src) throw new NotFoundException('Message not found');
    await this.participant(actor, src.conversationId);

    const targets = new Set<string>(dto.conversationIds ?? []);
    for (const userId of dto.userIds ?? []) targets.add((await this.openConversation(actor, userId)).id);
    if (!targets.size) throw new BadRequestException('Pick at least one chat to forward to');
    if (targets.size > 20) throw new BadRequestException('Forward to at most 20 chats at a time');

    const roles = await this.contactRoles();
    const srcFile = src.attachmentPath ? await this.resolveFile(src.attachmentPath, src.attachmentMime) : null;
    let sent = 0;
    for (const conversationId of targets) {
      const { conv, side } = await this.participant(actor, conversationId);
      if (!this.canTalk(conv, roles)) continue;
      const id = randomUUID();
      let attachmentPath: string | null = null;
      if (srcFile) {
        const rel = path.join(conversationId, `${id}${path.extname(src.attachmentPath!)}`);
        const abs = path.join(CHAT_DIR, rel);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.copyFile(srcFile.path, abs);
        attachmentPath = rel;
      }
      const now = new Date();
      try {
        await this.prisma.$transaction([
          this.prisma.chatMessage.create({
            data: {
              id, conversationId, senderId: actor.sub, forwarded: true, createdAt: now,
              kind: src.kind, body: src.body, attachmentPath, attachmentMime: src.attachmentMime,
              attachmentSize: src.attachmentSize, durationSec: src.durationSec,
              latitude: src.latitude, longitude: src.longitude, accuracyM: src.accuracyM,
            },
          }),
          this.prisma.chatConversation.update({
            where: { id: conversationId },
            data: {
              lastMessageAt: now,
              ...(side === 'STAFF'
                ? { staffLastReadAt: now, staffLastDeliveredAt: now }
                : { portalLastReadAt: now, portalLastDeliveredAt: now }),
            },
          }),
        ]);
      } catch (err) {
        if (attachmentPath) await this.removeFile(attachmentPath);
        throw err;
      }
      if (side === 'STAFF' && conv.kind !== 'STAFF') this.pushToPortal(conv, src.kind, src.body);
      else this.pushToStaff(conv, side, src.kind, src.body);
      sent++;
    }
    if (!sent) throw new ForbiddenException('None of these chats can receive messages');
    return { sent };
  }

  /** Mark everything in the thread read for the caller. */
  async markRead(actor: ChatActor, conversationId: string) {
    const { side } = await this.participant(actor, conversationId);
    const now = new Date();
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data:
        side === 'STAFF'
          ? { staffLastReadAt: now, staffLastDeliveredAt: now }
          : { portalLastReadAt: now, portalLastDeliveredAt: now },
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
    return this.resolveFile(msg.attachmentPath, msg.attachmentMime);
  }

  private async resolveFile(rel: string, mime: string | null) {
    const abs = path.join(CHAT_DIR, rel);
    if (!abs.startsWith(CHAT_DIR + path.sep)) throw new NotFoundException('Attachment not found');
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('Attachment file is missing');
    }
    return { path: abs, mime: mime ?? 'application/octet-stream' };
  }

  // ─── Broadcasts (announcements) ────────────────────────────────────────────

  /** Live users an audience covers right now (the sender is always left out). */
  private audienceWhere(audience: ChatBroadcastAudience, senderId: string): Prisma.UserWhereInput {
    const live = { isActive: true, deletedAt: null, id: { not: senderId } };
    const withRep = { role: 'REP' as const, rep: { is: { isActive: true, deletedAt: null } } };
    const withDriver = {
      role: 'DRIVER' as const,
      driver: { is: { isActive: true, deletedAt: null } },
    };
    switch (audience) {
      case 'REPS':
        return { ...live, ...withRep };
      case 'DRIVERS':
        return { ...live, ...withDriver };
      case 'REPS_AND_DRIVERS':
        return { ...live, OR: [withRep, withDriver] };
      case 'STAFF':
        return { ...live, role: { notIn: CHAT_NON_STAFF_ROLES as never[] } };
    }
  }

  /** Composer: how many people each audience reaches. */
  async broadcastAudiences(actor: ChatActor) {
    const audiences: ChatBroadcastAudience[] = ['REPS', 'DRIVERS', 'REPS_AND_DRIVERS', 'STAFF'];
    const counts = await Promise.all(
      audiences.map((a) => this.prisma.user.count({ where: this.audienceWhere(a, actor.sub) })),
    );
    return audiences.map((audience, i) => ({ audience, recipients: counts[i] }));
  }

  /** Send one announcement to a whole audience; recipients are snapshotted now. */
  async sendBroadcast(
    actor: ChatActor,
    dto: SendBroadcastDto,
    file?: { buffer: Buffer; size: number; mimetype: string },
  ) {
    const sender = await this.loadPerson(actor.sub);
    if (!sender || this.sideOf(sender.role) !== 'STAFF') {
      throw new ForbiddenException('Only office staff can send broadcasts');
    }
    const recipients = await this.prisma.user.findMany({
      where: this.audienceWhere(dto.audience, actor.sub),
      select: { id: true, role: true },
    });
    if (!recipients.length) throw new BadRequestException('Nobody is in this audience');

    const id = randomUUID();
    const content = await this.prepareContent(dto, file, path.join('broadcasts', id), id);
    try {
      const now = new Date();
      const b = await this.prisma.$transaction(async (tx) => {
        const created = await tx.chatBroadcast.create({
          data: {
            id,
            senderId: actor.sub,
            audience: dto.audience,
            ...content,
            recipientCount: recipients.length,
            createdAt: now,
          },
        });
        await tx.chatBroadcastRecipient.createMany({
          data: recipients.map((r) => ({ broadcastId: id, userId: r.id, createdAt: now })),
        });
        return created;
      });
      this.pushBroadcast(sender.name, recipients, b.kind, content.body);
      return this.sentBroadcastView(
        { ...b, sender: { name: sender.name } },
        { delivered: 0, seen: 0 },
      );
    } catch (err) {
      if (content.attachmentPath) await this.removeFile(content.attachmentPath);
      throw err;
    }
  }

  /** Every broadcast sent (newest first) with delivered / seen counts. */
  async listSentBroadcasts(opts: { before?: string; limit?: number }) {
    const limit = opts.limit ?? 30;
    const rows = await this.prisma.chatBroadcast.findMany({
      where: opts.before ? { createdAt: { lt: new Date(opts.before) } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { name: true } } },
    });
    const ids = rows.map((r) => r.id);
    const [delivered, seen] = ids.length
      ? await Promise.all([
          this.prisma.chatBroadcastRecipient.groupBy({
            by: ['broadcastId'],
            where: { broadcastId: { in: ids }, OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }] },
            _count: { _all: true },
          }),
          this.prisma.chatBroadcastRecipient.groupBy({
            by: ['broadcastId'],
            where: { broadcastId: { in: ids }, readAt: { not: null } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const d = new Map(delivered.map((g) => [g.broadcastId, g._count._all]));
    const r = new Map(seen.map((g) => [g.broadcastId, g._count._all]));
    return {
      broadcasts: rows.map((b) =>
        this.sentBroadcastView(b, { delivered: d.get(b.id) ?? 0, seen: r.get(b.id) ?? 0 }),
      ),
      hasMore: rows.length === limit,
    };
  }

  private sentBroadcastView(
    b: MessageContent & {
      id: string;
      senderId: string;
      audience: ChatBroadcastAudience;
      recipientCount: number;
      createdAt: Date;
      sender: { name: string };
    },
    counts: { delivered: number; seen: number },
  ) {
    return {
      id: b.id,
      senderName: b.sender.name,
      audience: b.audience,
      ...this.contentView(b),
      recipientCount: b.recipientCount,
      deliveredCount: counts.delivered,
      seenCount: counts.seen,
      createdAt: b.createdAt.toISOString(),
    };
  }

  /** Who a broadcast went to and how far it got with each of them. */
  async broadcastRecipients(broadcastId: string) {
    const exists = await this.prisma.chatBroadcast.count({ where: { id: broadcastId } });
    if (!exists) throw new NotFoundException('Broadcast not found');
    const rows = await this.prisma.chatBroadcastRecipient.findMany({
      where: { broadcastId },
      include: { user: { select: PERSON_SELECT } },
    });
    const view = rows.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      role: r.user.role,
      roleName: r.user.roleRef?.name ?? r.user.role,
      status: statusOf(new Date(0), r.deliveredAt ?? r.readAt, r.readAt),
      deliveredAt: (r.deliveredAt ?? r.readAt)?.toISOString() ?? null,
      readAt: r.readAt?.toISOString() ?? null,
    }));
    const rank = { SEEN: 0, DELIVERED: 1, SENT: 2 } as const;
    return view.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
  }

  /** Unread announcements for a user: count + newest. */
  private async announcementUnread(userId: string) {
    const agg = await this.prisma.chatBroadcastRecipient.aggregate({
      where: { userId, readAt: null },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    return { count: agg._count._all, latestAt: agg._max.createdAt };
  }

  /** Inbox row for the pinned announcements thread (null when there are none). */
  async announcementsSummary(actor: ChatActor) {
    this.requireSide(actor);
    const [last, unread] = await Promise.all([
      this.prisma.chatBroadcastRecipient.findFirst({
        where: { userId: actor.sub },
        orderBy: { createdAt: 'desc' },
        include: { broadcast: { include: { sender: { select: { name: true } } } } },
      }),
      this.announcementUnread(actor.sub),
    ]);
    if (!last) return null;
    return {
      unread: unread.count,
      last: {
        kind: last.broadcast.kind,
        body: last.broadcast.body ? last.broadcast.body.slice(0, 120) : null,
        senderName: last.broadcast.sender.name,
        createdAt: last.broadcast.createdAt.toISOString(),
      },
    };
  }

  /** The announcements the caller received, newest page (oldest first in the page). */
  async listAnnouncements(actor: ChatActor, opts: { before?: string; limit?: number }) {
    const side = this.requireSide(actor);
    await this.markDelivered(actor.sub, side);
    const limit = opts.limit ?? 40;
    const rows = await this.prisma.chatBroadcastRecipient.findMany({
      where: {
        userId: actor.sub,
        ...(opts.before && { createdAt: { lt: new Date(opts.before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        broadcast: { include: { sender: { select: { name: true, roleRef: { select: { name: true } } } } } },
      },
    });
    return {
      announcements: rows.reverse().map((r) => ({
        id: r.broadcast.id,
        senderName: r.broadcast.sender.name,
        senderRoleName: r.broadcast.sender.roleRef?.name ?? null,
        audience: r.broadcast.audience,
        ...this.contentView(r.broadcast),
        read: !!r.readAt,
        createdAt: r.broadcast.createdAt.toISOString(),
      })),
      hasMore: rows.length === limit,
    };
  }

  async markAnnouncementsRead(actor: ChatActor) {
    this.requireSide(actor);
    const now = new Date();
    await this.prisma.chatBroadcastRecipient.updateMany({
      where: { userId: actor.sub, readAt: null },
      data: { readAt: now },
    });
    await this.prisma.chatBroadcastRecipient.updateMany({
      where: { userId: actor.sub, deliveredAt: null },
      data: { deliveredAt: now },
    });
  }

  /** A broadcast's photo / voice note: for its recipients and broadcast managers. */
  async broadcastAttachment(actor: ChatActor, broadcastId: string) {
    this.requireSide(actor);
    const b = await this.prisma.chatBroadcast.findUnique({
      where: { id: broadcastId },
      select: { attachmentPath: true, attachmentMime: true, senderId: true },
    });
    if (!b?.attachmentPath) throw new NotFoundException('Attachment not found');
    const allowed =
      b.senderId === actor.sub ||
      (await this.prisma.chatBroadcastRecipient.count({
        where: { broadcastId, userId: actor.sub },
      })) > 0 ||
      (await this.canBroadcast(actor.sub));
    if (!allowed) throw new NotFoundException('Attachment not found');
    return this.resolveFile(b.attachmentPath, b.attachmentMime);
  }

  /** Phone / browser push to every recipient, a few at a time. Fire-and-forget. */
  private pushBroadcast(
    senderName: string,
    recipients: { id: string; role: string }[],
    kind: ChatMessageKind,
    body: string | null,
  ) {
    const preview = this.previewText(kind, body).slice(0, 180);
    const run = async () => {
      for (let i = 0; i < recipients.length; i += 20) {
        await Promise.allSettled(
          recipients.slice(i, i + 20).map((r) => {
            const url =
              r.role === 'REP'
                ? `/rep/chat?c=${CHAT_ANNOUNCEMENTS_ID}`
                : r.role === 'DRIVER'
                  ? `/driver/chat?c=${CHAT_ANNOUNCEMENTS_ID}`
                  : '/dashboard';
            return this.push.sendToUser(r.id, `📢 ${senderName}`, preview, {
              type: 'CHAT',
              conversationId: CHAT_ANNOUNCEMENTS_ID,
              url,
              tag: `chat-${CHAT_ANNOUNCEMENTS_ID}`,
            });
          }),
        );
      }
    };
    run().catch((err) => this.logger.warn(`Broadcast push failed: ${String(err)}`));
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
    const preview = this.previewText(kind, body);
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

  /**
   * Browser notification for the office user on the receiving end (6.2.0): a rep / driver wrote to
   * them, or a colleague did. Clicking it opens the dashboard with that chat (?chat=<id>). Fire-and-forget.
   */
  private pushToStaff(
    conv: { id: string; kind: string; portalUserId: string; staffUserId: string; portalUser: { name: string }; staffUser: { name: string } },
    senderSide: Side,
    kind: ChatMessageKind,
    body: string | null,
  ) {
    const toId = senderSide === 'STAFF' ? conv.portalUserId : conv.staffUserId;
    const from = senderSide === 'STAFF' ? conv.staffUser.name : conv.portalUser.name;
    this.push
      .sendToUser(toId, `💬 ${from}`, this.previewText(kind, body).slice(0, 180), {
        type: 'CHAT',
        conversationId: conv.id,
        url: `/dashboard?chat=${conv.id}`,
        tag: `chat-${conv.id}`,
      })
      .catch((err) => this.logger.warn(`Chat push (office) failed: ${String(err)}`));
  }

  private previewText(kind: ChatMessageKind, body: string | null): string {
    if (kind === 'IMAGE') return `📷 Photo${body ? ` — ${body}` : ''}`;
    if (kind === 'VOICE') return '🎤 Voice note';
    if (kind === 'LOCATION') return `📍 Location${body ? ` — ${body}` : ''}`;
    return body ?? '';
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
    void side;
    const mine = conv && (conv.staffUserId === actor.sub || conv.portalUserId === actor.sub);
    if (!conv || !mine) throw new NotFoundException('Conversation not found');
    // The caller's side in this thread is their column (an office user may sit in either column of an office thread).
    return { conv, side: this.slotOf(conv, actor.sub) };
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
    // iOS cannot play WebM / Ogg Opus (what Chrome and Firefox record): store
    // those as AAC .m4a, which every browser and both phone platforms play.
    if (kind[1] === 'webm' || kind[1] === 'ogg') {
      const aac = await transcodeToAac(buf).catch((err) => {
        this.logger.warn(`Voice note kept as ${kind[1]} (transcode failed): ${String(err)}`);
        return null;
      });
      if (aac) return this.writeFile(conversationId, `${id}.m4a`, aac, 'audio/mp4');
    }
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
