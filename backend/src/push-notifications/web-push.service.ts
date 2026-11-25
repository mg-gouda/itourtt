import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';

/** What the portal service worker (frontend/public/sw.js) shows. */
export interface WebPushPayload {
  title: string;
  body: string;
  /** Page to open when the notification is clicked (same-origin path). */
  url?: string;
  /** Notifications with the same tag replace each other (e.g. one per chat). */
  tag?: string;
  /** Stays on screen until clicked (missed-alarm escalations). */
  urgent?: boolean;
}

/**
 * Browser push for the rep/driver web portals (Web Push + VAPID). Disabled,
 * with a warning, until VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
 * Generate a pair once with `npx web-push generate-vapid-keys`.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const priv = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!this.publicKey || !priv) {
      this.logger.warn('VAPID keys not set — browser push notifications are disabled.');
      this.enabled = false;
      return;
    }
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT?.trim() || 'mailto:noreply@itourtt.cloud',
        this.publicKey,
        priv,
      );
      this.enabled = true;
    } catch (err) {
      this.logger.error(`Invalid VAPID keys — browser push disabled: ${String(err)}`);
      this.enabled = false;
    }
  }

  /** The key a browser needs to subscribe; null when push is off. */
  getPublicKey(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  /**
   * Save this browser's subscription for `userId`. An endpoint belongs to one
   * browser, so if another user subscribed it before, it moves to this user —
   * the previous user must not keep getting pushes on a shared device.
   */
  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Push to every browser `userId` subscribed. Never throws. */
  /**
   * Office alerts as browser push (6.7.0), so they arrive with the office window minimised,
   * in a background tab or closed — they used to exist only as in-app rows read by an open tab.
   * Admins are skipped, like their muted popups (6.2.1).
   */
  async sendToOffice(userIds: string[], payload: WebPushPayload): Promise<void> {
    if (!this.enabled || !userIds.length) return;
    const staff = await this.prisma.user.findMany({
      where: { id: { in: userIds }, role: { not: 'ADMIN' }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    await Promise.allSettled(staff.map((u) => this.sendToUser(u.id, payload)));
  }

  async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!this.enabled) return;
    try {
      const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
      if (!subs.length) return;
      const body = JSON.stringify(payload);
      await Promise.allSettled(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
              { TTL: 60 * 60 * 12, urgency: 'high', topic: payload.tag?.slice(0, 32) },
            );
            await this.prisma.webPushSubscription
              .update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
              .catch(() => {});
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.webPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            } else {
              this.logger.warn(`Web push to user ${userId} failed (${status ?? 'n/a'}): ${String(err)}`);
            }
          }
        }),
      );
    } catch (err) {
      this.logger.error(`Web push for user ${userId} failed: ${String(err)}`);
    }
  }
}
