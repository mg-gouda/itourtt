import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

@Injectable()
export class SupplierAutoCompleteService {
  private readonly logger = new Logger(SupplierAutoCompleteService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * *') // daily at midnight — auto-close yesterday's supplier driver & DEP rep statuses
  async autoCompleteJobs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    this.logger.log(
      `Midnight auto-complete: processing jobs on ${yesterday.toDateString()}`,
    );

    await this.autoCompleteSupplierDrivers(yesterday, today);
    await this.autoCompleteDepReps(yesterday, today);
  }

  private async autoCompleteSupplierDrivers(from: Date, to: Date) {
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        supplierId: { not: null },
        driverStatus: { notIn: TERMINAL_STATUSES as any },
        trafficJob: {
          deletedAt: null,
          status: { notIn: TERMINAL_STATUSES as any },
          jobDate: { gte: from, lt: to },
        },
      },
      include: { trafficJob: true },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;
      this.logger.log(
        `Auto-completing driver for supplier job ${job.internalRef}`,
      );
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.trafficAssignment.update({
            where: { id: assignment.id },
            data: { driverStatus: 'COMPLETED' as any },
          });

          await tx.statusChangeLog.create({
            data: {
              assignmentId: assignment.id,
              changedBy: 'SYSTEM',
              changedById: assignment.id,
              previousStatus: assignment.driverStatus as any,
              newStatus: 'COMPLETED' as any,
              gpsLatitude: 0,
              gpsLongitude: 0,
              gpsMapLink: 'Auto-completed by system (supplier car)',
            },
          });

          await this.maybeCompleteJob(tx, assignment.id, job);
        });
      } catch (err) {
        this.logger.error(
          `Failed driver auto-complete for job ${job.internalRef}: ${err}`,
        );
      }
    }
  }

  private async autoCompleteDepReps(from: Date, to: Date) {
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        repStatus: { notIn: TERMINAL_STATUSES as any },
        trafficJob: {
          serviceType: 'DEP',
          deletedAt: null,
          status: { notIn: TERMINAL_STATUSES as any },
          jobDate: { gte: from, lt: to },
        },
      },
      include: { trafficJob: true },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;
      this.logger.log(
        `Auto-completing rep for DEP job ${job.internalRef}`,
      );
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.trafficAssignment.update({
            where: { id: assignment.id },
            data: { repStatus: 'COMPLETED' as any },
          });

          await tx.statusChangeLog.create({
            data: {
              assignmentId: assignment.id,
              changedBy: 'SYSTEM',
              changedById: assignment.id,
              previousStatus: assignment.repStatus as any,
              newStatus: 'COMPLETED' as any,
              gpsLatitude: 0,
              gpsLongitude: 0,
              gpsMapLink: 'Auto-completed by system (DEP job)',
            },
          });

          await this.maybeCompleteJob(tx, assignment.id, job);
        });
      } catch (err) {
        this.logger.error(
          `Failed rep auto-complete for DEP job ${job.internalRef}: ${err}`,
        );
      }
    }
  }

  // Re-reads fresh assignment state to decide if the overall job is now done
  private async maybeCompleteJob(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    assignmentId: string,
    job: { id: string; internalRef: string; fromZoneId: string | null; toZoneId: string | null },
  ) {
    const fresh = await tx.trafficAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!fresh) return;

    const driverDone =
      !fresh.driverId || TERMINAL_STATUSES.includes(fresh.driverStatus as string);
    const repDone =
      !fresh.repId || TERMINAL_STATUSES.includes(fresh.repStatus as string);

    if (!driverDone || !repDone) return;

    await tx.trafficJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED' as any },
    });

    if (fresh.driverId && job.fromZoneId && job.toZoneId) {
      const existingFee = await tx.driverTripFee.findFirst({
        where: { driverId: fresh.driverId, trafficJobId: job.id },
      });
      if (!existingFee) {
        await tx.driverTripFee.create({
          data: {
            driverId: fresh.driverId,
            trafficJobId: job.id,
            fromZoneId: job.fromZoneId,
            toZoneId: job.toZoneId,
            amount: 0,
            currency: 'EGP',
          },
        });
      }
    }
  }
}
