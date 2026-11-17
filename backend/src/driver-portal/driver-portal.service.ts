import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertWithinGeofence } from '../common/geofence.util.js';
import {
  checkNoShowWindow,
  getNoShowAvailableFrom,
  resolveNoShowWaitMinutes,
  type NoShowWaitSource,
} from '../common/utils/no-show-window.util.js';
import { NoShowDisputeService } from './no-show-dispute.service.js';
import { JobCompletionService } from '../common/services/job-completion.service.js';

type DriverJobStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const DRIVER_ALLOWED_STATUSES: DriverJobStatus[] = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const DRIVER_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const DRIVER_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

// Location fields a list card needs: its label plus what Google Maps navigates to.
const NAV_PLACE_SELECT = { name: true, latitude: true, longitude: true } as const;
const NAV_AIRPORT_SELECT = { ...NAV_PLACE_SELECT, code: true } as const;
const NAV_HOTEL_SELECT = { ...NAV_PLACE_SELECT, address: true } as const;

@Injectable()
export class DriverPortalService {
  private readonly logger = new Logger(DriverPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly noShowDisputeService: NoShowDisputeService,
    private readonly jobCompletion: JobCompletionService,
  ) {}

  // Minimal fields for list cards — no agent/customer details
  private readonly jobSummaryInclude = {
    jobExtras: {
      orderBy: { createdAt: 'asc' as const },
      select: { name: true, qty: true },
    },
    // Coordinates feed the tap-to-navigate route links (lib/maps-nav.ts); the
    // airport code is what the card prints.
    originAirport: { select: NAV_AIRPORT_SELECT },
    originZone: { select: NAV_PLACE_SELECT },
    originHotel: { select: { ...NAV_HOTEL_SELECT, zone: { select: NAV_PLACE_SELECT } } },
    destinationAirport: { select: NAV_AIRPORT_SELECT },
    destinationZone: { select: NAV_PLACE_SELECT },
    destinationHotel: { select: { ...NAV_HOTEL_SELECT, zone: { select: NAV_PLACE_SELECT } } },
    fromZone: { select: NAV_PLACE_SELECT },
    toZone: { select: NAV_PLACE_SELECT },
    flight: { select: { flightNo: true, arrivalTime: true, departureTime: true } },
    // Only the NO SHOW overrides: the summary has no other use for the agent.
    agent: {
      select: { noShowWaitStandardMinutes: true, noShowWaitDepMinutes: true },
    },
    assignment: {
      include: {
        vehicle: { select: { plateNumber: true, vehicleType: { select: { name: true } } } },
        rep: { select: { name: true, mobileNumber: true } },
      },
    },
  };

  // Full include for detail views and mutation responses
  private readonly jobInclude = {
    jobExtras: {
      orderBy: { createdAt: 'asc' as const },
      select: { name: true, qty: true },
    },
    originAirport: true,
    originZone: true,
    originHotel: { include: { zone: true } },
    destinationAirport: true,
    destinationZone: true,
    destinationHotel: { include: { zone: true } },
    fromZone: true,
    toZone: true,
    flight: true,
    agent: {
      select: {
        legalName: true,
        noShowWaitStandardMinutes: true,
        noShowWaitDepMinutes: true,
      },
    },
    customer: { select: { legalName: true } },
    assignment: {
      include: {
        vehicle: { include: { vehicleType: true } },
        rep: { select: { name: true, mobileNumber: true } },
        supplier: { select: { tradeName: true, legalName: true } },
      },
      // externalDriverName and externalDriverPhone are scalar fields — always included
    },
  };

  /**
   * The NO SHOW wait for one job, in minutes: the agent's own override if they
   * have one, else the company default. A B2B job carries a customer and no
   * agent, so it simply falls through to the default.
   */
  private async resolveNoShowWait(job: {
    serviceType: string;
    agent?: NoShowWaitSource | null;
  }): Promise<number> {
    const settings = await this.prisma.companySettings.findFirst({
      select: { noShowWaitStandardMinutes: true, noShowWaitDepMinutes: true },
    });
    return resolveNoShowWaitMinutes(job.serviceType, job.agent, settings);
  }

