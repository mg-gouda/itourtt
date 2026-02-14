import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { QuoteRequestDto } from './dto/quote-request.dto.js';
import { CreateGuestBookingDto } from './dto/create-guest-booking.dto.js';
import {
  ServiceType,
  B2CPaymentMethod,
  B2CPaymentGateway,
  B2CPaymentStatus,
  GuestBookingStatus,
} from '../../generated/prisma/enums.js';

@Injectable()
export class PublicApiService {
  private readonly logger = new Logger(PublicApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Location Tree ──────────────────────────────────────

  async getLocationTree() {
    const countries = await this.prisma.country.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        airports: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: {
            cities: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
              include: {
                zones: {
                  where: { deletedAt: null },
                  orderBy: { name: 'asc' },
                  include: {
                    hotels: {
                      where: { deletedAt: null },
                      orderBy: { name: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Transform Prisma nested structure into { id, name, type, children } tree
    return countries.map((country) => ({
      id: country.id,
      name: country.name,
      type: 'COUNTRY',
      children: (country.airports || []).map((airport) => ({
        id: airport.id,
        name: airport.name,
        type: 'AIRPORT',
        children: (airport.cities || []).map((city) => ({
          id: city.id,
          name: city.name,
          type: 'CITY',
          children: (city.zones || []).map((zone) => ({
            id: zone.id,
            name: zone.name,
            type: 'ZONE',
            children: (zone.hotels || []).map((hotel) => ({
              id: hotel.id,
              name: hotel.name,
              type: 'HOTEL',
            })),
          })),
        })),
      })),
    }));
  }

  // ─── Vehicle Types ──────────────────────────────────────

  async getVehicleTypes() {
    const types = await this.prisma.vehicleType.findMany({
      orderBy: { name: 'asc' },
    });
    return types.map((vt) => ({
      id: vt.id,
      name: vt.name,
      seatCapacity: vt.seatCapacity,
      capacity: vt.seatCapacity,
    }));
  }

  // ─── Quote ──────────────────────────────────────────────

  async getQuote(dto: QuoteRequestDto) {
    const priceItem = await this.prisma.publicPriceItem.findFirst({
      where: {
        serviceType: dto.serviceType as ServiceType,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
      },
      include: {
        vehicleType: true,
      },
    });

    if (!priceItem) {
      throw new NotFoundException(
        'No pricing found for this route and vehicle type combination.',
      );
    }

    // Check pax count against vehicle capacity
    if (dto.paxCount > priceItem.vehicleType.seatCapacity) {
      throw new BadRequestException(
        `Pax count (${dto.paxCount}) exceeds vehicle capacity (${priceItem.vehicleType.seatCapacity}).`,
      );
    }

    const basePrice = Number(priceItem.price);
    const driverTip = Number(priceItem.driverTip);

    // Calculate extras
    let extrasTotal = 0;
    const extrasBreakdown: Record<string, number> = {};

    if (dto.extras?.boosterSeatQty && dto.extras.boosterSeatQty > 0) {
      const cost = dto.extras.boosterSeatQty * Number(priceItem.boosterSeatPrice);
      extrasTotal += cost;
      extrasBreakdown.boosterSeat = cost;
    }

    if (dto.extras?.babySeatQty && dto.extras.babySeatQty > 0) {
      const cost = dto.extras.babySeatQty * Number(priceItem.babySeatPrice);
      extrasTotal += cost;
      extrasBreakdown.babySeat = cost;
    }

    if (dto.extras?.wheelChairQty && dto.extras.wheelChairQty > 0) {
      const cost = dto.extras.wheelChairQty * Number(priceItem.wheelChairPrice);
      extrasTotal += cost;
      extrasBreakdown.wheelChair = cost;
    }

    const subtotal = basePrice + driverTip + extrasTotal;
    const taxRate = 0; // Tax applied at invoice level per Egyptian law if needed
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return {
      basePrice,
      driverTip,
      extras: extrasBreakdown,
      extrasTotal,
      subtotal,
      taxRate,
      taxAmount,
      total,
      currency: priceItem.currency,
      vehicleType: priceItem.vehicleType.name,
      seatCapacity: priceItem.vehicleType.seatCapacity,
    };
  }

  // ─── Create Booking ─────────────────────────────────────

  async createBooking(dto: CreateGuestBookingDto) {
    // Look up pricing
    const priceItem = await this.prisma.publicPriceItem.findFirst({
      where: {
        serviceType: dto.serviceType as ServiceType,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleTypeId: dto.vehicleTypeId,
      },
      include: {
        vehicleType: true,
      },
    });

    if (!priceItem) {
      throw new NotFoundException(
        'No pricing found for this route and vehicle type combination.',
      );
    }

    // Validate pax count
    if (dto.paxCount > priceItem.vehicleType.seatCapacity) {
      throw new BadRequestException(
        `Pax count (${dto.paxCount}) exceeds vehicle capacity (${priceItem.vehicleType.seatCapacity}).`,
      );
    }

    // Calculate totals
    const basePrice = Number(priceItem.price);
    const driverTip = Number(priceItem.driverTip);
    let extrasTotal = 0;

    if (dto.extras?.boosterSeatQty && dto.extras.boosterSeatQty > 0) {
      extrasTotal += dto.extras.boosterSeatQty * Number(priceItem.boosterSeatPrice);
    }
    if (dto.extras?.babySeatQty && dto.extras.babySeatQty > 0) {
      extrasTotal += dto.extras.babySeatQty * Number(priceItem.babySeatPrice);
    }
    if (dto.extras?.wheelChairQty && dto.extras.wheelChairQty > 0) {
      extrasTotal += dto.extras.wheelChairQty * Number(priceItem.wheelChairPrice);
    }

    const subtotal = basePrice + driverTip + extrasTotal;
    const taxAmount = 0;
    const total = subtotal + taxAmount;

    // Generate booking reference: GB-YYMMDD-XXXX
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const bookingRef = `GB-${yy}${mm}${dd}-${randomPart}`;

    const paymentMethod = dto.paymentMethod as B2CPaymentMethod;
    const isOnline = paymentMethod === B2CPaymentMethod.ONLINE;

    const booking = await this.prisma.guestBooking.create({
      data: {
        bookingRef,
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        guestCountry: dto.guestCountry,
        serviceType: dto.serviceType as ServiceType,
        jobDate: new Date(dto.jobDate),
        pickupTime: dto.pickupTime ? new Date(dto.pickupTime) : null,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        hotelId: dto.hotelId,
        originAirportId: dto.originAirportId,
        destinationAirportId: dto.destinationAirportId,
        flightNo: dto.flightNo,
        carrier: dto.carrier,
        terminal: dto.terminal,
        paxCount: dto.paxCount,
        vehicleTypeId: dto.vehicleTypeId,
        extras: dto.extras ? (dto.extras as object) : undefined,
        notes: dto.notes,
        subtotal,
        taxAmount,
        total,
        currency: priceItem.currency,
        paymentMethod,
        paymentStatus: isOnline
          ? B2CPaymentStatus.PENDING as B2CPaymentStatus
          : B2CPaymentStatus.PENDING as B2CPaymentStatus,
        paymentGateway: dto.paymentGateway
          ? (dto.paymentGateway as B2CPaymentGateway)
          : null,
        bookingStatus: isOnline
          ? GuestBookingStatus.CONFIRMED as GuestBookingStatus
          : GuestBookingStatus.CONFIRMED as GuestBookingStatus,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
        hotel: true,
        originAirport: true,
        destinationAirport: true,
      },
    });

    // Send booking confirmation email (fire-and-forget)
    this.emailService
      .sendBookingConfirmation({
        bookingRef: booking.bookingRef,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        serviceType: booking.serviceType,
        jobDate: booking.jobDate.toISOString().split('T')[0],
        pickupTime: booking.pickupTime
          ? booking.pickupTime.toISOString().slice(11, 16)
          : undefined,
        fromZone: booking.fromZone?.name ?? '',
        toZone: booking.toZone?.name ?? '',
        hotel: booking.hotel?.name,
        flightNo: booking.flightNo ?? undefined,
        paxCount: booking.paxCount,
        vehicleType: booking.vehicleType?.name ?? '',
        total,
        currency: priceItem.currency,
        paymentMethod: dto.paymentMethod,
      })
      .catch((err) =>
        this.logger.error(`Failed to send confirmation email: ${err.message}`),
      );

    return {
      bookingRef: booking.bookingRef,
      booking,
      paymentRequired: isOnline,
    };
  }

  // ─── Get Booking ────────────────────────────────────────

  async getBooking(ref: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef: ref },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
        hotel: true,
        originAirport: true,
        destinationAirport: true,
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with reference "${ref}" not found.`);
    }

    return booking;
  }

  // ─── Cancel Booking ─────────────────────────────────────

  async cancelBooking(ref: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef: ref },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with reference "${ref}" not found.`);
    }

    if (booking.bookingStatus === GuestBookingStatus.CONVERTED) {
      throw new BadRequestException(
        'Cannot cancel a booking that has already been converted to a traffic job.',
      );
    }

    if (booking.bookingStatus === GuestBookingStatus.CANCELLED) {
      throw new BadRequestException('This booking is already cancelled.');
    }

    const updated = await this.prisma.guestBooking.update({
      where: { bookingRef: ref },
      data: {
        bookingStatus: GuestBookingStatus.CANCELLED as GuestBookingStatus,
      },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
        hotel: true,
        originAirport: true,
        destinationAirport: true,
      },
    });

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

    return updated;
  }
}
