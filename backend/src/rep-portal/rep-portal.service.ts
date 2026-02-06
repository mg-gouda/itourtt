import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type RepJobStatus = 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const REP_ALLOWED_STATUSES: RepJobStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

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
    // For "today" default, strip time
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
      jobs: assignments.map((a) => a.trafficJob),
    };
  }

  async getJobHistory(userId: string, date: string) {
    const repId = await this.resolveRepId(userId);
    const jobDate = new Date(date);

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId,
        trafficJob: {
          jobDate,
          deletedAt: null,
          status: { in: TERMINAL_STATUSES as any },
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
    });

    return {
      date,
      repId,
      jobs: assignments.map((a) => ({
        ...a.trafficJob,
        feeEarned: a.trafficJob.repFees[0]
          ? Number(a.trafficJob.repFees[0].amount)
          : null,
      })),
    };
  }

  async updateJobStatus(userId: string, jobId: string, status: RepJobStatus) {
    const repId = await this.resolveRepId(userId);

    if (!REP_ALLOWED_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${REP_ALLOWED_STATUSES.join(', ')}`,
      );
    }

    // Verify the rep is assigned to this job
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

    const currentStatus = assignment.trafficJob.status;
    if (TERMINAL_STATUSES.includes(currentStatus)) {
      throw new BadRequestException(
        `Job is already in terminal status "${currentStatus}"`,
      );
    }

    // Only allow transitions from ASSIGNED or IN_PROGRESS
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

      // Auto-generate RepFee when an ARR job is completed with a rep assigned
      if (
        status === 'COMPLETED' &&
        updatedJob.serviceType === 'ARR'
      ) {
        const rep = await tx.rep.findUniqueOrThrow({
          where: { id: repId },
        });

        const existingFee = await tx.repFee.findFirst({
          where: { repId, trafficJobId: jobId },
        });

        if (!existingFee) {
          await tx.repFee.create({
            data: {
              repId,
              trafficJobId: jobId,
              amount: rep.feePerFlight,
              currency: 'EGP',
            },
          });
        }
      }

      return updatedJob;
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
}
