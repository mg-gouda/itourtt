import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SUPER_ADMIN_EMAIL } from '../common/utils/super-admin.util.js';

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** Best-effort friendly device name from a User-Agent string. */
export function deviceNameFromUA(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const os =
    /iPhone/i.test(ua) ? 'iPhone' :
    /iPad/i.test(ua) ? 'iPad' :
    /Android/i.test(ua) ? 'Android' :
    /Windows/i.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(ua) ? 'macOS' :
    /Linux/i.test(ua) ? 'Linux' : '';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) ? 'Safari' :
    /okhttp|Dart|Flutter|itour/i.test(ua) ? 'Mobile app' : '';
  return [browser, os].filter(Boolean).join(' · ') || 'Unknown device';
}

/** Roles whose logins are single-device and subject to the inactivity logout. */
export const SINGLE_DEVICE_ROLES = ['REP', 'DRIVER'] as const;

export type SessionEndReason = 'LOGOUT' | 'FORCED' | 'IDLE_TIMEOUT';

/**
 * Requests that a portal fires on a timer, not because the user did anything.
 * They keep `lastSeenAt` fresh but never count as activity — otherwise a phone
 * left on the portal would stay "active" forever. Matched on GET only, so it
 * also covers mobile builds that can't send the header below.
 */
const BACKGROUND_POLL_PATHS = [
  /^\/api\/notifications\/?$/,
  /^\/api\/(driver|rep)-portal\/notifications\/?$/,
  // Chat badge / widget poll.
  /^\/api\/chat\/me\/?$/,
];

/** Header a client sets on its own timer-driven requests. */
export const BACKGROUND_POLL_HEADER = 'x-background-poll';

