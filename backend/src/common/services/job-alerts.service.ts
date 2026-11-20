import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  LOC,
  getGeofenceRadii,
  repEscortApplies,
  resolveDriverGeofenceTarget,
  resolveRepGeofenceTarget,
} from '../geofence.util.js';

export type AlertRole = 'REP' | 'DRIVER';

/** Start reminders (minutes before the job) and drop-off geofence alarms. */
export const ALERT_KINDS = ['START_60', 'START_30', 'DROPOFF_ARRIVED', 'DROPOFF_LEFT'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Reminders are offered for jobs starting within this window. */
const LOOKAHEAD_MS = 26 * 60 * 60 * 1000;
/** A drop-off alarm is only armed for a leg started within this window. */
const ACTIVE_LEG_MS = 12 * 60 * 60 * 1000;
const DONE = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

const cairoDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** When the job starts: flight arrival for ARR, pickup time otherwise (same as the job lists). */
export function jobStartsAt(job: {
  serviceType: string;
  pickUpTime: Date | null;
  flight?: { arrivalTime: Date | null } | null;
}): Date | null {
  return job.serviceType === 'ARR' ? (job.flight?.arrivalTime ?? null) : job.pickUpTime;
}

/**
 * Job alarms for the rep and driver portals / apps.
 *
 * - **Start reminders** — 60 and 30 minutes before each of the person's jobs.
 *   The client raises them (local notification + modal) and must acknowledge
 *   each one; the acknowledgement is stored here and, being a POST on a
 *   portal route, lands in the activity log against the job.
 * - **Drop-off alarms** — for a driver on a started trip, and for a rep who
 *   said they escort the transfer: the client watches its GPS against the
 *   drop-off geofence and alarms on arrival ("complete before you leave")
 *   and on leaving without completing.
 */
@Injectable()
export class JobAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  private async personId(userId: string, role: AlertRole): Promise<string> {
    const row =
      role === 'REP'
        ? await this.prisma.rep.findFirst({ where: { userId, deletedAt: null }, select: { id: true } })
        : await this.prisma.driver.findFirst({ where: { userId, deletedAt: null }, select: { id: true } });
    if (!row) throw new ForbiddenException(`No ${role === 'REP' ? 'rep' : 'driver'} profile linked to this account`);
    return row.id;
  }

  async getAlerts(userId: string, role: AlertRole) {
    const id = await this.personId(userId, role);
    const now = new Date();
    // Service dates yesterday … day after tomorrow cover every job starting in
    // the next 26 h and every leg still running from last night.
    const from = dateOnly(cairoDate(new Date(now.getTime() - 24 * 3600 * 1000)));
    const to = dateOnly(cairoDate(new Date(now.getTime() + 48 * 3600 * 1000)));

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        ...(role === 'REP' ? { repId: id } : { driverId: id }),
        trafficJob: { deletedAt: null, jobDate: { gte: from, lte: to }, status: { notIn: ['CANCELLED'] } },
      },
      select: {
        repStatus: true,
        driverStatus: true,
        repEscort: true,
        updatedAt: true,
        trafficJob: {
          select: {
            id: true,
            internalRef: true,
            serviceType: true,
            pickUpTime: true,
            paxCount: true,
            clientName: true,
            pickupLat: true,
            pickupLng: true,
            dropoffLat: true,
            dropoffLng: true,
            flight: { select: { flightNo: true, arrivalTime: true } },
            originAirport: LOC,
            originZone: LOC,
            originHotel: { select: { ...LOC.select, zone: LOC } },
            fromZone: LOC,
            destinationAirport: LOC,
            destinationZone: LOC,
            destinationHotel: { select: { ...LOC.select, zone: LOC } },
            toZone: LOC,
            alertAcks: { where: { userId }, select: { kind: true } },
          },
        },
      },
    });

    const radii = await getGeofenceRadii(this.prisma);
    const name = (l?: { name: string | null } | null) => l?.name ?? null;

    const reminders: unknown[] = [];
    const dropoffs: unknown[] = [];
    for (const a of assignments) {
      const job = a.trafficJob;
      const leg = role === 'REP' ? a.repStatus : a.driverStatus;
      if (DONE.has(leg)) continue;
      const acked = job.alertAcks.map((k) => k.kind);
      const startsAt = jobStartsAt(job);
      const summary = {
        jobId: job.id,
        internalRef: job.internalRef,
        serviceType: job.serviceType,
        startsAt: startsAt?.toISOString() ?? null,
        flightNo: job.flight?.flightNo ?? null,
        paxCount: job.paxCount,
        clientName: job.clientName,
        from: name(job.originAirport) ?? name(job.originHotel) ?? name(job.originZone),
        to: name(job.destinationAirport) ?? name(job.destinationHotel) ?? name(job.destinationZone),
        acked,
      };

      // Reminders: only for a leg that has not started yet.
      if (leg === 'PENDING' && startsAt) {
        const ms = startsAt.getTime() - now.getTime();
        if (ms > 0 && ms <= LOOKAHEAD_MS) reminders.push(summary);
      }

      // Drop-off alarm: driver on a started trip; rep who is escorting.
      const active =
        role === 'DRIVER' ? leg === 'IN_PROGRESS' : leg === 'IN_PLACE' && a.repEscort === true;
      if (active && now.getTime() - a.updatedAt.getTime() <= ACTIVE_LEG_MS) {
        const target =
          role === 'DRIVER'
            ? resolveDriverGeofenceTarget(job, 'COMPLETED')
            : resolveRepGeofenceTarget(job, 'COMPLETED', true);
        if (target) {
          dropoffs.push({
            ...summary,
            target: {
              lat: target.lat,
              lng: target.lng,
              label: target.label,
              precise: target.precise,
              radiusMeters: target.isAirport ? radii.airportMeters : radii.otherMeters,
            },
          });
        }
      }
    }

    return { serverTime: now.toISOString(), reminders, dropoffs };
  }

  /** Record that the user saw and acknowledged an alarm (idempotent per kind). */
  async acknowledge(
    userId: string,
    role: AlertRole,
    jobId: string,
    body: { kind: string; shownAt?: string; latitude?: number; longitude?: number },
  ) {
    if (!(ALERT_KINDS as readonly string[]).includes(body.kind)) {
      throw new BadRequestException(`Unknown alert kind "${body.kind}"`);
    }
    const id = await this.personId(userId, role);
    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { trafficJobId: jobId, ...(role === 'REP' ? { repId: id } : { driverId: id }) },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Job not found or not assigned to you');

    const shown = body.shownAt ? new Date(body.shownAt) : null;
    const data = {
      shownAt: shown && !isNaN(shown.getTime()) ? shown : null,
      latitude: Number.isFinite(body.latitude) ? body.latitude : null,
      longitude: Number.isFinite(body.longitude) ? body.longitude : null,
    };
    const row = await this.prisma.jobAlertAck.upsert({
      where: { trafficJobId_userId_kind: { trafficJobId: jobId, userId, kind: body.kind } },
      create: { trafficJobId: jobId, userId, role, kind: body.kind, ...data },
      // Re-acknowledging keeps the first acknowledgement time.
      update: {},
    });
    return { jobId, kind: row.kind, acknowledgedAt: row.acknowledgedAt.toISOString() };
  }

  // ── Alarms that survive sign-out (per-phone alarm key) ──────────────────────

  private static hashKey(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }

  /** Signed-in app asks for its alarm key (returned once; only the hash is stored). Keeps 3 per user. */
  async registerAlarmDevice(userId: string, role: AlertRole) {
    await this.personId(userId, role); // must be a rep / driver account
    const key = randomBytes(32).toString('base64url');
    await this.prisma.alarmDevice.create({ data: { userId, role, keyHash: JobAlertsService.hashKey(key) } });
    const active = await this.prisma.alarmDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const stale = active.slice(3).map((d) => d.id);
    if (stale.length) await this.prisma.alarmDevice.updateMany({ where: { id: { in: stale } }, data: { revokedAt: new Date() } });
    return { key };
  }

  /** The account behind an alarm key — refused when revoked or the account is no longer active. */
  private async alarmDevice(key: string | undefined) {
    if (!key || key.length < 20) throw new ForbiddenException('Alarm key missing');
    const d = await this.prisma.alarmDevice.findUnique({
      where: { keyHash: JobAlertsService.hashKey(key) },
      select: { id: true, userId: true, role: true, revokedAt: true, lastSeenAt: true, user: { select: { isActive: true, deletedAt: true } } },
    });
    if (!d || d.revokedAt || !d.user.isActive || d.user.deletedAt) throw new ForbiddenException('Alarms are off on this phone');
    if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 10 * 60_000) {
      await this.prisma.alarmDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
    }
    return { userId: d.userId, role: d.role as AlertRole };
  }

  /** Signed-out phone: the person's start reminders only (no GPS drop-off alarms without a session). */
  async alarmsByKey(key: string | undefined) {
    const d = await this.alarmDevice(key);
    const all = await this.getAlerts(d.userId, d.role);
    return { serverTime: all.serverTime, role: d.role, reminders: all.reminders };
  }

  async acknowledgeByKey(key: string | undefined, jobId: string, body: { kind: string; shownAt?: string }) {
    const d = await this.alarmDevice(key);
    if (body.kind !== 'START_60' && body.kind !== 'START_30') throw new BadRequestException('Only start reminders can be acknowledged here');
    return this.acknowledge(d.userId, d.role, jobId, { kind: body.kind, shownAt: body.shownAt });
  }

  /** "Turn off alarms on this phone". */
  async revokeAlarmKey(key: string | undefined) {
    if (!key) return { ok: true };
    await this.prisma.alarmDevice.updateMany({
      where: { keyHash: JobAlertsService.hashKey(key), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /** The rep's answer after IN PLACE: escorting the transfer to the drop-off or not. */
  async setRepEscort(userId: string, jobId: string, escort: boolean) {
    const repId = await this.personId(userId, 'REP');
    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { trafficJobId: jobId, repId },
      select: { id: true, repStatus: true, trafficJob: { select: { serviceType: true } } },
    });
    if (!assignment) throw new NotFoundException('Job not found or not assigned to you');
    if (assignment.repStatus !== 'IN_PLACE') {
      throw new BadRequestException('The escort answer is given after IN PLACE, before completing the job');
    }
    if (!repEscortApplies(assignment.trafficJob.serviceType)) {
      throw new BadRequestException('Escort does not apply to this job');
    }
    const updated = await this.prisma.trafficAssignment.update({
      where: { id: assignment.id },
      data: { repEscort: escort, repEscortAt: new Date() },
      select: { repEscort: true, repEscortAt: true },
    });
    return { jobId, repEscort: updated.repEscort, repEscortAt: updated.repEscortAt?.toISOString() ?? null };
  }
}
