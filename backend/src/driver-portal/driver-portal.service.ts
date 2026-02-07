import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type DriverJobStatus = 'COMPLETED' | 'CANCELLED';

const DRIVER_ALLOWED_STATUSES: DriverJobStatus[] = ['COMPLETED', 'CANCELLED'];
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

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
      jobs: assignments.map((a) => a.trafficJob),
    };
  }

  async getJobHistory(userId: string, dateFrom: string, dateTo: string) {
    const driverId = await this.resolveDriverId(userId);
    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId,
        trafficJob: {
          jobDate: { gte: from, lte: to },
          deletedAt: null,
          status: { in: TERMINAL_STATUSES as any },
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
        feeEarned: a.trafficJob.driverFees[0]
          ? Number(a.trafficJob.driverFees[0].amount)
          : null,
      })),
    };
  }

  async updateJobStatus(userId: string, jobId: string, status: DriverJobStatus) {
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

    const currentStatus = assignment.trafficJob.status;
    if (TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Job is already in terminal status "${currentStatus}"`,
      );
    }

    if (currentStatus !== 'ASSIGNED' && currentStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot change status from "${currentStatus}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.trafficJob.update({
        where: { id: jobId },
        data: { status },
        include: this.jobInclude,
      });

      // Auto-generate DriverTripFee when a job is completed
      if (status === 'COMPLETED' && updatedJob.fromZoneId && updatedJob.toZoneId) {
        const existingFee = await tx.driverTripFee.findFirst({
          where: { driverId, trafficJobId: jobId },
        });

        if (!existingFee) {
          // Look up fee amount from driver trip fee schedule
          const feeSchedule = await tx.driverTripFee.findFirst({
            where: {
              driverId,
              fromZoneId: updatedJob.fromZoneId,
              toZoneId: updatedJob.toZoneId,
            },
          });

          // Only auto-create if there's no existing fee (the dispatch service handles fee creation)
          // This is a no-op safety net — dispatch already handles fee creation on COMPLETED
        }
      }

      return updatedJob;
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

    const currentStatus = assignment.trafficJob.status;
    if (TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Job is already in terminal status "${currentStatus}"`,
      );
    }

    if (currentStatus !== 'ASSIGNED' && currentStatus !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Cannot change status from "${currentStatus}"`,
      );
    }

    const gpsMapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.trafficJob.update({
        where: { id: jobId },
        data: { status: 'NO_SHOW' },
        include: this.jobInclude,
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

      return updatedJob;
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
}
