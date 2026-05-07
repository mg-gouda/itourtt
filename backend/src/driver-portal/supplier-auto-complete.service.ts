import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const CAIRO_TZ = 'Africa/Cairo';

@Injectable()
export class SupplierAutoCompleteService {
  private readonly logger = new Logger(SupplierAutoCompleteService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 * * *', { timeZone: CAIRO_TZ })
  async autoCompleteJobs() {
    // Get Cairo "today" as a UTC-midnight Date so it matches @db.Date stored values
    const nowUtc = new Date();
    const cairoDateStr = nowUtc.toLocaleDateString('en-CA', { timeZone: CAIRO_TZ });
    const [y, m, d] = cairoDateStr.split('-').map(Number);
    const todayCairo = new Date(Date.UTC(y, m - 1, d));

    this.logger.log(
      `Midnight auto-complete: processing all past non-terminal jobs before ${todayCairo.toISOString()}`,
    );

    await this.autoCompleteDrivers(todayCairo);
    await this.autoCompleteReps(todayCairo);
    await this.autoCompleteSuppliers(todayCairo);
  }

  // Auto-complete all drivers (own + supplier) that didn't update via portal
  private async autoCompleteDrivers(before: Date) {
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId: { not: null },
        driverStatus: { notIn: TERMINAL_STATUSES as any },
        trafficJob: {
          deletedAt: null,
          status: { notIn: TERMINAL_STATUSES as any },
          jobDate: { lt: before },
        },
      },
      include: { trafficJob: true },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;
      this.logger.log(
        `Auto-completing driver for job ${job.internalRef} (was: ${assignment.driverStatus})`,
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
              gpsMapLink: 'Auto-completed by system (midnight)',
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

  // Auto-complete all rep statuses across all service types
  private async autoCompleteReps(before: Date) {
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        repStatus: { notIn: TERMINAL_STATUSES as any },
        trafficJob: {
          deletedAt: null,
          status: { notIn: TERMINAL_STATUSES as any },
          jobDate: { lt: before },
        },
      },
      include: { trafficJob: true },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;
      this.logger.log(
        `Auto-completing rep for ${job.serviceType} job ${job.internalRef} (was: ${assignment.repStatus})`,
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
              gpsMapLink: 'Auto-completed by system (midnight)',
            },
          });

          await this.maybeCompleteJob(tx, assignment.id, job);
        });
      } catch (err) {
        this.logger.error(
          `Failed rep auto-complete for job ${job.internalRef}: ${err}`,
        );
      }
    }
  }

  // Auto-complete supplier status for jobs assigned to a supplier
  private async autoCompleteSuppliers(before: Date) {
    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        supplierId: { not: null },
        supplierStatus: { notIn: TERMINAL_STATUSES as any },
        trafficJob: {
          deletedAt: null,
          status: { notIn: TERMINAL_STATUSES as any },
          jobDate: { lt: before },
        },
      },
      include: { trafficJob: true },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;
      this.logger.log(
        `Auto-completing supplier for job ${job.internalRef} (was: ${assignment.supplierStatus})`,
      );
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.trafficAssignment.update({
            where: { id: assignment.id },
            data: { supplierStatus: 'COMPLETED' as any },
          });

          await tx.statusChangeLog.create({
            data: {
              assignmentId: assignment.id,
              changedBy: 'SYSTEM',
              changedById: assignment.id,
              previousStatus: assignment.supplierStatus as any,
              newStatus: 'COMPLETED' as any,
              gpsLatitude: 0,
              gpsLongitude: 0,
              gpsMapLink: 'Auto-completed by system (midnight)',
            },
          });

          await this.maybeCompleteJob(tx, assignment.id, job);
        });
      } catch (err) {
        this.logger.error(
          `Failed supplier auto-complete for job ${job.internalRef}: ${err}`,
        );
      }
    }
  }

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
    const supplierDone =
      !fresh.supplierId || TERMINAL_STATUSES.includes(fresh.supplierStatus as string);

    if (!driverDone || !repDone || !supplierDone) return;

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
