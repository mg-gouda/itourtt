import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobFilterDto } from './dto/job-filter.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WhatsappNotificationsService } from '../whatsapp-notifications/whatsapp-notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';

type JobStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

@Injectable()
export class TrafficJobsService {
  private readonly logger = new Logger(TrafficJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly whatsappService: WhatsappNotificationsService,
    private readonly settingsService: SettingsService,
  ) {}

  private readonly jobInclude = {
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
  };

  async findAll(filter: JobFilterDto) {
    const { page = 1, limit = 20, date, status, agentId, serviceType, bookingChannel, search } = filter;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (date) {
      where.jobDate = new Date(date);
    }
    if (status) {
      where.status = status;
    }
    if (agentId) {
      where.agentId = agentId;
    }
    if (serviceType) {
      where.serviceType = serviceType;
    }
    if (bookingChannel) {
      where.bookingChannel = bookingChannel;
    }
    if (search) {
      where.OR = [
        { internalRef: { contains: search, mode: 'insensitive' } },
        { agentRef: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { agent: { legalName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.trafficJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.jobInclude,
      }),
      this.prisma.trafficJob.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id, deletedAt: null },
      include: this.jobInclude,
    });

    if (!job) {
      throw new NotFoundException(`Traffic job with ID "${id}" not found`);
    }

    return job;
  }

