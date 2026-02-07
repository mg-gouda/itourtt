import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JobFilterDto } from './dto/job-filter.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
    flight: true,
    createdBy: { select: { id: true, name: true } },
    assignment: {
      include: {
        vehicle: true,
        driver: true,
        rep: true,
      },
    },
  };

  async findAll(filter: JobFilterDto) {
    const { page = 1, limit = 20, date, status, agentId, serviceType, bookingChannel } = filter;
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

    const childCount = dto.childCount ?? 0;
    const paxCount = dto.adultCount + childCount;

    // Auto-resolve zones for pricing
    const fromZoneId = await this.resolveZoneFromFKs(dto.originAirportId, dto.originZoneId, dto.originHotelId);
    const toZoneId = await this.resolveZoneFromFKs(dto.destinationAirportId, dto.destinationZoneId, dto.destinationHotelId);

    const internalRef = await this.generateInternalRef();

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.trafficJob.create({
        data: {
          internalRef,
          bookingChannel: dto.bookingChannel,
          agentId: dto.bookingChannel === 'ONLINE' ? dto.agentId! : null,
          agentRef: dto.agentRef,
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
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
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

    return this.prisma.$transaction(async (tx) => {
      const updatedJob = await tx.trafficJob.update({
        where: { id },
        data: { status: newStatus },
        include: this.jobInclude,
      });

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

  private async generateInternalRef(): Promise<string> {
    const prefix = 'ITT';

    // Find all refs matching the new format ITT-NNNN (exactly one dash + digits)
    const jobs = await this.prisma.$queryRawUnsafe<{ internal_ref: string }[]>(
      `SELECT internal_ref FROM traffic_jobs WHERE internal_ref ~ '^ITT-[0-9]+$' ORDER BY internal_ref DESC LIMIT 1`,
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
}
