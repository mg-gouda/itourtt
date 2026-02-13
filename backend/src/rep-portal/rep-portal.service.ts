import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type RepJobStatus = 'COMPLETED' | 'CANCELLED';

const REP_ALLOWED_STATUSES: RepJobStatus[] = ['COMPLETED', 'CANCELLED'];
const REP_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const REP_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class RepPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly jobInclude = {
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
        trafficJob: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkRepTimelock(assignment.trafficJob);

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
    imageUrl1: string,
    imageUrl2: string,
    latitude: number,
    longitude: number,
  ) {
    const repId = await this.resolveRepId(userId);

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        repId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkRepTimelock(assignment.trafficJob);

    const currentStatus = assignment.repStatus;
    if (REP_TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Rep status is already terminal: "${currentStatus}"`,
      );
    }

    if (currentStatus !== 'PENDING') {
      throw new BadRequestException(
        `Cannot change rep status from "${currentStatus}"`,
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

      await tx.noShowEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrl1,
          imageUrl2,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: 'REP',
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
}
