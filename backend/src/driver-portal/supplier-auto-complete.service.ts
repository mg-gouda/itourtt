import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const SUPPLIER_AUTO_COMPLETE_MINUTES = 80;
const DRIVER_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

@Injectable()
export class SupplierAutoCompleteService {
  private readonly logger = new Logger(SupplierAutoCompleteService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('* * * * *') // every minute
  async autoCompleteSupplierJobs() {
    const now = new Date();

    const assignments = await this.prisma.trafficAssignment.findMany({
      where: {
        supplierId: { not: null },
        driverStatus: { notIn: DRIVER_TERMINAL_STATUSES as any },
        trafficJob: {
          deletedAt: null,
          status: { notIn: DRIVER_TERMINAL_STATUSES as any },
        },
      },
      include: {
        trafficJob: {
          include: { flight: true },
        },
      },
    });

    for (const assignment of assignments) {
      const job = assignment.trafficJob;

      // Determine the reference job time
      const flight = (job as any).flight;
      const jobTime =
        job.serviceType === 'ARR'
          ? (flight?.arrivalTime ?? null)
          : (job.pickUpTime ?? null);

      if (!jobTime) continue;

      const autoCompleteAt = new Date(
        new Date(jobTime).getTime() + SUPPLIER_AUTO_COMPLETE_MINUTES * 60 * 1000,
      );

      if (now < autoCompleteAt) continue;

      this.logger.log(
        `Auto-completing supplier job ${job.internalRef} (${assignment.id}) — ${SUPPLIER_AUTO_COMPLETE_MINUTES}min past job time`,
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

          const isDepJob = job.serviceType === 'DEP';
          const repAssigned = !!assignment.repId;
          const repCompleted = assignment.repStatus === 'COMPLETED';
          const shouldCompleteJob = !repAssigned || repCompleted || isDepJob;

          if (shouldCompleteJob) {
            await tx.trafficJob.update({
              where: { id: job.id },
              data: { status: 'COMPLETED' as any },
            });

            if (assignment.driverId && job.fromZoneId && job.toZoneId) {
              const existingFee = await tx.driverTripFee.findFirst({
                where: { driverId: assignment.driverId, trafficJobId: job.id },
              });
              if (!existingFee) {
                await tx.driverTripFee.create({
                  data: {
                    driverId: assignment.driverId,
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
        });
      } catch (err) {
        this.logger.error(
          `Failed to auto-complete supplier job ${job.internalRef}: ${err}`,
        );
      }
    }
  }
}
