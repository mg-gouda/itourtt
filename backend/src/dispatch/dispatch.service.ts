import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PushNotificationsService } from '../push-notifications/push-notifications.service.js';
import { AssignJobDto } from './dto/assign-job.dto.js';
import { ReassignJobDto } from './dto/reassign-job.dto.js';
import type { ServiceType, JobStatus } from '../../generated/prisma/client.js';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly pushService: PushNotificationsService,
  ) {}

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

  async assignJob(dto: AssignJobDto, userId: string, userRole?: string, roleSlug?: string) {
    // 1. Verify job exists and is eligible
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
      include: { assignment: true, flight: true, originAirport: true, originZone: true, originHotel: true, destinationAirport: true, destinationZone: true, destinationHotel: true },
    });

    if (!job) {
      throw new NotFoundException(
        `Traffic job with ID "${dto.trafficJobId}" not found`,
      );
    }

    // Dispatcher 48-hour lock (skip if job was explicitly unlocked)
    this.checkDispatcherTimelock(job.jobDate, userRole, roleSlug, job.dispatchUnlockedAt);

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

    // 4. Check vehicle availability with time-aware + route-aware rules
    await this.validateVehicleAvailability(dto.vehicleId, job);

    // 5. Validate driver with time-aware rules (skip for external/supplier drivers)
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
          externalDriverName: dto.externalDriverName ?? null,
          externalDriverPhone: dto.externalDriverPhone ?? null,
          remarks: dto.remarks ?? null,
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

      if (dto.driverId) {
        await tx.driverNotification.create({
          data: {
            driverId: dto.driverId,
            title: 'New Job Assigned',
            message: `${created.trafficJob.internalRef} - ${created.trafficJob.serviceType} on ${created.trafficJob.jobDate.toISOString().split('T')[0]}`,
            type: 'JOB_ASSIGNED',
            trafficJobId: dto.trafficJobId,
          },
        });
      }

      return created;
    });

    // Push notifications (fire-and-forget)
    if (assignment.driverId) {
      this.pushService.sendToDriver(
        assignment.driverId,
        'New Job Assigned',
        `${assignment.trafficJob.internalRef} - ${assignment.trafficJob.serviceType}`,
        { jobId: dto.trafficJobId, type: 'JOB_ASSIGNED' },
      ).catch(() => {});
    }
    if (assignment.repId) {
      this.pushService.sendToRep(
        assignment.repId,
        'New Job Assigned',
        `${assignment.trafficJob.internalRef} - ${assignment.trafficJob.serviceType}`,
        { jobId: dto.trafficJobId, type: 'JOB_ASSIGNED' },
      ).catch(() => {});
    }

    // Send driver assignment email if this job is linked to a guest booking
    if (assignment.driverId && assignment.driver) {
      this.sendDriverAssignmentEmail(
        assignment.trafficJob.id,
        assignment.driver,
        assignment.vehicle,
      ).catch((err) =>
        this.logger.error(`Failed to send driver assignment email: ${err.message}`),
      );
    }

    return assignment;
  }

  private async sendDriverAssignmentEmail(
    trafficJobId: string,
    driver: { name: string; phone?: string | null },
    vehicle: { plateNumber: string; color?: string | null; vehicleType?: { name: string } | null },
  ) {
    const guestBooking = await this.prisma.guestBooking.findFirst({
      where: { trafficJobId },
    });

    if (!guestBooking) return;

    await this.emailService.sendDriverAssignment({
      bookingRef: guestBooking.bookingRef,
      guestName: guestBooking.guestName,
      guestEmail: guestBooking.guestEmail,
      driverName: driver.name,
      driverPhone: driver.phone ?? '',
      vehiclePlate: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType?.name ?? '',
      vehicleColor: vehicle.color ?? undefined,
    });
  }

  // ─────────────────────────────────────────────
  // REASSIGN JOB
  // ─────────────────────────────────────────────

  async reassignJob(assignmentId: string, dto: ReassignJobDto, userId: string, userRole?: string, roleSlug?: string) {
    if (!dto.vehicleId && !dto.driverId && !dto.repId
        && dto.externalDriverName === undefined && dto.externalDriverPhone === undefined
        && dto.remarks === undefined) {
      throw new BadRequestException(
        'At least one field must be provided',
      );
    }

    const existing = await this.prisma.trafficAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        trafficJob: { include: { flight: true, originAirport: true, originZone: true, originHotel: true, destinationAirport: true, destinationZone: true, destinationHotel: true } },
        vehicle: { include: { vehicleType: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Assignment with ID "${assignmentId}" not found`,
      );
    }

    const job = existing.trafficJob;

    // Dispatcher 48-hour lock (skip if job was explicitly unlocked)
    this.checkDispatcherTimelock(job.jobDate, userRole, roleSlug, job.dispatchUnlockedAt);

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

      await this.validateVehicleAvailability(dto.vehicleId, job, assignmentId);
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
    if (dto.externalDriverName !== undefined) updateData.externalDriverName = dto.externalDriverName || null;
    if (dto.externalDriverPhone !== undefined) updateData.externalDriverPhone = dto.externalDriverPhone || null;
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;

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

      if (dto.driverId && dto.driverId !== existing.driverId) {
        await tx.driverNotification.create({
          data: {
            driverId: dto.driverId,
            title: 'New Job Assigned',
            message: `${result.trafficJob.internalRef} - ${result.trafficJob.serviceType} on ${result.trafficJob.jobDate.toISOString().split('T')[0]}`,
            type: 'JOB_ASSIGNED',
            trafficJobId: result.trafficJobId,
          },
        });
      }

      return result;
    });

    // Push notifications (fire-and-forget)
    if (dto.driverId && dto.driverId !== existing.driverId) {
      this.pushService.sendToDriver(
        dto.driverId,
        'New Job Assigned',
        `${updated.trafficJob.internalRef} - ${updated.trafficJob.serviceType}`,
        { jobId: updated.trafficJobId, type: 'JOB_ASSIGNED' },
      ).catch(() => {});
    }
    if (dto.repId && dto.repId !== existing.repId) {
      this.pushService.sendToRep(
        dto.repId,
        'New Job Assigned',
        `${updated.trafficJob.internalRef} - ${updated.trafficJob.serviceType}`,
        { jobId: updated.trafficJobId, type: 'JOB_ASSIGNED' },
      ).catch(() => {});
    }

    return updated;
  }

  // ─────────────────────────────────────────────
  // UNASSIGN JOB
  // ─────────────────────────────────────────────

  async unassignJob(assignmentId: string, userRole?: string, roleSlug?: string) {
    const assignment = await this.prisma.trafficAssignment.findUnique({
      where: { id: assignmentId },
      include: { trafficJob: true },
    });

    if (!assignment) {
      throw new NotFoundException(
        `Assignment with ID "${assignmentId}" not found`,
      );
    }

    // Dispatcher 48-hour lock (skip if job was explicitly unlocked)
    this.checkDispatcherTimelock(assignment.trafficJob.jobDate, userRole, roleSlug, assignment.trafficJob.dispatchUnlockedAt);

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

  async getAvailableVehicles(date: string, supplierId?: string) {
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
        ...(supplierId ? { supplierId } : {}),
        ...(busyVehicleIds.length > 0 && {
          id: { notIn: busyVehicleIds },
        }),
      },
      include: { vehicleType: true, supplier: { select: { id: true, legalName: true, tradeName: true } } },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async getAvailableSuppliers() {
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        vehicles: {
          some: {
            deletedAt: null,
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        _count: {
          select: {
            vehicles: {
              where: { deletedAt: null, isActive: true },
            },
          },
        },
      },
      orderBy: { legalName: 'asc' },
    });

    return suppliers.map((s) => ({
      id: s.id,
      legalName: s.legalName,
      tradeName: s.tradeName,
      vehicleCount: s._count.vehicles,
    }));
  }

  /**
   * Returns all active drivers, optionally filtered by supplier.
   * No time-based restrictions — drivers can be freely assigned.
   */
  async getAvailableDrivers(date: string, jobId?: string, supplierId?: string) {
    const supplierFilter = supplierId === 'owned'
      ? { supplierId: null }
      : supplierId
        ? { supplierId }
        : {};

    return this.prisma.driver.findMany({
      where: { deletedAt: null, isActive: true, ...supplierFilter },
      include: { supplier: { select: { id: true, legalName: true, tradeName: true } } },
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

  // ─────────────────────────────────────────────
  // UNLOCK / LOCK JOB (48-hour override)
  // ─────────────────────────────────────────────

  async unlockJob(jobId: string, userId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Traffic job with ID "${jobId}" not found`);
    }
    return this.prisma.trafficJob.update({
      where: { id: jobId },
      data: {
        dispatchUnlockedAt: new Date(),
        dispatchUnlockedById: userId,
      },
    });
  }

  async lockJob(jobId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: jobId, deletedAt: null },
    });
    if (!job) {
      throw new NotFoundException(`Traffic job with ID "${jobId}" not found`);
    }
    return this.prisma.trafficJob.update({
      where: { id: jobId },
      data: {
        dispatchUnlockedAt: null,
        dispatchUnlockedById: null,
      },
    });
  }

  /**
   * Dispatchers cannot modify assignments after 48 hours from the service date,
   * unless the job has been explicitly unlocked by an authorized user.
   * Admins and Managers bypass this restriction.
   */
  private checkDispatcherTimelock(
    jobDate: Date,
    userRole?: string,
    roleSlug?: string,
    dispatchUnlockedAt?: Date | null,
  ) {
    const isDispatcher =
      userRole === 'DISPATCHER' || roleSlug === 'dispatcher';
    if (!isDispatcher) return;

    // Skip if job was explicitly unlocked
    if (dispatchUnlockedAt) return;

    const cutoff = new Date(jobDate.getTime() + FORTY_EIGHT_HOURS_MS);
    if (new Date() > cutoff) {
      throw new ForbiddenException(
        'Dispatchers cannot modify assignments more than 48 hours after the service date.',
      );
    }
  }

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

  // Vehicle availability — no time restrictions, free assignment allowed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async validateVehicleAvailability(
    _vehicleId: string,
    _job: Record<string, unknown>,
    _excludeAssignmentId?: string,
  ) {
    return;
  }

  // Driver availability — no time restrictions, free assignment allowed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async validateDriverAvailability(
    _driverId: string,
    _job: Record<string, unknown>,
    _excludeAssignmentId?: string,
  ) {
    return;
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
