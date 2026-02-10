import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignJobDto } from './dto/assign-job.dto.js';
import { ReassignJobDto } from './dto/reassign-job.dto.js';
import type { ServiceType, JobStatus } from '../../generated/prisma/client.js';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // DAY VIEW
  // ─────────────────────────────────────────────

  async getDayView(date: string) {
    const jobDate = new Date(date);

    const baseInclude = {
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
      flight: true,
      assignment: {
        include: {
          vehicle: { include: { vehicleType: true } },
          driver: true,
          rep: true,
        },
      },
    };

    const baseWhere = {
      jobDate,
      deletedAt: null,
    };

    const [arrivals, departures, cityJobs] = await Promise.all([
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'ARR' as ServiceType },
        include: baseInclude,
        orderBy: [
          { flight: { arrivalTime: 'asc' } },
          { createdAt: 'asc' },
        ],
      }),
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'DEP' as ServiceType },
        include: baseInclude,
        orderBy: [
          { flight: { departureTime: 'asc' } },
          { createdAt: 'asc' },
        ],
      }),
      this.prisma.trafficJob.findMany({
        where: { ...baseWhere, serviceType: 'EXCURSION' as ServiceType },
        include: baseInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { arrivals, departures, cityJobs };
  }

  // ─────────────────────────────────────────────
  // ASSIGN JOB
  // ─────────────────────────────────────────────

  async assignJob(dto: AssignJobDto, userId: string) {
    // 1. Verify job exists and is eligible
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
      include: { assignment: true, flight: true },
    });

    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${dto.trafficJobId}" not found`,
      );
    }

    if (job.status === ('CANCELLED' as JobStatus)) {
      throw new BadRequestException('Cannot assign a cancelled job');
    }

    if (job.assignment) {
      throw new ConflictException(
        'This job already has an assignment. Use reassign instead.',
      );
    }

    // 2. Verify vehicle exists and is active
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, deletedAt: null, isActive: true },
      include: { vehicleType: true },
    });

    if (!vehicle) {
      throw new NotFoundException(
        `Vehicle with ID "${dto.vehicleId}" not found or inactive`,
      );
    }

    // 3. Pax count must not exceed vehicle capacity
    if (job.paxCount > vehicle.vehicleType.seatCapacity) {
      throw new BadRequestException(
        `Pax count (${job.paxCount}) exceeds vehicle capacity (${vehicle.vehicleType.seatCapacity})`,
      );
    }

    // 4. Check vehicle availability on the same date
    const conflictingAssignment = await this.prisma.trafficAssignment.findFirst({
      where: {
        vehicleId: dto.vehicleId,
        trafficJob: {
          jobDate: job.jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
    });

    if (conflictingAssignment) {
      throw new ConflictException(
        'Vehicle is already assigned to another active job on this date',
      );
    }

    // 5. Validate driver with time-aware rules
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, deletedAt: null, isActive: true },
      });
      if (!driver) {
        throw new NotFoundException(
          `Driver with ID "${dto.driverId}" not found or inactive`,
        );
      }
      await this.validateDriverAvailability(dto.driverId, job);
    }

    // 6. Validate rep with flight-aware rules
    if (dto.repId) {
      // Reps cannot be assigned to Excursion (CITY) jobs
      if (job.serviceType === ('EXCURSION' as ServiceType)) {
        throw new BadRequestException(
          'Rep assignment is not available for Excursion jobs.',
        );
      }
      const rep = await this.prisma.rep.findFirst({
        where: { id: dto.repId, deletedAt: null, isActive: true },
      });
      if (!rep) {
        throw new NotFoundException(
          `Rep with ID "${dto.repId}" not found or inactive`,
        );
      }
      await this.validateRepAvailability(dto.repId, job);
    }

    // 7. Create assignment and update job status in a transaction
    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trafficAssignment.create({
        data: {
          trafficJobId: dto.trafficJobId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId ?? null,
          repId: dto.repId ?? null,
          assignedById: userId,
        },
        include: {
          vehicle: { include: { vehicleType: true } },
          driver: true,
          rep: true,
          trafficJob: true,
        },
      });

      await tx.trafficJob.update({
        where: { id: dto.trafficJobId },
        data: { status: 'ASSIGNED' as JobStatus },
      });

      if (dto.repId) {
        await tx.repNotification.create({
          data: {
            repId: dto.repId,
            title: 'New Job Assigned',
            message: `${created.trafficJob.internalRef} - ${created.trafficJob.serviceType} on ${created.trafficJob.jobDate.toISOString().split('T')[0]}`,
            type: 'JOB_ASSIGNED',
            trafficJobId: dto.trafficJobId,
          },
        });
      }

      return created;
    });

    return assignment;
  }

  // ─────────────────────────────────────────────
  // REASSIGN JOB
  // ─────────────────────────────────────────────

  async reassignJob(assignmentId: string, dto: ReassignJobDto, userId: string) {
    if (!dto.vehicleId && !dto.driverId && !dto.repId) {
      throw new BadRequestException(
        'At least one of vehicleId, driverId, or repId must be provided',
      );
    }

    const existing = await this.prisma.trafficAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        trafficJob: { include: { flight: true } },
        vehicle: { include: { vehicleType: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Assignment with ID "${assignmentId}" not found`,
      );
    }

    const job = existing.trafficJob;

    // Vehicle validation
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, deletedAt: null, isActive: true },
        include: { vehicleType: true },
      });

      if (!vehicle) {
        throw new NotFoundException(
          `Vehicle with ID "${dto.vehicleId}" not found or inactive`,
        );
      }

      if (job.paxCount > vehicle.vehicleType.seatCapacity) {
        throw new BadRequestException(
          `Pax count (${job.paxCount}) exceeds vehicle capacity (${vehicle.vehicleType.seatCapacity})`,
        );
      }

      const conflicting = await this.prisma.trafficAssignment.findFirst({
        where: {
          vehicleId: dto.vehicleId,
          id: { not: assignmentId },
          trafficJob: {
            jobDate: job.jobDate,
            deletedAt: null,
            status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
          },
        },
      });

      if (conflicting) {
        throw new ConflictException(
          'Vehicle is already assigned to another active job on this date',
        );
      }
    }

    // Driver validation with time-aware rules
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: dto.driverId, deletedAt: null, isActive: true },
      });
      if (!driver) {
        throw new NotFoundException(
          `Driver with ID "${dto.driverId}" not found or inactive`,
        );
      }
      await this.validateDriverAvailability(dto.driverId, job, assignmentId);
    }

    // Rep validation with flight-aware rules
    if (dto.repId) {
      if (job.serviceType === ('EXCURSION' as ServiceType)) {
        throw new BadRequestException(
          'Rep assignment is not available for Excursion jobs.',
        );
      }
      const rep = await this.prisma.rep.findFirst({
        where: { id: dto.repId, deletedAt: null, isActive: true },
      });
      if (!rep) {
        throw new NotFoundException(
          `Rep with ID "${dto.repId}" not found or inactive`,
        );
      }
      await this.validateRepAvailability(dto.repId, job, assignmentId);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.vehicleId !== undefined) updateData.vehicleId = dto.vehicleId;
    if (dto.driverId !== undefined) {
      updateData.driverId = dto.driverId;
      if (dto.driverId !== existing.driverId) {
        updateData.driverStatus = 'PENDING';
      }
    }
    if (dto.repId !== undefined) {
      updateData.repId = dto.repId;
      if (dto.repId !== existing.repId) {
        updateData.repStatus = 'PENDING';
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.trafficAssignment.update({
        where: { id: assignmentId },
        data: updateData,
        include: {
          vehicle: { include: { vehicleType: true } },
          driver: true,
          rep: true,
          trafficJob: true,
        },
      });

      if (dto.repId && dto.repId !== existing.repId) {
        await tx.repNotification.create({
          data: {
            repId: dto.repId,
            title: 'New Job Assigned',
            message: `${result.trafficJob.internalRef} - ${result.trafficJob.serviceType} on ${result.trafficJob.jobDate.toISOString().split('T')[0]}`,
            type: 'JOB_ASSIGNED',
            trafficJobId: result.trafficJobId,
          },
        });
      }

      return result;
    });

    return updated;
  }

  // ─────────────────────────────────────────────
  // UNASSIGN JOB
  // ─────────────────────────────────────────────

  async unassignJob(assignmentId: string) {
    const assignment = await this.prisma.trafficAssignment.findUnique({
      where: { id: assignmentId },
      include: { trafficJob: true },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment with ID "${assignmentId}" not found`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trafficAssignment.delete({
        where: { id: assignmentId },
      });

      await tx.trafficJob.update({
        where: { id: assignment.trafficJobId },
        data: { status: 'PENDING' as JobStatus },
      });
    });

    return { message: 'Assignment removed successfully' };
  }

  // ─────────────────────────────────────────────
  // AVAILABLE RESOURCES
  // ─────────────────────────────────────────────

  async getAvailableVehicles(date: string) {
    const jobDate = new Date(date);

    const busyAssignments = await this.prisma.trafficAssignment.findMany({
      where: {
        trafficJob: {
          jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
      select: { vehicleId: true },
    });

    const busyVehicleIds = busyAssignments.map((a) => a.vehicleId);

    return this.prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ownership: { not: 'CONTRACTED' },
        ...(busyVehicleIds.length > 0 && {
          id: { notIn: busyVehicleIds },
        }),
      },
      include: { vehicleType: true },
      orderBy: { plateNumber: 'asc' },
    });
  }

  /**
   * Time-aware driver availability. When jobId is provided, only returns drivers
   * with a 3+ hour gap from the target job's flight time.
   */
  async getAvailableDrivers(date: string, jobId?: string) {
    const jobDate = new Date(date);

    // If no jobId, return all active drivers (legacy fallback)
    if (!jobId) {
      return this.prisma.driver.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    const targetJob = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
      include: { flight: true },
    });
    if (!targetJob) {
      return this.prisma.driver.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    const targetTime = this.getJobReferenceTime(targetJob);

    // Get all active driver assignments on this date
    const busyAssignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId: { not: null },
        trafficJob: {
          jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
      include: {
        trafficJob: { include: { flight: true } },
      },
    });

    // Group assignments by driver
    const driverAssignments = new Map<string, typeof busyAssignments>();
    for (const a of busyAssignments) {
      if (!a.driverId) continue;
      const list = driverAssignments.get(a.driverId) || [];
      list.push(a);
      driverAssignments.set(a.driverId, list);
    }

    // Find busy driver IDs (those that conflict with target)
    const busyDriverIds: string[] = [];
    for (const [driverId, assignments] of driverAssignments) {
      for (const a of assignments) {
        const existingTime = this.getJobReferenceTime(a.trafficJob);

        // Excursion with no time blocks full day
        if (targetTime === null || existingTime === null) {
          busyDriverIds.push(driverId);
          break;
        }

        const gap = Math.abs(targetTime.getTime() - existingTime.getTime());
        if (gap < THREE_HOURS_MS) {
          busyDriverIds.push(driverId);
          break;
        }
      }
    }

    return this.prisma.driver.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(busyDriverIds.length > 0 && {
          id: { notIn: busyDriverIds },
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Flight-aware rep availability. Returns reps that can work the target job
   * based on same-flight sharing and 3-hour gap rules.
   * Returns empty for Excursion jobs (no rep assignment on Excursion).
   */
  async getAvailableReps(date: string, jobId?: string) {
    const jobDate = new Date(date);

    if (!jobId) {
      return this.prisma.rep.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    const targetJob = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
      include: { flight: true },
    });

    // No rep assignment on Excursion jobs
    if (!targetJob || targetJob.serviceType === ('EXCURSION' as ServiceType)) {
      return [];
    }

    const targetFlight = targetJob.flight;
    const targetTime = this.getJobReferenceTime(targetJob);

    // Get all active rep assignments on this date
    const busyAssignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId: { not: null },
        trafficJob: {
          jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
      include: {
        trafficJob: { include: { flight: true } },
      },
    });

    // Group by rep
    const repAssignments = new Map<string, typeof busyAssignments>();
    for (const a of busyAssignments) {
      if (!a.repId) continue;
      const list = repAssignments.get(a.repId) || [];
      list.push(a);
      repAssignments.set(a.repId, list);
    }

    const busyRepIds: string[] = [];
    for (const [repId, assignments] of repAssignments) {
      let blocked = false;
      for (const a of assignments) {
        const existingFlight = a.trafficJob.flight;
        const existingTime = this.getJobReferenceTime(a.trafficJob);

        // Same flight check: same flightNo AND same time → allowed
        if (
          targetFlight &&
          existingFlight &&
          targetFlight.flightNo === existingFlight.flightNo &&
          targetTime &&
          existingTime &&
          targetTime.getTime() === existingTime.getTime()
        ) {
          continue;
        }

        // Different flight: need 3-hour gap
        if (targetTime === null || existingTime === null) {
          blocked = true;
          break;
        }

        const gap = Math.abs(targetTime.getTime() - existingTime.getTime());
        if (gap < THREE_HOURS_MS) {
          blocked = true;
          break;
        }
      }
      if (blocked) busyRepIds.push(repId);
    }

    return this.prisma.rep.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(busyRepIds.length > 0 && {
          id: { notIn: busyRepIds },
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  /**
   * Get the reference time for a job. ARR → arrivalTime, DEP → departureTime or pickUpTime.
   * Excursion → null.
   */
  private getJobReferenceTime(
    job: { serviceType: string; pickUpTime?: Date | null; flight?: { arrivalTime?: Date | null; departureTime?: Date | null } | null },
  ): Date | null {
    if (job.serviceType === 'ARR' && job.flight?.arrivalTime) {
      return new Date(job.flight.arrivalTime);
    }
    if (job.serviceType === 'DEP') {
      if (job.pickUpTime) return new Date(job.pickUpTime);
      if (job.flight?.departureTime) return new Date(job.flight.departureTime);
    }
    return null;
  }

  /**
   * Validate driver availability with 3-hour gap rule.
   * Drivers can NEVER share a job — one driver = one vehicle = one job at a time.
   * Excursion jobs block the driver for the full day.
   */
  private async validateDriverAvailability(
    driverId: string,
    job: { id: string; jobDate: Date; serviceType: string; pickUpTime?: Date | null; flight?: { arrivalTime?: Date | null; departureTime?: Date | null } | null },
    excludeAssignmentId?: string,
  ) {
    const existingAssignments = await this.prisma.trafficAssignment.findMany({
      where: {
        driverId,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        trafficJob: {
          jobDate: job.jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
      include: {
        trafficJob: { include: { flight: true } },
      },
    });

    if (existingAssignments.length === 0) return;

    const targetTime = this.getJobReferenceTime(job);

    for (const a of existingAssignments) {
      const existingTime = this.getJobReferenceTime(a.trafficJob);

      // Excursion involved → block full day
      if (targetTime === null || existingTime === null) {
        throw new ConflictException(
          `Driver is already assigned to job ${a.trafficJob.internalRef} on this date.`,
        );
      }

      const gap = Math.abs(targetTime.getTime() - existingTime.getTime());
      if (gap < THREE_HOURS_MS) {
        const nextAvailable = new Date(existingTime.getTime() + THREE_HOURS_MS);
        throw new ConflictException(
          `Driver is assigned to job ${a.trafficJob.internalRef} (flight at ${existingTime.toISOString().slice(11, 16)}). ` +
          `Minimum 3-hour gap required. Next available: ${nextAvailable.toISOString().slice(11, 16)}.`,
        );
      }
    }
  }

  /**
   * Validate rep availability with flight-aware rules.
   * Same flight number + time → allowed (rep can handle multiple jobs on same flight).
   * Different flight → 3-hour gap required.
   */
  private async validateRepAvailability(
    repId: string,
    job: { id: string; jobDate: Date; serviceType: string; pickUpTime?: Date | null; flight?: { flightNo?: string; arrivalTime?: Date | null; departureTime?: Date | null } | null },
    excludeAssignmentId?: string,
  ) {
    const existingAssignments = await this.prisma.trafficAssignment.findMany({
      where: {
        repId,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        trafficJob: {
          jobDate: job.jobDate,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as JobStatus[] },
        },
      },
      include: {
        trafficJob: { include: { flight: true } },
      },
    });

    if (existingAssignments.length === 0) return;

    const targetFlight = job.flight;
    const targetTime = this.getJobReferenceTime(job);

    for (const a of existingAssignments) {
      const existingFlight = a.trafficJob.flight;
      const existingTime = this.getJobReferenceTime(a.trafficJob);

      // Same flight check: same flightNo AND same time → allowed
      if (
        targetFlight?.flightNo &&
        existingFlight?.flightNo &&
        targetFlight.flightNo === existingFlight.flightNo &&
        targetTime &&
        existingTime &&
        targetTime.getTime() === existingTime.getTime()
      ) {
        continue;
      }

      // No time reference → block
      if (targetTime === null || existingTime === null) {
        throw new ConflictException(
          `Rep is already assigned to job ${a.trafficJob.internalRef} on this date.`,
        );
      }

      // Different flight: 3-hour gap check
      const gap = Math.abs(targetTime.getTime() - existingTime.getTime());
      if (gap < THREE_HOURS_MS) {
        const nextAvailable = new Date(existingTime.getTime() + THREE_HOURS_MS);
        throw new ConflictException(
          `Rep is assigned to flight ${existingFlight?.flightNo ?? 'N/A'} at ${existingTime.toISOString().slice(11, 16)}. ` +
          `Minimum 3-hour gap required. Next available: ${nextAvailable.toISOString().slice(11, 16)}.`,
        );
      }
    }
  }
}
