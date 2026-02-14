import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { GuestBookingQueryDto } from './dto/guest-booking-query.dto.js';
import { PaginatedResponse } from '../common/dto/api-response.dto.js';
import type {
  ServiceType,
  BookingChannel,
  GuestBookingStatus,
  B2CPaymentStatus,
} from '../../generated/prisma/enums.js';

@Injectable()
export class GuestBookingsService {
  private readonly logger = new Logger(GuestBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private readonly bookingInclude = {
    fromZone: { include: { city: true } },
    toZone: { include: { city: true } },
    hotel: true,
    originAirport: true,
    destinationAirport: true,
    vehicleType: true,
    paymentTransactions: true,
  };

  async findAll(query: GuestBookingQueryDto) {
    const { page = 1, limit = 20, bookingStatus, paymentStatus, dateFrom, dateTo, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (bookingStatus) {
      where.bookingStatus = bookingStatus as GuestBookingStatus;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus as B2CPaymentStatus;
    }

    if (dateFrom || dateTo) {
      const jobDateFilter: Record<string, Date> = {};
      if (dateFrom) {
        jobDateFilter.gte = new Date(dateFrom);
      }
      if (dateTo) {
        jobDateFilter.lte = new Date(dateTo);
      }
      where.jobDate = jobDateFilter;
    }

    if (search) {
      where.OR = [
        { guestName: { contains: search, mode: 'insensitive' } },
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { bookingRef: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.guestBooking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.bookingInclude,
      }),
      this.prisma.guestBooking.count({ where }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { id },
      include: {
        ...this.bookingInclude,
        _count: { select: { paymentTransactions: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Guest booking with ID "${id}" not found`);
    }

    return booking;
  }

  async convertToJob(id: string, userId: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { id },
      include: this.bookingInclude,
    });

    if (!booking) {
      throw new NotFoundException(`Guest booking with ID "${id}" not found`);
    }

    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot convert booking with status "${booking.bookingStatus}". Only CONFIRMED bookings can be converted.`,
      );
    }

    if (booking.paymentMethod === 'ONLINE' && booking.paymentStatus !== 'PAID') {
      throw new BadRequestException(
        `Cannot convert online-payment booking with payment status "${booking.paymentStatus}". Payment must be PAID first.`,
      );
    }

    // Generate internalRef using the same pattern as traffic-jobs service
    const internalRef = await this.generateInternalRef();

    return this.prisma.$transaction(async (tx) => {
      // Determine origin/destination based on service type
      // For ARR: origin is airport, destination is hotel/zone
      // For DEP: origin is hotel/zone, destination is airport
      let originAirportId: string | null = null;
      let destinationAirportId: string | null = null;
      let originZoneId: string | null = null;
      let destinationZoneId: string | null = null;
      let originHotelId: string | null = null;
      let destinationHotelId: string | null = null;

      if (booking.serviceType === 'ARR') {
        originAirportId = booking.originAirportId;
        destinationZoneId = booking.toZoneId;
        destinationHotelId = booking.hotelId;
      } else if (booking.serviceType === 'DEP') {
        destinationAirportId = booking.destinationAirportId;
        originZoneId = booking.fromZoneId;
        originHotelId = booking.hotelId;
      } else {
        // For other service types, map directly
        originAirportId = booking.originAirportId;
        destinationAirportId = booking.destinationAirportId;
        originZoneId = booking.originAirportId ? null : booking.fromZoneId;
        destinationZoneId = booking.destinationAirportId ? null : booking.toZoneId;
        originHotelId = booking.hotelId;
      }

      // Parse extras for seats/wheelchair
      const extras = (booking.extras as Record<string, unknown>) || {};

      const job = await tx.trafficJob.create({
        data: {
          internalRef,
          bookingChannel: 'ONLINE' as BookingChannel,
          serviceType: booking.serviceType as ServiceType,
          jobDate: booking.jobDate,
          adultCount: booking.paxCount,
          childCount: 0,
          paxCount: booking.paxCount,
          originAirportId,
          originZoneId,
          originHotelId,
          destinationAirportId,
          destinationZoneId,
          destinationHotelId,
          fromZoneId: booking.fromZoneId,
          toZoneId: booking.toZoneId,
          clientName: booking.guestName,
          clientMobile: booking.guestPhone,
          boosterSeat: !!extras.boosterSeat,
          boosterSeatQty: (extras.boosterSeatQty as number) || 0,
          babySeat: !!extras.babySeat,
          babySeatQty: (extras.babySeatQty as number) || 0,
          wheelChair: !!extras.wheelChair,
          wheelChairQty: (extras.wheelChairQty as number) || 0,
          pickUpTime: booking.pickupTime,
          notes: booking.notes,
          status: 'PENDING',
          createdById: userId,
        },
      });

      // Create TrafficFlight if flightNo is provided
      if (booking.flightNo) {
        await tx.trafficFlight.create({
          data: {
            trafficJobId: job.id,
            flightNo: booking.flightNo,
            carrier: booking.carrier,
            terminal: booking.terminal,
          },
        });
      }

      // Update GuestBooking: mark as CONVERTED and link to the new traffic job
      await tx.guestBooking.update({
        where: { id },
        data: {
          bookingStatus: 'CONVERTED' as GuestBookingStatus,
          trafficJobId: job.id,
        },
      });

      // Return the full job with relations
      return tx.trafficJob.findUniqueOrThrow({
        where: { id: job.id },
        include: {
          originAirport: true,
          originZone: true,
          originHotel: true,
          destinationAirport: true,
          destinationZone: true,
          destinationHotel: true,
          fromZone: true,
          toZone: true,
          flight: true,
          createdBy: { select: { id: true, name: true } },
        },
      });
    });
  }

  async cancelBooking(id: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException(`Guest booking with ID "${id}" not found`);
    }

    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot cancel booking with status "${booking.bookingStatus}". Only CONFIRMED bookings can be cancelled.`,
      );
    }

    const updated = await this.prisma.guestBooking.update({
      where: { id },
      data: {
        bookingStatus: 'CANCELLED' as GuestBookingStatus,
      },
      include: this.bookingInclude,
    });

    const refundNeeded = booking.paymentStatus === 'PAID';

    // Send cancellation email (fire-and-forget)
    this.emailService
      .sendBookingCancellation({
        bookingRef: updated.bookingRef,
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        serviceType: updated.serviceType,
        jobDate: updated.jobDate.toISOString().split('T')[0],
        pickupTime: updated.pickupTime
          ? updated.pickupTime.toISOString().slice(11, 16)
          : undefined,
        fromZone: updated.fromZone?.name ?? '',
        toZone: updated.toZone?.name ?? '',
        hotel: updated.hotel?.name,
        paxCount: updated.paxCount,
        vehicleType: updated.vehicleType?.name ?? '',
        total: Number(updated.total),
        currency: updated.currency,
        paymentMethod: updated.paymentMethod,
      })
      .catch((err) =>
        this.logger.error(`Failed to send cancellation email: ${err.message}`),
      );

    return {
      booking: updated,
      message: refundNeeded
        ? 'Booking cancelled. Payment was already received - a manual refund may be required.'
        : 'Booking cancelled successfully.',
      refundNeeded,
    };
  }

  private async generateInternalRef(): Promise<string> {
    const prefix = 'ITT';

    // Use the same pattern as traffic-jobs service: ITT-NNNN sequential
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
}