/** True when a request is a background poll rather than user activity. */
export function isBackgroundRequest(
  method?: string,
  path?: string,
  headers?: Record<string, unknown>,
): boolean {
  if (headers?.[BACKGROUND_POLL_HEADER] === '1') return true;
  // The location heartbeat (POST) is timer-driven too — it must never keep an
  // idle rep/driver session alive.
  if (path && /^\/api\/tracking\/ping\/?$/.test(path.split('?')[0])) return true;
  if ((method ?? '').toUpperCase() !== 'GET' || !path) return false;
  const clean = path.split('?')[0];
  return BACKGROUND_POLL_PATHS.some((re) => re.test(clean));
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly idleMs: number;
  private readonly inactivityMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.idleMs = (Number(config.get('SESSION_IDLE_MINUTES')) || 30) * 60_000;
    this.inactivityMs = (Number(config.get('SESSION_INACTIVITY_MINUTES')) || 180) * 60_000;
  }

  /** Record a new device session at login. */
  async start(userId: string, sessionId: string, ctx: SessionContext) {
    await this.prisma.userSession.create({
      data: {
        userId,
        sessionId,
        deviceName: deviceNameFromUA(ctx.userAgent),
        ipAddress: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  }

  /**
   * The user's currently-active session on another device, if any.
   * Active = not ended AND seen within the idle window. Idle/ended sessions are
   * treated as free so a dead device doesn't lock a rep out forever.
   */
  async findActive(userId: string) {
    // A session left untouched by the user past the inactivity limit is expired
    // here and now, so the next login never waits for the sweep to run.
    await this.expireInactive(userId);
    const cutoff = new Date(Date.now() - this.idleMs);
    return this.prisma.userSession.findFirst({
      where: { userId, endedAt: null, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Heartbeat (throttled to at most once/60s per session). Every request
   * refreshes lastSeenAt; only real user requests refresh lastActivityAt.
   */
  async touch(sessionId: string, activity = true) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60_000);
    if (activity) {
      // lastSeenAt >= lastActivityAt always, so one write covers both.
      await this.prisma.userSession.updateMany({
        where: { sessionId, endedAt: null, lastActivityAt: { lt: cutoff } },
        data: { lastSeenAt: now, lastActivityAt: now },
      });
      return;
    }
    await this.prisma.userSession.updateMany({
      where: { sessionId, endedAt: null, lastSeenAt: { lt: cutoff } },
      data: { lastSeenAt: now },
    });
  }

  /** Mark a session ended (logout by default). */
  async end(sessionId: string, reason: SessionEndReason = 'LOGOUT') {
    await this.prisma.userSession.updateMany({
      where: { sessionId, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
  }

  /** Why a session ended, or null if it is open / unknown. */
  async endReasonOf(sessionId: string): Promise<string | null> {
    const row = await this.prisma.userSession.findUnique({
      where: { sessionId },
      select: { endReason: true },
    });
    return row?.endReason ?? null;
  }

  /**
   * End every open REP/DRIVER session with no user activity within the
   * inactivity limit, and log the device out: the user's live sessionId and
   * refresh token are cleared, so the next request fails and refresh can't
   * revive it. Scoped to one user when `userId` is given. Idempotent.
   */
  async expireInactive(userId?: string): Promise<number> {
    const cutoff = new Date(Date.now() - this.inactivityMs);
    const stale = await this.prisma.userSession.findMany({
      where: {
        ...(userId ? { userId } : {}),
        endedAt: null,
        lastActivityAt: { lt: cutoff },
        user: { role: { in: [...SINGLE_DEVICE_ROLES] } },
      },
      select: { userId: true, sessionId: true },
    });
    for (const s of stale) {
      await this.end(s.sessionId, 'IDLE_TIMEOUT');
      await this.prisma.user.updateMany({
        where: { id: s.userId, sessionId: s.sessionId },
        data: { sessionId: null, sessionExpiresAt: null, refreshToken: null },
      });
    }
    return stale.length;
  }

  /**
   * Every 5 minutes: log out reps/drivers inactive past the limit, so a phone
   * left on the portal can't hold the single-device lock. Not behind
   * CronRunLock on purpose — the sweep only ends sessions that are still open,
   * so a second replica running it changes nothing, and a lock row per 5-minute
   * slot would add 288 rows a day for no protection.
   */
  @Cron('*/5 * * * *', { timeZone: 'Africa/Cairo' })
  async sweepInactive() {
    try {
      const n = await this.expireInactive();
      if (n > 0) this.logger.log(`Inactivity logout: ended ${n} rep/driver session(s)`);
    } catch (err) {
      this.logger.error(`Inactivity sweep failed: ${(err as Error).message}`);
    }
  }

  /** Admin: list a user's sessions (most recent first). */
  async listForUser(userId: string) {
    const cutoff = new Date(Date.now() - this.idleMs);
    const rows = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return rows.map((s) => ({
      ...s,
      active: s.endedAt === null && s.lastSeenAt >= cutoff,
    }));
  }

  /**
   * Admin force-logout: end the session AND clear the user's live sessionId if it
   * matches, so the token stops validating (JwtStrategy checks sid for REP/DRIVER).
   */
  async forceLogout(userId: string, sessionId: string) {
    await this.end(sessionId, 'FORCED');
    await this.prisma.user.updateMany({
      where: { id: userId, sessionId },
      data: { sessionId: null, sessionExpiresAt: null, refreshToken: null },
    });
    return { success: true };
  }

  /**
   * Admin "Clear": force-logout the device AND remove the session row entirely, so
   * a stuck/idle record can never block the user's next login. Works on ended rows
   * too — clearing is the one-click fix for a locked-out rep/driver.
   */
  async clear(userId: string, sessionId: string) {
    await this.forceLogout(userId, sessionId);
    await this.prisma.userSession.deleteMany({ where: { userId, sessionId } });
    return { success: true };
  }

  /**
   * Notify the super-admin (and nobody else) of a blocked rep/driver login.
   * Login/session alerts are deliberately hidden from every other role and user.
   */
  async notifyManagersOfConflict(subject: {
    id: string;
    name: string;
    role: string;
  }, ctx: SessionContext) {
    const managers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        email: { equals: SUPER_ADMIN_EMAIL, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (managers.length === 0) return;
    const device = deviceNameFromUA(ctx.userAgent);
    await this.prisma.userNotification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        title: 'Blocked login attempt',
        message: `A new login was blocked for ${subject.name} (${subject.role}) — a session is already active on another device.`,
        metadata: {
          kind: 'REP_LOGIN_CONFLICT',
          subjectUserId: subject.id,
          subjectName: subject.name,
          subjectRole: subject.role,
          ipAddress: ctx.ip ?? null,
          deviceName: device,
        },
      })),
    });
  }
}
