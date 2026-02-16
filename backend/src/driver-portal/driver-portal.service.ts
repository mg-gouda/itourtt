import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type DriverJobStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const DRIVER_ALLOWED_STATUSES: DriverJobStatus[] = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const DRIVER_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

const DRIVER_VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class DriverPortalService {
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
        rep: { select: { name: true, mobileNumber: true } },
      },
    },
  };

  async resolveDriverId(userId: string): Promise<string> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId, deletedAt: null },
    });
    if (!driver) {
      throw new ForbiddenException('No driver profile linked to this account');
    }
    return driver.id;
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
          include: this.jobInclude,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      date: jobDate.toISOString().split('T')[0],
      driverId,
      jobs: assignments.map((a) => ({
        ...a.trafficJob,
        driverStatus: a.driverStatus,
      })),
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
            ...this.jobInclude,
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
    latitude: number,
    longitude: number,
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
        trafficJob: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkDriverTimelock(assignment.trafficJob);

    const currentStatus = assignment.driverStatus;
    const allowed = DRIVER_VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change driver status from "${currentStatus}" to "${status}"`,
      );
    }

    // Collection guard: driver must collect before completing
    if (status === 'COMPLETED' && assignment.trafficJob.collectionRequired && !assignment.trafficJob.collectionCollected) {
      throw new BadRequestException('Collection must be marked as collected before completing the job');
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

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

      return {
        ...updated.trafficJob,
        driverStatus: updated.driverStatus,
      };
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
    imageUrl1: string,
    imageUrl2: string,
    latitude: number,
    longitude: number,
  ) {
    const driverId = await this.resolveDriverId(userId);

    const assignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        driverId,
        trafficJobId: jobId,
      },
      include: {
        trafficJob: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Job not found or not assigned to you');
    }

    this.checkDriverTimelock(assignment.trafficJob);

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

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

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

      await tx.noShowEvidence.create({
        data: {
          trafficJobId: jobId,
          imageUrl1,
          imageUrl2,
          gpsLatitude: latitude,
          gpsLongitude: longitude,
          gpsMapLink,
          submittedBy: 'DRIVER',
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
    });
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
}
