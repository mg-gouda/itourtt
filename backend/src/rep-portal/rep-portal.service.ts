import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveRepGeofenceTarget, isWithinGeofence, haversineDistance } from '../common/geofence.util.js';

type RepJobStatus = 'COMPLETED' | 'CANCELLED';

const REP_ALLOWED_STATUSES: RepJobStatus[] = ['COMPLETED', 'CANCELLED'];
const REP_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const REP_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PLACE', 'COMPLETED', 'CANCELLED'],
  IN_PLACE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class RepPortalService {
  private readonly logger = new Logger(RepPortalService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly jobInclude = {
    originAirport: true,
    originZone: true,
    originHotel: { include: { zone: true } },
    destinationAirport: true,
    destinationZone: true,
    destinationHotel: { include: { zone: true } },
    fromZone: true,
    toZone: true,
    flight: true,
    agent: { select: { legalName: true } },
    customer: { select: { legalName: true } },
    assignment: {
      include: {
        vehicle: { include: { vehicleType: true } },
        driver: { select: { name: true, mobileNumber: true } },
      },
    },
  };

  async resolveRepId(userId: string): Promise<string> {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!rep) {
      throw new ForbiddenException('No rep profile linked to this account');
    }
    return rep.id;
  }

  async getMyJobs(userId: string, date?: string) {
    const repId = await this.resolveRepId(userId);
    const jobDate = date ? new Date(date) : new Date();
    if (!date) {
      jobDate.setHours(0, 0, 0, 0);
    }

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId,
        trafficJob: {
          jobDate,
          deletedAt: null,
        },
      },
      include: {
        trafficJob: {
          include: this.jobInclude,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      date: jobDate.toISOString().split('T')[0],
      repId,
      jobs: assignments.map((a) => ({
        ...a.trafficJob,
        repStatus: a.repStatus,
      })),
    };
  }

  async getJobHistory(userId: string, dateFrom: string, dateTo: string) {
    const repId = await this.resolveRepId(userId);
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const [rep, assignments] = await Promise.all([
      this.prisma.rep.findUniqueOrThrow({
        where: { id: repId },
        select: { feePerFlight: true },
      }),
      this.prisma.trafficAssignment.findMany({
        where: {
          repId,
          repStatus: { in: REP_TERMINAL_STATUSES as any },
          trafficJob: {
            jobDate: { gte: from, lte: to },
            deletedAt: null,
          },
        },
        include: {
          trafficJob: {
            include: {
              ...this.jobInclude,
              repFees: {
                where: { repId },
                select: { amount: true, currency: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const feePerFlight = Number(rep.feePerFlight);

    return {
      dateFrom,
      dateTo,
      repId,
      jobs: assignments.map((a) => {
        const existingFee = a.trafficJob.repFees[0];
        const isCompletedArr =
          a.repStatus === 'COMPLETED' &&
          a.trafficJob.serviceType === 'ARR';

        return {
          ...a.trafficJob,
          repStatus: a.repStatus,
          feeEarned: existingFee
            ? Number(existingFee.amount)
            : isCompletedArr
              ? feePerFlight
              : null,
        };
      }),
    };
  }

  async updateJobStatus(
    userId: string,
    jobId: string,
    status: RepJobStatus,
    latitude: number,
    longitude: number,
  ) {
    const repId = await this.resolveRepId(userId);

    if (!REP_ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${REP_ALLOWED_STATUSES.join(', ')}`,
      );
    }

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        repId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkRepTimelock(assignment.trafficJob);
    this.checkRepGeofence(assignment.trafficJob, latitude, longitude);

    const currentStatus = assignment.repStatus;
    const allowed = REP_VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change rep status from "${currentStatus}" to "${status}"`,
      );
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { repStatus: status as any },
        include: {
          trafficJob: {
            include: this.jobInclude,
          },
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'REP',
          changedById: repId,
          previousStatus: currentStatus as any,
          newStatus: status as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      return {
        ...updated.trafficJob,
        repStatus: updated.repStatus,
      };
    });
  }

  async submitNoShow(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number,
    longitude: number,
  ) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!rep) throw new ForbiddenException('No rep profile linked to this account');
    const repId = rep.id;
    const submittedByLabel = `REP-${rep.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        repId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkRepTimelock(assignment.trafficJob);
    this.checkRepGeofence(assignment.trafficJob, latitude, longitude);

    const currentStatus = assignment.repStatus;
    if (REP_TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Rep status is already terminal: "${currentStatus}"`,
      );
    }

    if (currentStatus !== 'PENDING' && currentStatus !== 'IN_PLACE') {
      throw new BadRequestException(
        `Cannot submit no-show from "${currentStatus}"`,
      );
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { repStatus: 'NO_SHOW' as any },
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
          submittedById: repId,
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'REP',
          changedById: repId,
          previousStatus: currentStatus as any,
          newStatus: 'NO_SHOW' as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      return {
        ...updated.trafficJob,
        repStatus: updated.repStatus,
      };
    });
  }

  async submitInPlace(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number,
    longitude: number,
  ) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!rep) throw new ForbiddenException('No rep profile linked to this account');
    const repId = rep.id;
    const submittedByLabel = `REP-${rep.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        repId,
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

    this.checkRepTimelock(assignment.trafficJob);
    this.checkRepGeofence(assignment.trafficJob, latitude, longitude);

    // Enforce IN PLACE time window: arrivalTime - 10min to arrivalTime + 80min
    const flight = (assignment.trafficJob as any).flight;
    if (flight?.arrivalTime) {
      const now = new Date();
      const arrivalTime = new Date(flight.arrivalTime);
      const windowStart = new Date(arrivalTime.getTime() - 10 * 60 * 1000);
      const windowEnd = new Date(arrivalTime.getTime() + 80 * 60 * 1000);
      if (now < windowStart || now > windowEnd) {
        const fmt = (d: Date) =>
          d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false });
        throw new BadRequestException(
          `IN PLACE can only be submitted between ${fmt(windowStart)} and ${fmt(windowEnd)} (10 min before to 80 min after flight arrival)`,
        );
      }
    }

    const currentStatus = assignment.repStatus;

    // Idempotent: already IN_PLACE — return current state without re-processing
    if (currentStatus === 'IN_PLACE') {
      const job = await this.prisma.trafficJob.findUniqueOrThrow({
        where: { id: jobId },
        include: this.jobInclude,
      });
      return { ...job, repStatus: 'IN_PLACE' };
    }

    if (currentStatus !== 'PENDING') {
      throw new BadRequestException(
        `Cannot mark as In Place from "${currentStatus}"`,
      );
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { repStatus: 'IN_PLACE' as any },
        include: {
          trafficJob: {
            include: this.jobInclude,
          },
        },
      });

      await tx.inPlaceEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrls,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: submittedByLabel,
          submittedById: repId,
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'REP',
          changedById: repId,
          previousStatus: currentStatus as any,
          newStatus: 'IN_PLACE' as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      return {
        ...updated.trafficJob,
        repStatus: updated.repStatus,
      };
    });
  }

  async submitCompleted(
    userId: string,
    jobId: string,
    imageUrls: string[],
    latitude: number,
    longitude: number,
  ) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!rep) throw new ForbiddenException('No rep profile linked to this account');
    const repId = rep.id;
    const submittedByLabel = `REP-${rep.user?.name ?? 'Unknown'}`;

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { repId, trafficJobId: jobId },
      include: {
        trafficJob: {
          include: {
            originAirport: true,
            originZone: true,
            originHotel: { include: { zone: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkRepTimelock(assignment.trafficJob);
    this.checkRepGeofence(assignment.trafficJob, latitude, longitude);

    const currentStatus = assignment.repStatus;
    const allowed = REP_VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes('COMPLETED')) {
      throw new BadRequestException(
        `Cannot mark as Completed from "${currentStatus}"`,
      );
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trafficAssignment.update({
        where: { id: assignment.id },
        data: { repStatus: 'COMPLETED' as any },
        include: { trafficJob: { include: this.jobInclude } },
      });

      const job = updated.trafficJob;
      const driverAssigned = !!updated.driverId;
      const driverCompleted = updated.driverStatus === 'COMPLETED';
      const shouldCompleteJob = !driverAssigned || driverCompleted;

      if (shouldCompleteJob) {
        await tx.trafficJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETED' as any },
        });

        // Auto-generate DriverTripFee
        if (updated.driverId && job.fromZoneId && job.toZoneId) {
          const existingDriverFee = await tx.driverTripFee.findFirst({
            where: { driverId: updated.driverId, trafficJobId: jobId },
          });
          if (!existingDriverFee) {
            await tx.driverTripFee.create({
              data: {
                driverId: updated.driverId,
                trafficJobId: jobId,
                fromZoneId: job.fromZoneId,
                toZoneId: job.toZoneId,
                amount: 0,
                currency: 'EGP',
              },
            });
          }
        }

        // Auto-generate RepFee for ARR jobs
        if (job.serviceType === 'ARR' && updated.repId) {
          const existingRepFee = await tx.repFee.findFirst({
            where: { repId: updated.repId, trafficJobId: jobId },
          });
          if (!existingRepFee) {
            const rep = await tx.rep.findUniqueOrThrow({ where: { id: updated.repId } });
            await tx.repFee.create({
              data: {
                repId: updated.repId,
                trafficJobId: jobId,
                amount: rep.feePerFlight,
                currency: 'EGP',
              },
            });
          }
        }
      }

      await tx.completedEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrls,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: submittedByLabel,
          submittedById: repId,
        },
      });

      await tx.statusChangeLog.create({
        data: {
          assignmentId: assignment.id,
          changedBy: 'REP',
          changedById: repId,
          previousStatus: currentStatus as any,
          newStatus: 'COMPLETED' as any,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
        },
      });

      return { ...updated.trafficJob, repStatus: updated.repStatus };
    });
  }

  async submitFlightDelay(
    userId: string,
    jobId: string,
    newArrivalTime: string,
  ) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!rep) throw new ForbiddenException('No rep profile linked to this account');

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: { repId: rep.id, trafficJobId: jobId },
      include: {
        trafficJob: {
          select: { internalRef: true, serviceType: true, jobDate: true, flight: true },
        },
      },
    });

    if (!assignment) throw new NotFoundException('Job not found or not assigned to you');
    if (assignment.trafficJob.serviceType !== 'ARR') {
      throw new BadRequestException('Flight delay can only be reported for arrival (ARR) jobs');
    }
    if (!(assignment.trafficJob as any).flight) {
      throw new BadRequestException('This job has no flight information to update');
    }

    const newTime = new Date(newArrivalTime);
    if (isNaN(newTime.getTime())) {
      throw new BadRequestException('Invalid date/time format');
    }

    await this.prisma.trafficFlight.update({
      where: { trafficJobId: jobId },
      data: { arrivalTime: newTime },
    });

    const job = assignment.trafficJob;
    const repName = rep.user?.name ?? (rep as any).name ?? 'Rep';
    const newTimeStr = newTime.toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const title = `✈ Flight Delay: ${job.internalRef}`;
    const message = `${repName} reported a flight delay. New arrival time: ${newTimeStr}. Please verify and update IN PLACE window if needed.`;

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          {
            roleRef: {
              permissions: {
                some: { permissionKey: { in: ['traffic-jobs', 'dispatch'] } },
              },
            },
          },
          { role: 'ADMIN' },
        ],
      },
      select: { id: true },
    });

    if (recipients.length > 0) {
      await this.prisma.userNotification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          title,
          message,
          type: 'FLIGHT_DELAY' as const,
          trafficJobId: jobId,
          metadata: { repName, newArrivalTime: newTime.toISOString() },
        })),
      });
    }

    this.logger.log(`Flight delay reported for ${job.internalRef} by ${repName}: new arrival ${newTimeStr}`);

    return { success: true, newArrivalTime: newTime.toISOString(), recipientCount: recipients.length };
  }

  async submitUpdate(
    userId: string,
    jobId: string,
    message: string,
  ) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { name: true } } },
    });
    if (!rep) throw new ForbiddenException('No rep profile linked to this account');

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        repId: rep.id,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: { select: { internalRef: true, serviceType: true, jobDate: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    const repName = rep.user?.name ?? rep.name;
    const job = assignment.trafficJob;
    const title = `Rep Update: ${job.internalRef}`;
    const notifMessage = `${repName} — ${message}`;

    // Find all users with traffic-jobs or dispatch permission (Traffic & Dispatch operators/managers)
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          {
            roleRef: {
              permissions: {
                some: { permissionKey: { in: ['traffic-jobs', 'dispatch'] } },
              },
            },
          },
          { role: 'ADMIN' },
        ],
      },
      select: { id: true },
    });

    if (recipients.length > 0) {
      await this.prisma.userNotification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          title,
          message: notifMessage,
          type: 'GENERAL' as const,
          trafficJobId: jobId,
          metadata: { repName, repUpdate: message },
        })),
      });

      this.logger.log(
        `Rep update notification sent to ${recipients.length} users for job ${job.internalRef}`,
      );
    }

    return { success: true, recipientCount: recipients.length };
  }

  async getNotifications(userId: string) {
    const repId = await this.resolveRepId(userId);

    const notifications = await this.prisma.repNotification.findMany({
      where: { repId },
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

    const unreadCount = await this.prisma.repNotification.count({
      where: { repId, isRead: false },
    });

    return { notifications, unreadCount };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const repId = await this.resolveRepId(userId);

    const notification = await this.prisma.repNotification.findFirst({
      where: { id: notificationId, repId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.repNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    const repId = await this.resolveRepId(userId);

    await this.prisma.repNotification.updateMany({
      where: { repId, isRead: false },
      data: { isRead: true },
    });

    return { success: true };
  }

  async getProfile(userId: string) {
    const rep = await this.prisma.rep.findFirst({
      where: { userId, deletedAt: null },
      include: {
        repZones: {
          include: {
            zone: {
              include: {
                city: {
                  include: { airport: true },
                },
              },
            },
          },
        },
      },
    });

    if (!rep) {
      throw new ForbiddenException('No rep profile linked to this account');
    }

    return rep;
  }

  private checkRepTimelock(job: { jobDate: Date; repUnlockedAt?: Date | null }) {
    if (job.repUnlockedAt) return;
    const cutoff = new Date(job.jobDate.getTime() + FORTY_EIGHT_HOURS_MS);
    if (new Date() > cutoff) {
      throw new ForbiddenException(
        'Reps cannot update job status more than 48 hours after the service date.',
      );
    }
  }

  private checkRepGeofence(job: any, latitude: number, longitude: number) {
    const target = resolveRepGeofenceTarget(job);
    if (!target) {
      // No coordinates configured for this job's location — skip check
      return;
    }
    if (!isWithinGeofence(latitude, longitude, target.lat, target.lng, 2000)) {
      // Outside 2km — log for audit but do not block the rep
      const dist = Math.round(haversineDistance(latitude, longitude, target.lat, target.lng));
      this.logger.warn(
        `Rep geofence miss on job ${job.id}: rep at (${latitude},${longitude}) is ${dist}m from target (${target.lat},${target.lng})`,
      );
    }
  }

  async findJobDetail(userId: string, jobId: string) {
    const repId = await this.resolveRepId(userId);
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, assignment: { repId }, deletedAt: null },
      include: {
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
}