  async create(dto: CreateJobDto, userId: string) {
    // Validate channel requirements
    if (dto.bookingChannel === 'ONLINE') {
      if (!dto.agentId) throw new BadRequestException('Agent is required for Online bookings');
      if (!dto.agentRef) throw new BadRequestException('Agent Ref is required for Online bookings');

      // Validate agentRef against agent's refPattern
      const agent = await this.prisma.agent.findUnique({
        where: { id: dto.agentId },
        select: { refPattern: true, refExample: true },
      });
      if (agent?.refPattern) {
        try {
          const regex = new RegExp(agent.refPattern);
          if (!regex.test(dto.agentRef)) {
            const hint = agent.refExample ? ` (expected: ${agent.refExample})` : '';
            throw new BadRequestException(`Agent reference format invalid${hint}`);
          }
        } catch (e) {
          if (e instanceof BadRequestException) throw e;
        }
      }

      // Check agentRef uniqueness
      const existing = await this.prisma.trafficJob.findFirst({
        where: { agentRef: dto.agentRef, deletedAt: null },
        select: { id: true, internalRef: true },
      });
      if (existing) {
        throw new BadRequestException(`Agent reference "${dto.agentRef}" is already used by job ${existing.internalRef}`);
      }
    } else {
      if (!dto.customerId) throw new BadRequestException('Customer is required for B2B bookings');
    }

    // Validate exactly one origin FK is set
    const originCount = [dto.originAirportId, dto.originZoneId, dto.originHotelId].filter(Boolean).length;
    if (originCount !== 1) {
      throw new BadRequestException('Exactly one origin (airport, zone, or hotel) must be provided');
    }

    // Validate exactly one destination FK is set
    const destCount = [dto.destinationAirportId, dto.destinationZoneId, dto.destinationHotelId].filter(Boolean).length;
    if (destCount !== 1) {
      throw new BadRequestException('Exactly one destination (airport, zone, or hotel) must be provided');
    }

    // Validate customerJobId uniqueness
    if (dto.customerJobId) {
      const existing = await this.prisma.trafficJob.findFirst({
        where: { customerJobId: dto.customerJobId, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(`Customer Job ID "${dto.customerJobId}" is already in use`);
      }
    }

    const childCount = dto.childCount ?? 0;
    const paxCount = dto.adultCount + childCount;

    // Auto-resolve zones for pricing
    const fromZoneId = await this.resolveZoneFromFKs(dto.originAirportId, dto.originZoneId, dto.originHotelId);
    const toZoneId = await this.resolveZoneFromFKs(dto.destinationAirportId, dto.destinationZoneId, dto.destinationHotelId);

    const internalRef = await this.generateInternalRef();

    const result = await this.prisma.$transaction(async (tx) => {
      const job = await tx.trafficJob.create({
        data: {
          internalRef,
          bookingChannel: dto.bookingChannel,
          agentId: dto.bookingChannel === 'ONLINE' ? dto.agentId! : null,
          agentRef: dto.agentRef,
          customerJobId: dto.customerJobId ?? null,
          customerId: dto.bookingChannel === 'B2B' ? dto.customerId! : null,
          serviceType: dto.serviceType as any,
          jobDate: new Date(dto.jobDate),
          adultCount: dto.adultCount,
          childCount,
          paxCount,
          originAirportId: dto.originAirportId ?? null,
          originZoneId: dto.originZoneId ?? null,
          originHotelId: dto.originHotelId ?? null,
          destinationAirportId: dto.destinationAirportId ?? null,
          destinationZoneId: dto.destinationZoneId ?? null,
          destinationHotelId: dto.destinationHotelId ?? null,
          fromZoneId,
          toZoneId,
          clientName: dto.clientName,
          clientMobile: dto.clientMobile,
          boosterSeat: dto.boosterSeat ?? false,
          boosterSeatQty: dto.boosterSeatQty ?? 0,
          babySeat: dto.babySeat ?? false,
          babySeatQty: dto.babySeatQty ?? 0,
          wheelChair: dto.wheelChair ?? false,
          wheelChairQty: dto.wheelChairQty ?? 0,
          printSign: dto.printSign ?? false,
          pickUpTime: dto.pickUpTime ? new Date(dto.pickUpTime) : null,
          notes: dto.notes,
          collectionRequired: dto.collectionRequired ?? false,
          collectionAmount: dto.collectionRequired ? dto.collectionAmount : null,
          collectionCurrency: dto.collectionRequired ? (dto.collectionCurrency as any || 'EGP') : 'EGP',
          transferPrice: dto.transferPrice ?? null,
          transferPriceCurrency: dto.transferPriceCurrency as any ?? 'EGP',
          requestedVehicleTypeId: dto.requestedVehicleTypeId ?? null,
          priceAmount: dto.priceAmount ?? null,
          priceCurrency: dto.priceCurrency as any ?? 'EGP',
          custRepName: dto.custRepName ?? null,
          custRepMobile: dto.custRepMobile ?? null,
          custRepMeetingPoint: dto.custRepMeetingPoint ?? null,
          custRepMeetingTime: dto.custRepMeetingTime ? new Date(dto.custRepMeetingTime) : null,
          createdById: userId,
        },
        include: this.jobInclude,
      });

      if (dto.flight) {
        await tx.trafficFlight.create({
          data: {
            trafficJobId: job.id,
            flightNo: dto.flight.flightNo,
            carrier: dto.flight.carrier,
            terminal: dto.flight.terminal,
            arrivalTime: dto.flight.arrivalTime ? new Date(dto.flight.arrivalTime) : undefined,
            departureTime: dto.flight.departureTime ? new Date(dto.flight.departureTime) : undefined,
          },
        });
        return tx.trafficJob.findUniqueOrThrow({
          where: { id: job.id },
          include: this.jobInclude,
        });
      }

      return job;
    });

    // WhatsApp booking confirmation (fire-and-forget, after transaction commits)
    this.whatsappService.triggerJobCreated(result.id).catch(() => {});

    return result;
  }

  async update(id: string, dto: UpdateJobDto, userId: string, userRole?: string) {
    const job = await this.findOne(id);

    // 1-week edit lock: blocks editing 7 days after the service date
    // Admin and Manager roles bypass this lock
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      const oneWeekAfterService = new Date(job.jobDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() > oneWeekAfterService && !job.editUnlockedAt) {
        throw new ForbiddenException('Job is locked after 1 week from the service date and cannot be edited');
      }
    }

    // Check agentRef uniqueness on update (if changed)
    if (dto.agentRef !== undefined && dto.agentRef !== job.agentRef && dto.agentRef) {
      const duplicate = await this.prisma.trafficJob.findFirst({
        where: { agentRef: dto.agentRef, deletedAt: null, id: { not: id } },
        select: { id: true, internalRef: true },
      });
      if (duplicate) {
        throw new BadRequestException(`Agent reference "${dto.agentRef}" is already used by job ${duplicate.internalRef}`);
      }
    }

    // Validate origin if any origin field is provided
    const hasOriginUpdate = dto.originAirportId !== undefined || dto.originZoneId !== undefined || dto.originHotelId !== undefined;
    if (hasOriginUpdate) {
      const originCount = [dto.originAirportId, dto.originZoneId, dto.originHotelId].filter(Boolean).length;
      if (originCount !== 1) {
        throw new BadRequestException('Exactly one origin (airport, zone, or hotel) must be provided');
      }
    }

    // Validate destination if any destination field is provided
    const hasDestUpdate = dto.destinationAirportId !== undefined || dto.destinationZoneId !== undefined || dto.destinationHotelId !== undefined;
    if (hasDestUpdate) {
      const destCount = [dto.destinationAirportId, dto.destinationZoneId, dto.destinationHotelId].filter(Boolean).length;
      if (destCount !== 1) {
        throw new BadRequestException('Exactly one destination (airport, zone, or hotel) must be provided');
      }
    }

    // Resolve zones if locations changed
    const originAirportId = hasOriginUpdate ? (dto.originAirportId ?? null) : job.originAirportId;
    const originZoneId = hasOriginUpdate ? (dto.originZoneId ?? null) : job.originZoneId;
    const originHotelId = hasOriginUpdate ? (dto.originHotelId ?? null) : job.originHotelId;
    const destAirportId = hasDestUpdate ? (dto.destinationAirportId ?? null) : job.destinationAirportId;
    const destZoneId = hasDestUpdate ? (dto.destinationZoneId ?? null) : job.destinationZoneId;
    const destHotelId = hasDestUpdate ? (dto.destinationHotelId ?? null) : job.destinationHotelId;

    const fromZoneId = (hasOriginUpdate)
      ? await this.resolveZoneFromFKs(originAirportId, originZoneId, originHotelId)
      : undefined;
    const toZoneId = (hasDestUpdate)
      ? await this.resolveZoneFromFKs(destAirportId, destZoneId, destHotelId)
      : undefined;

    // Validate customerJobId uniqueness on update
    if (dto.customerJobId && dto.customerJobId !== job.customerJobId) {
      const existing = await this.prisma.trafficJob.findFirst({
        where: { customerJobId: dto.customerJobId, deletedAt: null, id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(`Customer Job ID "${dto.customerJobId}" is already in use`);
      }
    }

    // Recalculate pax if counts changed
    const adultCount = dto.adultCount ?? job.adultCount;
    const childCount = dto.childCount ?? job.childCount;
    const paxCount = adultCount + childCount;

    // Auto-set bookingStatus to UPDATED if not explicitly provided
    const bookingStatus = dto.bookingStatus ?? 'UPDATED';

    // Compute changed fields for notification
    const changedFields: string[] = [];
    if (dto.bookingStatus !== undefined && dto.bookingStatus !== job.bookingStatus) changedFields.push('bookingStatus');
    if (dto.agentId !== undefined && dto.agentId !== job.agentId) changedFields.push('agentId');
    if (dto.agentRef !== undefined && dto.agentRef !== job.agentRef) changedFields.push('agentRef');
    if (dto.customerJobId !== undefined && dto.customerJobId !== job.customerJobId) changedFields.push('customerJobId');
    if (dto.customerId !== undefined && dto.customerId !== job.customerId) changedFields.push('customerId');
    if (dto.serviceType !== undefined && dto.serviceType !== job.serviceType) changedFields.push('serviceType');
    if (dto.jobDate !== undefined && dto.jobDate !== job.jobDate.toISOString().split('T')[0]) changedFields.push('jobDate');
    if (dto.adultCount !== undefined && dto.adultCount !== job.adultCount) changedFields.push('adultCount');
    if (dto.childCount !== undefined && dto.childCount !== job.childCount) changedFields.push('childCount');
    if (dto.clientName !== undefined && dto.clientName !== job.clientName) changedFields.push('clientName');
    if (dto.clientMobile !== undefined && dto.clientMobile !== job.clientMobile) changedFields.push('clientMobile');
    if (dto.pickUpTime !== undefined) changedFields.push('pickUpTime');
    if (dto.notes !== undefined && dto.notes !== job.notes) changedFields.push('notes');
    if (dto.transferPrice !== undefined) changedFields.push('transferPrice');
    if (dto.transferPriceCurrency !== undefined) changedFields.push('transferPriceCurrency');
    if (dto.requestedVehicleTypeId !== undefined) changedFields.push('requestedVehicleTypeId');
    if (dto.priceAmount !== undefined) changedFields.push('priceAmount');
    if (dto.priceCurrency !== undefined) changedFields.push('priceCurrency');
    if (hasOriginUpdate) changedFields.push('originAirportId', 'originZoneId', 'originHotelId');
    if (hasDestUpdate) changedFields.push('destinationAirportId', 'destinationZoneId', 'destinationHotelId');
    if (dto.flight) changedFields.push('flight');

    const result = await this.prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {
        bookingStatus,
        adultCount,
        childCount,
        paxCount,
      };

      if (dto.agentId !== undefined) data.agentId = dto.agentId || null;
      if (dto.agentRef !== undefined) data.agentRef = dto.agentRef || null;
      if (dto.customerJobId !== undefined) data.customerJobId = dto.customerJobId || null;
      if (dto.customerId !== undefined) data.customerId = dto.customerId || null;
      if (dto.serviceType !== undefined) data.serviceType = dto.serviceType;
      if (dto.jobDate !== undefined) data.jobDate = new Date(dto.jobDate);
      if (dto.clientName !== undefined) data.clientName = dto.clientName;
      if (dto.clientMobile !== undefined) data.clientMobile = dto.clientMobile;
      if (dto.boosterSeat !== undefined) data.boosterSeat = dto.boosterSeat;
      if (dto.boosterSeatQty !== undefined) data.boosterSeatQty = dto.boosterSeatQty;
      if (dto.babySeat !== undefined) data.babySeat = dto.babySeat;
      if (dto.babySeatQty !== undefined) data.babySeatQty = dto.babySeatQty;
      if (dto.wheelChair !== undefined) data.wheelChair = dto.wheelChair;
      if (dto.wheelChairQty !== undefined) data.wheelChairQty = dto.wheelChairQty;
      if (dto.printSign !== undefined) data.printSign = dto.printSign;
      if (dto.pickUpTime !== undefined) data.pickUpTime = dto.pickUpTime ? new Date(dto.pickUpTime) : null;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.collectionRequired !== undefined) {
        data.collectionRequired = dto.collectionRequired;
        if (!dto.collectionRequired) {
          data.collectionAmount = null;
          data.collectionCollected = false;
          data.collectionCollectedAt = null;
        }
      }
      if (dto.collectionAmount !== undefined) data.collectionAmount = dto.collectionAmount;
      if (dto.collectionCurrency !== undefined) data.collectionCurrency = dto.collectionCurrency;
      if (dto.transferPrice !== undefined) data.transferPrice = dto.transferPrice ?? null;
      if (dto.transferPriceCurrency !== undefined) data.transferPriceCurrency = dto.transferPriceCurrency;
      if (dto.requestedVehicleTypeId !== undefined) data.requestedVehicleTypeId = dto.requestedVehicleTypeId || null;
      if (dto.priceAmount !== undefined) data.priceAmount = dto.priceAmount ?? null;
      if (dto.priceCurrency !== undefined) data.priceCurrency = dto.priceCurrency;
      if (dto.custRepName !== undefined) data.custRepName = dto.custRepName;
      if (dto.custRepMobile !== undefined) data.custRepMobile = dto.custRepMobile;
      if (dto.custRepMeetingPoint !== undefined) data.custRepMeetingPoint = dto.custRepMeetingPoint;
      if (dto.custRepMeetingTime !== undefined) data.custRepMeetingTime = dto.custRepMeetingTime ? new Date(dto.custRepMeetingTime) : null;

      if (hasOriginUpdate) {
        data.originAirportId = originAirportId;
        data.originZoneId = originZoneId;
        data.originHotelId = originHotelId;
      }
      if (hasDestUpdate) {
        data.destinationAirportId = destAirportId;
        data.destinationZoneId = destZoneId;
        data.destinationHotelId = destHotelId;
      }
      if (fromZoneId !== undefined) data.fromZoneId = fromZoneId;
      if (toZoneId !== undefined) data.toZoneId = toZoneId;

      const updatedJob = await tx.trafficJob.update({
        where: { id },
        data: data as any,
        include: this.jobInclude,
      });

      // Upsert flight record
      if (dto.flight) {
        await tx.trafficFlight.upsert({
          where: { trafficJobId: id },
          update: {
            flightNo: dto.flight.flightNo,
            carrier: dto.flight.carrier,
            terminal: dto.flight.terminal,
            arrivalTime: dto.flight.arrivalTime ? new Date(dto.flight.arrivalTime) : undefined,
            departureTime: dto.flight.departureTime ? new Date(dto.flight.departureTime) : undefined,
          },
          create: {
            trafficJobId: id,
            flightNo: dto.flight.flightNo,
            carrier: dto.flight.carrier,
            terminal: dto.flight.terminal,
            arrivalTime: dto.flight.arrivalTime ? new Date(dto.flight.arrivalTime) : undefined,
            departureTime: dto.flight.departureTime ? new Date(dto.flight.departureTime) : undefined,
          },
        });
        return tx.trafficJob.findUniqueOrThrow({
          where: { id },
          include: this.jobInclude,
        });
      }

      return updatedJob;
    });

    // Fire-and-forget notification
    this.notificationsService
      .notifyJobUpdate(id, userId, changedFields)
      .catch((err) => this.logger.error(`Failed to send update notifications: ${err.message}`));

    return result;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, userId?: string) {
    const job = await this.findOne(id);
    const currentStatus = job.status as JobStatus;
    const newStatus = dto.status as JobStatus;

    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${currentStatus}" to "${newStatus}". ` +
          `Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none'}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.trafficJob.update({
        where: { id },
        data: { status: newStatus },
        include: this.jobInclude,
      });

      // Sync portal statuses when dispatch sets a terminal status
      const terminalStatuses = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (terminalStatuses.includes(newStatus) && updatedJob.assignment) {
        await tx.trafficAssignment.update({
          where: { id: updatedJob.assignment.id },
          data: {
            driverStatus: newStatus as any,
            repStatus: newStatus as any,
          },
        });
      }

      // Auto-generate DriverTripFee when job is completed with driver + zones
      if (
        newStatus === 'COMPLETED' &&
        updatedJob.assignment?.driverId &&
        updatedJob.fromZoneId &&
        updatedJob.toZoneId
      ) {
        const driverId = updatedJob.assignment.driverId;
        const existingDriverFee = await tx.driverTripFee.findFirst({
          where: { driverId, trafficJobId: id },
        });
        if (!existingDriverFee) {
          await tx.driverTripFee.create({
            data: {
              driverId,
              trafficJobId: id,
              fromZoneId: updatedJob.fromZoneId,
              toZoneId: updatedJob.toZoneId,
              amount: 0,
              currency: 'EGP',
            },
          });
        }
      }

      // Auto-generate RepFee when an ARR job is completed with a rep assigned
      if (
        newStatus === 'COMPLETED' &&
        updatedJob.serviceType === 'ARR' &&
        updatedJob.assignment?.repId
      ) {
        const repId = updatedJob.assignment.repId;

        const rep = await tx.rep.findUniqueOrThrow({
          where: { id: repId },
        });

        // Idempotency: skip if RepFee already exists for this job+rep
        const existingFee = await tx.repFee.findFirst({
          where: { repId, trafficJobId: id },
        });

        if (!existingFee) {
          await tx.repFee.create({
            data: {
              repId,
              trafficJobId: id,
              amount: rep.feePerFlight,
              currency: 'EGP',
            },
          });
        }
      }

      return updatedJob;
    });

    // Fire-and-forget notification
    if (userId) {
      this.notificationsService
        .notifyJobUpdate(id, userId, ['status'])
        .catch((err) => this.logger.error(`Failed to send status update notifications: ${err.message}`));
    }

    return result;
  }

  async remove(id: string) {
    const job = await this.findOne(id);

    if (job.status === 'COMPLETED') {
      throw new BadRequestException('Cannot delete a completed traffic job');
    }

    return this.prisma.trafficJob.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Derive an abbreviation from the company name by taking the first letter
   * of each word, uppercased. e.g. "iTour TT" → "ITT", "Travel Plan" → "TP".
   */
  private deriveAbbreviation(companyName: string): string {
    const words = companyName.trim().split(/\s+/);
    return words.map((w) => w.charAt(0).toUpperCase()).join('');
  }

  private async generateInternalRef(): Promise<string> {
    const company = await this.settingsService.getCompanySettings();
    const prefix = this.deriveAbbreviation(company.companyName);

    // Find the highest existing sequence for this prefix (PREFIX-NNNN)
    const jobs = await this.prisma.$queryRawUnsafe<{ internal_ref: string }[]>(
      `SELECT internal_ref FROM traffic_jobs WHERE internal_ref ~ $1 ORDER BY internal_ref DESC LIMIT 1`,
      `^${prefix}-[0-9]+$`,
    );

    let nextSeq = 1;
    if (jobs.length > 0) {
      const parts = jobs[0].internal_ref.split('-');
      const lastSeq = parseInt(parts[1], 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    const seq = String(nextSeq).padStart(4, '0');
    return `${prefix}-${seq}`;
  }

  private async resolveZoneFromFKs(
    airportId?: string | null,
    zoneId?: string | null,
    hotelId?: string | null,
  ): Promise<string | null> {
    if (zoneId) return zoneId;
    if (hotelId) {
      const hotel = await this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { zoneId: true },
      });
      return hotel?.zoneId ?? null;
    }
    // AIRPORT - no single zone mapping
    return null;
  }

  async bulkCreate(
    jobs: CreateJobDto[],
    userId: string,
  ): Promise<{ created: number; errors: { index: number; message: string }[] }> {
    const results = { created: 0, errors: [] as { index: number; message: string }[] };

    for (let i = 0; i < jobs.length; i++) {
      try {
        await this.create(jobs[i], userId);
        results.created++;
      } catch (error: any) {
        results.errors.push({ index: i, message: error.message || 'Unknown error' });
      }
    }

    return results;
  }
}