  /**
   * Stamps each job with the instant NO SHOW unlocks, so the portal greys the
   * button and counts down against the same moment the server enforces instead
   * of its own copy of the number — which could only ever stay right while
   * there was exactly one.
   */
  private async withNoShowWindow<T extends { serviceType: string; agent?: NoShowWaitSource | null }>(
    jobs: T[],
  ): Promise<(T & { noShowAvailableFrom: Date | null })[]> {
    const settings = await this.prisma.companySettings.findFirst({
      select: { noShowWaitStandardMinutes: true, noShowWaitDepMinutes: true },
    });

    return jobs.map((job) => ({
      ...job,
      noShowAvailableFrom: getNoShowAvailableFrom(
        job as never,
        resolveNoShowWaitMinutes(job.serviceType, job.agent, settings),
      ),
    }));
  }

  async resolveDriverId(userId: string): Promise<string> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver) {
      throw new ForbiddenException('No driver profile linked to this account');
    }
    return driver.id;
  }

  /**
   * Geofence pre-check for the evidence routes: runs BEFORE the photos are
   * uploaded, so a submission rejected for being out of range never leaves
   * orphan photos behind. The submit method re-checks authoritatively.
   */
  async precheckGeofence(
    userId: string,
    jobId: string,
    status: string,
    latitude: number,
    longitude: number,
  ) {
    const driverId = await this.resolveDriverId(userId);
    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { driverId, trafficJobId: jobId },
      select: { id: true },
    });
    if (!assignment) return; // the submit call reports it properly
    await assertWithinGeofence(this.prisma, { jobId, role: 'DRIVER', status, latitude, longitude });
  }

  async getMyJobs(userId: string, date?: string) {
    const driverId = await this.resolveDriverId(userId);
    const jobDate = date ? new Date(date) : new Date();
    if (!date) {
      jobDate.setHours(0, 0, 0, 0);
    }

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId,
        trafficJob: {
          jobDate,
          deletedAt: null,
        },
      },
      include: {
        trafficJob: {
          include: this.jobSummaryInclude,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const resolveTime = (job: any): number => {
      const t = job.serviceType === 'ARR'
        ? (job.flight?.arrivalTime ?? null)
        : (job.pickUpTime ?? null);
      return t ? new Date(t).getTime() : Number.MAX_SAFE_INTEGER;
    };

    const jobs = assignments
      .map((a) => ({ ...a.trafficJob, driverStatus: a.driverStatus }))
      .sort((a, b) => resolveTime(a) - resolveTime(b));

    return {
      date: jobDate.toISOString().split('T')[0],
      driverId,
      jobs: await this.withNoShowWindow(jobs),
    };
  }

  async getJobHistory(userId: string, dateFrom: string, dateTo: string) {
    const driverId = await this.resolveDriverId(userId);
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId,
        driverStatus: { in: DRIVER_TERMINAL_STATUSES as any },
        trafficJob: {
          jobDate: { gte: from, lte: to },
          deletedAt: null,
        },
      },
      include: {
        trafficJob: {
          include: {
            ...this.jobSummaryInclude,
            driverFees: {
              where: { driverId },
              select: { amount: true, currency: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      dateFrom,
      dateTo,
      driverId,
      jobs: assignments.map((a) => ({
        ...a.trafficJob,
        driverStatus: a.driverStatus,
        feeEarned: a.trafficJob.driverFees[0]
          ? Number(a.trafficJob.driverFees[0].amount)
          : null,
      })),
    };
  }

  async updateJobStatus(
    userId: string,
    jobId: string,
    status: DriverJobStatus,
    latitude: number | null,
    longitude: number | null,
  ) {
    const driverId = await this.resolveDriverId(userId);

    if (!DRIVER_ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${DRIVER_ALLOWED_STATUSES.join(', ')}`,
      );
    }

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        driverId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
            flight: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkDriverTimelock(assignment.trafficJob);
    await assertWithinGeofence(this.prisma, {
      jobId: assignment.trafficJob.id,
      role: 'DRIVER',
      status: status,
      latitude,
      longitude,
    });

    const currentStatus = assignment.driverStatus;
    const allowed = DRIVER_VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change driver status from "${currentStatus}" to "${status}"`,
      );
    }

    // Time guard: cannot start IN_PROGRESS before job time
    if (status === 'IN_PROGRESS') {
      const flight = (assignment.trafficJob as any).flight;
      const jobTime =
        assignment.trafficJob.serviceType === 'ARR'
          ? (flight?.arrivalTime ?? null)
          : (assignment.trafficJob.pickUpTime ?? null);
      if (jobTime) {
        const now = new Date();
        if (now < new Date(jobTime)) {
          const timeStr = new Date(jobTime).toLocaleTimeString('en-GB', {
            timeZone: 'Africa/Cairo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          throw new BadRequestException(
            `Cannot start job before the scheduled time (${timeStr})`,
          );
        }
      }
    }

    const gpsMapLink =
      latitude != null && longitude != null
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { driverStatus: status as any },
        include: {
          trafficJob: {
            include: this.jobInclude,
          },
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'DRIVER',
          changedById: driverId,
          previousStatus: currentStatus as any,
          newStatus: status as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      // This endpoint can reach COMPLETED (IN_PROGRESS → COMPLETED), so the
      // overall job status has to be rolled up here too — not only in
      // submitCompleted.
      await this.jobCompletion.reconcileJobStatus(tx, jobId);

      const job = await tx.trafficJob.findUniqueOrThrow({
        where: { id: jobId },
        include: this.jobInclude,
      });

      return {
        ...job,
        driverStatus: updated.driverStatus,
      };
    });
  }

  async submitInProgress(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number | null,
    longitude: number | null,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!driver) throw new ForbiddenException('No driver profile linked to this account');
    const driverId = driver.id;
    const submittedByLabel = `DRIVER-${driver.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { driverId, trafficJobId: jobId },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
            flight: true,
          },
        },
      },
    });

    if (!assignment) throw new NotFoundException('Job not found or not assigned to you');

    this.checkDriverTimelock(assignment.trafficJob);
    await assertWithinGeofence(this.prisma, {
      jobId: assignment.trafficJob.id,
      role: 'DRIVER',
      status: 'IN_PROGRESS',
      latitude,
      longitude,
    });

    const currentStatus = assignment.driverStatus;
    if (currentStatus !== 'PENDING' && currentStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot submit in-progress evidence: current status is "${currentStatus}"`,
      );
    }

    // Time guard: cannot start before job time
    const flight = (assignment.trafficJob as any).flight;
    const jobTime =
      assignment.trafficJob.serviceType === 'ARR'
        ? (flight?.arrivalTime ?? null)
        : (assignment.trafficJob.pickUpTime ?? null);
    if (currentStatus === 'PENDING' && jobTime && new Date() < new Date(jobTime)) {
      const timeStr = new Date(jobTime).toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      throw new BadRequestException(
        `Cannot start job before the scheduled time (${timeStr})`,
      );
    }

    const gpsMapLink =
      latitude != null && longitude != null
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : null;
    const alreadyStarted = currentStatus === 'IN_PROGRESS';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: alreadyStarted ? {} : { driverStatus: 'IN_PROGRESS' as any },
        include: { trafficJob: { include: this.jobInclude } },
      });

      await tx.inProgressEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrls,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: submittedByLabel,
          submittedById: driverId,
        },
      });

      if (!alreadyStarted) {
        await tx.statusChangeLog.create({
          data: {
            assignmentId: assignment.id,
            changedBy: 'DRIVER',
            changedById: driverId,
            previousStatus: currentStatus as any,
            newStatus: 'IN_PROGRESS' as any,
            gpsLatitude: latitude,
            gpsLongitude: longitude,
            gpsMapLink,
          },
        });
      }

      return {
        ...updated.trafficJob,
        driverStatus: updated.driverStatus,
      };
    });
  }

  async submitCompleted(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number | null,
    longitude: number | null,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!driver) throw new ForbiddenException('No driver profile linked to this account');
    const driverId = driver.id;
    const submittedByLabel = `DRIVER-${driver.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { driverId, trafficJobId: jobId },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
            flight: true,
          },
        },
      },
    });

    if (!assignment) throw new NotFoundException('Job not found or not assigned to you');

    this.checkDriverTimelock(assignment.trafficJob);
    await assertWithinGeofence(this.prisma, {
      jobId: assignment.trafficJob.id,
      role: 'DRIVER',
      status: 'COMPLETED',
      latitude,
      longitude,
    });

    const currentStatus = assignment.driverStatus;
    if (DRIVER_TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(`Driver status is already terminal: "${currentStatus}"`);
    }
    if (currentStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(`Cannot complete job: must be In Progress first`);
    }

    // Time guard: at least 15 minutes after job time
    const flight = (assignment.trafficJob as any).flight;
    const jobTime =
      assignment.trafficJob.serviceType === 'ARR'
        ? (flight?.arrivalTime ?? null)
        : (assignment.trafficJob.pickUpTime ?? null);
    if (jobTime) {
      const now = new Date();
      const minCompleteAt = new Date(new Date(jobTime).getTime() + 15 * 60 * 1000);
      if (now < minCompleteAt) {
        const timeStr = minCompleteAt.toLocaleTimeString('en-GB', {
          timeZone: 'Africa/Cairo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        throw new BadRequestException(
          `Cannot mark job as completed before ${timeStr} (minimum 15 minutes after job time)`,
        );
      }
    }

    // Collection guard
    if (assignment.trafficJob.collectionRequired && !assignment.trafficJob.collectionCollected) {
      throw new BadRequestException('Collection must be marked as collected before completing the job');
    }

    const gpsMapLink =
      latitude != null && longitude != null
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { driverStatus: 'COMPLETED' as any },
        include: { trafficJob: { include: this.jobInclude } },
      });

      await tx.completedEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrls,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: submittedByLabel,
          submittedById: driverId,
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'DRIVER',
          changedById: driverId,
          previousStatus: currentStatus as any,
          newStatus: 'COMPLETED' as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      // Roll the overall job status up from the two portal legs and materialise
      // the driver / rep fees that completion unlocks. Also closes the rep leg
      // on DEP jobs, where the rep has no work left once the car has run.
      await this.jobCompletion.reconcileJobStatus(tx, jobId);

      const job = await tx.trafficJob.findUniqueOrThrow({
        where: { id: jobId },
        include: this.jobInclude,
      });

      return { ...job, driverStatus: updated.driverStatus };
    });
  }

  async markCollected(userId: string, jobId: string, collected: boolean) {
    const driverId = await this.resolveDriverId(userId);

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { driverId, trafficJobId: jobId },
      include: { trafficJob: true },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    if (!assignment.trafficJob.collectionRequired) {
      throw new BadRequestException('This job does not require collection');
    }

    this.checkDriverTimelock(assignment.trafficJob);

    return this.prisma.trafficJob.update({
      where: { id: jobId },
      data: {
        collectionCollected: collected,
        collectionCollectedAt: collected ? new Date() : null,
      },
      include: this.jobInclude,
    });
  }

  async submitNoShow(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number | null,
    longitude: number | null,
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!driver) throw new ForbiddenException('No driver profile linked to this account');
    const driverId = driver.id;
    const submittedByLabel = `DRIVER-${driver.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        driverId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: {
          include: {
            flight: true,
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
            agent: {
              select: {
                noShowWaitStandardMinutes: true,
                noShowWaitDepMinutes: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkDriverTimelock(assignment.trafficJob);
    await assertWithinGeofence(this.prisma, {
      jobId: assignment.trafficJob.id,
      role: 'DRIVER',
      status: 'NO_SHOW',
      latitude,
      longitude,
    });

    const currentStatus = assignment.driverStatus;
    if (DRIVER_TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Driver status is already terminal: "${currentStatus}"`,
      );
    }

    if (currentStatus !== 'PENDING' && currentStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot change driver status from "${currentStatus}"`,
      );
    }

    checkNoShowWindow(
      assignment.trafficJob,
      await this.resolveNoShowWait(assignment.trafficJob),
    );

    const gpsMapLink =
      latitude != null && longitude != null
        ? `https://www.google.com/maps?q=${latitude},${longitude}`
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { driverStatus: 'NO_SHOW' as any },
        include: {
          trafficJob: {
            include: this.jobInclude,
          },
        },
      });

      // Update the traffic job status itself to NO_SHOW
      await tx.trafficJob.update({
        where: { id: jobId },
        data: { status: 'NO_SHOW' as any },
      });

      await tx.noShowEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrls,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: submittedByLabel,
          submittedById: driverId,
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'DRIVER',
          changedById: driverId,
          previousStatus: currentStatus as any,
          newStatus: 'NO_SHOW' as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      return {
        ...updated.trafficJob,
        driverStatus: updated.driverStatus,
      };
    }).then((result) => {
      // Fire-and-forget: generate PDF evidence report and email agent dispute address
      this.noShowDisputeService.generateAndSendDisputeReport(jobId).catch(() => {
        // Errors already logged inside the service
      });
      return result;
    });
  }

  /**
   * Complaints this driver is answerable for — and only the settled ones.
   *
   * A dispute still being argued is internal: the driver sees the outcome, not
   * the argument. So this returns terminal LOST / PARTIALLY_LOST / WON only,
   * and never the claimed or conceded amounts.
   */
  async getComplaints(userId: string) {
    const driverId = await this.resolveDriverId(userId);

    const complaints = await this.prisma.complaint.findMany({
      where: {
        deletedAt: null,
        // The set, not the primary: a complaint that blames the rep first and
        // the driver second is still the driver's to see.
        responsibleParties: { has: 'DRIVER' },
        responsibleDriverId: driverId,
        status: { in: ['WON', 'PARTIALLY_LOST', 'LOST'] },
      },
      orderBy: { resolvedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        complaintNo: true,
        subject: true,
        status: true,
        resolvedAt: true,
        scorePenaltyApplied: true,
        category: { select: { nameEn: true, nameAr: true } },
        trafficJob: {
          select: { internalRef: true, jobDate: true, serviceType: true },
        },
        charges: {
          select: { status: true, amount: true, currency: true, driverId: true },
        },
      },
    });

    return complaints.map((c) => {
      const charged = this.postedChargeAgainst(c.charges, driverId);
      return {
      id: c.id,
      complaintNo: c.complaintNo,
      subject: c.subject,
      status: c.status,
      resolvedAt: c.resolvedAt,
      scorePenalty: c.scorePenaltyApplied,
      categoryEn: c.category.nameEn,
      categoryAr: c.category.nameAr,
      jobRef: c.trafficJob.internalRef,
      jobDate: c.trafficJob.jobDate,
      serviceType: c.trafficJob.serviceType,
      // Only a charge that was actually posted is money the driver has lost —
      // and only the charges against *them*: a complaint that also deducted from
      // the other leg is not this driver's loss to see.
      chargedAmount: charged.amount,
      chargedCurrency: charged.currency,
      };
    });
  }

  /**
   * The driver's posted deductions (ComplaintCharge rows against them by name),
   * optionally limited to jobs dated in [dateFrom, dateTo]. Like the complaints
   * list, only money actually taken (POSTED) reaches the portal — a PENDING or
   * APPROVED charge can still be changed or voided.
   */
  async getDeductions(userId: string, dateFrom?: string, dateTo?: string) {
    const driverId = await this.resolveDriverId(userId);
    const jobDate =
      dateFrom || dateTo
        ? { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) }
        : undefined;
    const charges = await this.prisma.complaintCharge.findMany({
      where: {
        driverId,
        party: 'DRIVER',
        status: 'POSTED',
        ...(jobDate ? { trafficJob: { jobDate } } : {}),
      },
      orderBy: { postedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        amount: true,
        currency: true,
        reason: true,
        postedAt: true,
        createdAt: true,
        trafficJob: { select: { id: true, internalRef: true, jobDate: true, serviceType: true } },
        complaint: {
          select: {
            complaintNo: true,
            subject: true,
            category: { select: { nameEn: true, nameAr: true } },
          },
        },
      },
    });
    return charges.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      currency: c.currency,
      reason: c.reason,
      postedAt: c.postedAt,
      createdAt: c.createdAt,
      job: c.trafficJob,
      complaintNo: c.complaint?.complaintNo ?? null,
      complaintSubject: c.complaint?.subject ?? null,
      categoryEn: c.complaint?.category?.nameEn ?? null,
      categoryAr: c.complaint?.category?.nameAr ?? null,
    }));
  }

  /**
   * What this driver actually lost to a complaint: the charges raised against
   * them by name and then posted, added up. A complaint that also deducted from
   * the other leg of the job is not theirs to see.
   */
  private postedChargeAgainst(
    charges: { status: string; amount: unknown; currency: string; driverId: string | null }[],
    driverId: string,
  ): { amount: number | null; currency: string | null } {
    const mine = charges.filter(
      (c) => c.status === 'POSTED' && c.driverId === driverId,
    );
    if (mine.length === 0) return { amount: null, currency: null };
    return {
      amount: mine.reduce((sum, c) => sum + Number(c.amount), 0),
      currency: mine[0].currency,
    };
  }

  async getNotifications(userId: string) {
    const driverId = await this.resolveDriverId(userId);

    const notifications = await this.prisma.driverNotification.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        trafficJob: {
          select: {
            internalRef: true,
            serviceType: true,
            jobDate: true,
          },
        },
      },
    });

    const unreadCount = await this.prisma.driverNotification.count({
      where: { driverId, isRead: false },
    });

    return { notifications, unreadCount };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const driverId = await this.resolveDriverId(userId);

    const notification = await this.prisma.driverNotification.findFirst({
      where: { id: notificationId, driverId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.driverNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    const driverId = await this.resolveDriverId(userId);

    await this.prisma.driverNotification.updateMany({
      where: { driverId, isRead: false },
      data: { isRead: true },
    });

    return { success: true };
  }

  async getProfile(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
      include: {
        driverVehicles: {
          where: { unassignedAt: null },
          include: {
            vehicle: { include: { vehicleType: true } },
          },
        },
      },
    });

    if (!driver) {
      throw new ForbiddenException('No driver profile linked to this account');
    }

    return driver;
  }

  private checkDriverTimelock(job: { jobDate: Date; driverUnlockedAt?: Date | null }) {
    if (job.driverUnlockedAt) return;
    const cutoff = new Date(job.jobDate.getTime() + FORTY_EIGHT_HOURS_MS);
    if (new Date() > cutoff) {
      throw new ForbiddenException(
        'Drivers cannot update job status more than 48 hours after the service date.',
      );
    }
  }


  async findJobDetail(userId: string, jobId: string) {
    const driverId = await this.resolveDriverId(userId);
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, assignment: { driverId }, deletedAt: null },
      include: {
        jobExtras: {
          orderBy: { createdAt: 'asc' as const },
          select: { name: true, qty: true },
        },
        agent: true,
        customer: true,
        originAirport: true,
        originZone: true,
        originHotel: { include: { zone: true } },
        destinationAirport: true,
        destinationZone: true,
        destinationHotel: { include: { zone: true } },
        fromZone: true,
        toZone: true,
        requestedVehicleType: true,
        flight: true,
        createdBy: { select: { id: true, name: true } },
        assignment: {
          include: {
            vehicle: { include: { vehicleType: true, supplier: { select: { id: true, legalName: true, tradeName: true } } } },
            driver: true,
            rep: true,
          },
        },
        noShowEvidence: true,
      },
    });
    if (!job) throw new NotFoundException('Job not found or not assigned to you');
    return job;
  }

  /**
   * Overlay metadata for the evidence stamp.
   *
   * `target` is the driver status this submission is about to write. The stamp
   * is burned before the status transaction runs, so both status lines are
   * projected forward to what the submission produces — otherwise a completing
   * driver is photographed as "IN PROGRESS" and a starting one as "PENDING".
   */
  async getJobStampMeta(jobId: string, target: 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW') {
    const job = await this.prisma.trafficJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        serviceType: true,
        assignment: {
          select: {
            driverId: true,
            repId: true,
            driverStatus: true,
            repStatus: true,
            driver: { select: { name: true } },
          },
        },
      },
    });

    const projected = job
      ? this.jobCompletion.projectJobStatus(
          { status: job.status as string, serviceType: job.serviceType as string },
          job.assignment
            ? {
                driverId: job.assignment.driverId,
                repId: job.assignment.repId,
                driverStatus: job.assignment.driverStatus as string,
                repStatus: job.assignment.repStatus as string,
              }
            : null,
          'driver',
          target,
        )
      : null;

    return {
      rep: null,
      driver: job?.assignment?.driver?.name ?? null,
      status: projected,
      portalStatus: `Driver: ${target.replace(/_/g, ' ')}`,
    };
  }
}
