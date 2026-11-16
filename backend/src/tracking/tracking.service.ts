import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayCairo } from '../common/utils/service-date.util.js';

export type TrackedRole = 'REP' | 'DRIVER';
export type LocationSource = 'HEARTBEAT' | 'STATUS';

/** A fix whose clock is further than this from the server's is clamped to "now". */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/** A session counts as "online" if the portal touched the API this recently. */
const ONLINE_WINDOW_MS = 5 * 60_000;

/** True when (lat, lng) is a plausible WGS-84 coordinate (and not the 0,0 null fix). */
export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a < -90 || a > 90 || b < -180 || b > 180) return false;
  return !(a === 0 && b === 0);
}

export interface TrackedPerson {
  /** Rep.id or Driver.id */
  id: string;
  /** Which list this person came from (drives the marker shape on Overall Tracking). */
  role: TrackedRole;
  name: string;
  mobileNumber: string;
  /** Portal account linked? Without one the person can never report a location. */
  hasAccount: boolean;
  /** An open portal session that touched the API in the last 5 minutes. */
  online: boolean;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    source: string;
    recordedAt: string;
  } | null;
  /** Today's (Cairo) jobs for this person, earliest first. */
  todayJobs: {
    jobId: string;
    internalRef: string;
    serviceType: string;
    status: string;
    legStatus: string;
    flightNo: string | null;
    /** Pick-up time, else the flight's arrival/departure time (ISO). */
    time: string | null;
  }[];
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upserts the user's last-known position. Never throws — a tracking failure
   * must not break the status update or heartbeat that carried the fix.
   * An older fix never overwrites a newer one.
   */
  async record(
    userId: string,
    role: TrackedRole,
    latitude: number,
    longitude: number,
    source: LocationSource,
    opts: { accuracy?: number | null; recordedAt?: Date | null } = {},
  ): Promise<void> {
    if (!isValidCoord(latitude, longitude)) return;
    const now = Date.now();
    let recordedAt = opts.recordedAt ?? new Date(now);
    if (Number.isNaN(recordedAt.getTime()) || Math.abs(recordedAt.getTime() - now) > MAX_CLOCK_SKEW_MS) {
      recordedAt = new Date(now);
    }
    const accuracy =
      opts.accuracy != null && Number.isFinite(Number(opts.accuracy)) && Number(opts.accuracy) >= 0
        ? Number(opts.accuracy)
        : null;
    const data = { role, latitude, longitude, accuracy, source, recordedAt };

    try {
      const existing = await this.prisma.userLocation.findUnique({
        where: { userId },
        select: { recordedAt: true },
      });
      if (!existing) {
        await this.prisma.userLocation.create({ data: { userId, ...data } });
      } else if (existing.recordedAt <= recordedAt) {
        await this.prisma.userLocation.update({ where: { userId }, data });
      }
    } catch (err) {
      // Unique race between two concurrent first fixes — the other one won; retry as update.
      try {
        await this.prisma.userLocation.update({ where: { userId }, data });
      } catch {
        this.logger.warn(`Could not record location for user ${userId}: ${(err as Error).message}`);
      }
    }
  }

  /** Every active rep, with last-known position and today's jobs. */
  async listReps(search?: string): Promise<TrackedPerson[]> {
    const reps = await this.prisma.rep.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(search?.trim() && { name: { contains: search.trim(), mode: 'insensitive' as const } }),
      },
      select: { id: true, name: true, mobileNumber: true, userId: true },
      orderBy: { name: 'asc' },
    });
    const ids = reps.map((r) => r.id);
    const assignments = ids.length
      ? await this.prisma.trafficAssignment.findMany({
          where: { repId: { in: ids }, trafficJob: { jobDate: this.todayDate(), deletedAt: null } },
          select: { repId: true, repStatus: true, trafficJob: { select: this.jobSelect } },
        })
      : [];
    return this.assemble(
      'REP',
      reps,
      assignments.map((a) => ({ ownerId: a.repId!, legStatus: a.repStatus, job: a.trafficJob })),
    );
  }

  /** Every active driver, with last-known position and today's jobs. */
  async listDrivers(search?: string): Promise<TrackedPerson[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(search?.trim() && { name: { contains: search.trim(), mode: 'insensitive' as const } }),
      },
      select: { id: true, name: true, mobileNumber: true, userId: true },
      orderBy: { name: 'asc' },
    });
    const ids = drivers.map((d) => d.id);
    const assignments = ids.length
      ? await this.prisma.trafficAssignment.findMany({
          where: { driverId: { in: ids }, trafficJob: { jobDate: this.todayDate(), deletedAt: null } },
          select: { driverId: true, driverStatus: true, trafficJob: { select: this.jobSelect } },
        })
      : [];
    return this.assemble(
      'DRIVER',
      drivers,
      assignments.map((a) => ({ ownerId: a.driverId!, legStatus: a.driverStatus, job: a.trafficJob })),
    );
  }

  /** Overall Tracking: every active rep and driver on one map. */
  async listAll(search?: string): Promise<TrackedPerson[]> {
    const [reps, drivers] = await Promise.all([this.listReps(search), this.listDrivers(search)]);
    return [...reps, ...drivers];
  }

  // ─── internals ───

  private readonly jobSelect = {
    id: true,
    internalRef: true,
    serviceType: true,
    status: true,
    pickUpTime: true,
    flight: { select: { flightNo: true, arrivalTime: true, departureTime: true } },
  } as const;

  /** Today's Cairo calendar date as the UTC-midnight Date a @db.Date column compares against. */
  private todayDate(): Date {
    return new Date(`${todayCairo()}T00:00:00.000Z`);
  }

  private async assemble(
    role: TrackedRole,
    people: { id: string; name: string; mobileNumber: string; userId: string | null }[],
    jobs: {
      ownerId: string;
      legStatus: string;
      job: {
        id: string;
        internalRef: string;
        serviceType: string;
        status: string;
        pickUpTime: Date | null;
        flight: { flightNo: string; arrivalTime: Date | null; departureTime: Date | null } | null;
      };
    }[],
  ): Promise<TrackedPerson[]> {
    const userIds = people.map((p) => p.userId).filter((u): u is string => !!u);
    const [locations, sessions] = userIds.length
      ? await Promise.all([
          this.prisma.userLocation.findMany({ where: { userId: { in: userIds } } }),
          this.prisma.userSession.findMany({
            where: {
              userId: { in: userIds },
              endedAt: null,
              lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) },
            },
            select: { userId: true },
          }),
        ])
      : [[], []];
    const locByUser = new Map(locations.map((l) => [l.userId, l]));
    const online = new Set(sessions.map((s) => s.userId));

    const jobsByOwner = new Map<string, TrackedPerson['todayJobs']>();
    for (const { ownerId, legStatus, job } of jobs) {
      const list = jobsByOwner.get(ownerId) ?? [];
      list.push({
        jobId: job.id,
        internalRef: job.internalRef,
        serviceType: job.serviceType,
        status: job.status,
        legStatus,
        flightNo: job.flight?.flightNo ?? null,
        time: (job.pickUpTime ?? job.flight?.arrivalTime ?? job.flight?.departureTime)?.toISOString() ?? null,
      });
      jobsByOwner.set(ownerId, list);
    }
    for (const list of jobsByOwner.values()) {
      list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    }

    return people.map((p) => {
      const loc = p.userId ? locByUser.get(p.userId) : undefined;
      return {
        id: p.id,
        role,
        name: p.name,
        mobileNumber: p.mobileNumber,
        hasAccount: !!p.userId,
        online: !!p.userId && online.has(p.userId),
        location: loc
          ? {
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              accuracy: loc.accuracy,
              source: loc.source,
              recordedAt: loc.recordedAt.toISOString(),
            }
          : null,
        todayJobs: jobsByOwner.get(p.id) ?? [],
      };
    });
  }
}
