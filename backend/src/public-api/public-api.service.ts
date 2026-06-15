import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { GuestBookingsService } from '../guest-bookings/guest-bookings.service.js';
import { B2CService } from '../b2c/b2c.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { QuoteRequestDto } from './dto/quote-request.dto.js';
import { CreateGuestBookingDto } from './dto/create-guest-booking.dto.js';
import { VehicleQuotesRequestDto } from './dto/vehicle-quotes-request.dto.js';
import { ContactMessageDto } from './dto/contact-message.dto.js';
import { ResolvePlaceDto } from './dto/resolve-place.dto.js';
import {
  ServiceType,
  B2CPaymentMethod,
  B2CPaymentGateway,
  B2CPaymentStatus,
  GuestBookingStatus,
} from '../../generated/prisma/enums.js';

// A snapshot of one extra at booking time, carried through to the converted job.
export interface ExtraSnapshotItem {
  extraId: string | null;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
}

@Injectable()
export class PublicApiService {
  private readonly logger = new Logger(PublicApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly guestBookingsService: GuestBookingsService,
    private readonly b2cService: B2CService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ─── Contact form ─────────────────────────────────────────

  /**
   * Persist a B2C contact-form submission and best-effort email the team.
   * Email failure never fails the request — the message is already stored.
   */
  async submitContact(dto: ContactMessageDto, ip?: string) {
    const saved = await this.prisma.contactMessage.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim(),
        phone: dto.phone?.trim() || null,
        subject: dto.subject?.trim() || null,
        message: dto.message.trim(),
        ipAddress: ip || null,
      },
    });

    try {
      const settings = await this.prisma.websiteSettings.findFirst();
      const to =
        settings?.contactEmail ||
        process.env.CONTACT_EMAIL ||
        process.env.SMTP_FROM ||
        null;
      if (to) {
        await this.emailService.sendContactNotification(to, {
          name: saved.name,
          email: saved.email,
          phone: saved.phone,
          subject: saved.subject,
          message: saved.message,
          createdAt: saved.createdAt,
        });
      } else {
        this.logger.warn(
          'Contact message saved but no recipient configured (set contactEmail in website settings or CONTACT_EMAIL env).',
        );
      }
    } catch (err) {
      this.logger.error(
        `Contact notification email failed: ${(err as Error).message}`,
      );
    }

    return { ok: true };
  }

  // ─── Google Maps API Key ─────────────────────────────────

  async getGoogleMapsKey() {
    const settings = await this.prisma.systemSettings.findFirst();
    return { apiKey: settings?.googleMapsApiKey ?? null };
  }

  // ─── Website Settings (public CMS) ────────────────────────

  async getWebsiteSettings() {
    const settings = await this.prisma.websiteSettings.findFirst();
    if (!settings) {
      return {
        siteName: 'iTour Transfers',
        siteLogoUrl: null,
        siteFaviconUrl: null,
        fontFamily: 'Inter',
        primaryColor: '#3b82f6',
        accentColor: '#8b5cf6',
        heroGradientFrom: '#1a1a2e',
        heroGradientTo: '#0f3460',
        navBgColor: '#1a1a2e',
        footerBgColor: '#1a1a2e',
        headerPreset: 'default',
        footerPreset: 'default',
        heroTitle: 'Book Your Airport Transfer',
        heroSubtitle: 'Safe, comfortable, and reliable private transfers across Egypt.',
        heroCta1Text: 'Book Now',
        heroCta2Text: 'Track a Booking',
        heroImageUrl: null,
        featuresEnabled: true,
        featuresTitle: 'Why Choose Us?',
        featuresJson: null,
        contactEmail: null,
        contactPhone: null,
        contactWhatsapp: null,
        socialFacebook: null,
        socialInstagram: null,
        socialTwitter: null,
        bankPaymentEnabled: false,
        bankPaymentMessage: 'Bank payment integration coming soon!',
        onlinePaymentEnabled: true,
        cashOnArrivalEnabled: true,
        enableTwoWayTab: false,
        enableCityToCityTab: false,
        enableMapSelector: false,
        enableAiMode: false,
        bookingTabsOrder: 'ARR,DEP',
        metaTitle: null,
        metaDescription: null,
        navLinksJson: null,
      };
    }
    // Return all fields except internal id, audit timestamps, and the internal
    // notification recipient lists (ops/finance emails must never be exposed).
    const {
      id,
      createdAt,
      updatedAt,
      opsNotificationEmails,
      financeNotificationEmails,
      ...publicFields
    } = settings;
    return publicFields;
  }

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

  // ─── Resolve a Google Places pick → pricing zone (+ hotel) ──────────

  // Great-circle distance in km between two lat/lng points.
  private haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Map a picked place to a pricing zone. Strategy:
  //  1. exact placeId match on an existing hotel/zone → reuse it;
  //  2. an existing hotel within ~250 m → reuse (avoids duplicate auto-creates);
  //  3. nearest geo-tagged zone within ~35 km → auto-create a hotel under it;
  //  4. otherwise unmatched → B2C falls back to the manual zone dropdown.
  async resolvePlace(dto: ResolvePlaceDto) {
    const NEAREST_ZONE_KM = 35;
    const DEDUPE_HOTEL_M = 250;

    // 1a. Exact placeId on a hotel.
    const hotelByPlace = await this.prisma.hotel.findFirst({
      where: { placeId: dto.placeId, deletedAt: null },
      include: { zone: true },
    });
    if (hotelByPlace) {
      return {
        matched: true,
        created: false,
        zoneId: hotelByPlace.zoneId,
        zoneName: hotelByPlace.zone.name,
        hotelId: hotelByPlace.id,
        hotelName: hotelByPlace.name,
      };
    }

    // 1b. Exact placeId on a zone.
    const zoneByPlace = await this.prisma.zone.findFirst({
      where: { placeId: dto.placeId, deletedAt: null },
    });
    if (zoneByPlace) {
      return { matched: true, created: false, zoneId: zoneByPlace.id, zoneName: zoneByPlace.name };
    }

    // Candidate zones (geo-tagged), optionally scoped to the chosen airport.
    const zones = await this.prisma.zone.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
        ...(dto.airportId ? { city: { airportId: dto.airportId } } : {}),
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    let nearestZone: (typeof zones)[number] | null = null;
    let nearestZoneKm = Infinity;
    for (const z of zones) {
      const km = this.haversineKm(dto.lat, dto.lng, Number(z.latitude), Number(z.longitude));
      if (km < nearestZoneKm) {
        nearestZoneKm = km;
        nearestZone = z;
      }
    }

    if (!nearestZone || nearestZoneKm > NEAREST_ZONE_KM) {
      // Outside known coverage — let the guest pick a zone manually.
      return { matched: false };
    }

    // 2. Reuse a very close existing hotel in that zone to avoid duplicates.
    const zoneHotels = await this.prisma.hotel.findMany({
      where: {
        zoneId: nearestZone.id,
        deletedAt: null,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    for (const h of zoneHotels) {
      const m = this.haversineKm(dto.lat, dto.lng, Number(h.latitude), Number(h.longitude)) * 1000;
      if (m <= DEDUPE_HOTEL_M) {
        return {
          matched: true,
          created: false,
          zoneId: nearestZone.id,
          zoneName: nearestZone.name,
          hotelId: h.id,
          hotelName: h.name,
        };
      }
    }

    // 3. Auto-create a hotel under the nearest zone, flagged for admin review.
    const hotel = await this.prisma.hotel.create({
      data: {
        name: dto.name.slice(0, 120),
        zoneId: nearestZone.id,
        address: dto.address?.slice(0, 255),
        latitude: dto.lat,
        longitude: dto.lng,
        placeId: dto.placeId,
        isAutoCreated: true,
      },
    });
    this.logger.log(
      `Auto-created hotel "${hotel.name}" in zone ${nearestZone.name} from B2C place pick (${Math.round(nearestZoneKm)}km)`,
    );
    return {
      matched: true,
      created: true,
      zoneId: nearestZone.id,
      zoneName: nearestZone.name,
      hotelId: hotel.id,
      hotelName: hotel.name,
    };
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

  // ─── Vehicle Quotes (all options for a route) ───────────

  async getVehicleQuotes(dto: VehicleQuotesRequestDto) {
    // Public prices are stored once per airport↔hotel-zone route (airport side as
    // fromZone) and the same rows serve both ARR and DEP. A departure runs
    // hotel→airport — the reverse of how the row is stored — so fall back to the
    // swapped zone pair when the exact direction has no matching prices.
    const vehicleWhere = { seatCapacity: { gte: dto.paxCount }, isActive: true };
    let priceItems = await this.prisma.publicPriceItem.findMany({
      where: {
        serviceType: dto.serviceType as any,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        vehicleType: vehicleWhere,
      },
      include: { vehicleType: true },
      orderBy: { price: 'asc' },
    });
    if (priceItems.length === 0) {
      priceItems = await this.prisma.publicPriceItem.findMany({
        where: {
          serviceType: dto.serviceType as any,
          fromZoneId: dto.toZoneId,
          toZoneId: dto.fromZoneId,
          vehicleType: vehicleWhere,
        },
        include: { vehicleType: true },
        orderBy: { price: 'asc' },
      });
    }

    return {
      options: priceItems.map((item) => ({
        vehicleTypeId: item.vehicleTypeId,
        vehicleTypeName: item.vehicleType.name,
        seatCapacity: item.vehicleType.seatCapacity,
        imageUrl: item.vehicleType.imageUrl ?? null,
        description: item.vehicleType.description ?? null,
        wifi: item.vehicleType.wifi,
        airConditioning: item.vehicleType.airConditioning,
        transmission: item.vehicleType.transmission ?? null,
        luggageCapacity: item.vehicleType.luggageCapacity ?? null,
        gpsTracked: item.vehicleType.gpsTracked,
        price: Number(item.price),
        currency: item.currency,
        driverTip: Number(item.driverTip),
        boosterSeatPrice: Number(item.boosterSeatPrice),
        babySeatPrice: Number(item.babySeatPrice),
        wheelChairPrice: Number(item.wheelChairPrice),
      })),
    };
  }

  // ─── B2C Extras catalog (public) ────────────────────────

  async getExtras() {
    const extras = await this.prisma.b2cExtra.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        allowedVehicleTypes: {
          include: { vehicleType: { select: { id: true, name: true } } },
        },
      },
    });
    return extras.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      price: Number(e.price),
      currency: e.currency,
      imageUrl: e.imageUrl,
      occupiesSeat: e.occupiesSeat,
      allowedVehicleTypeIds: e.allowedVehicleTypes.map((a) => a.vehicleTypeId),
      allowedVehicleTypeNames: e.allowedVehicleTypes.map((a) => a.vehicleType.name),
    }));
  }

  // Resolve selected catalog extras and total their cost.
  // Only extras priced in the booking currency are charged, to avoid
  // silently mixing currencies in a single total.
  private async computeCustomExtras(
    selections: { extraId: string; qty: number }[] | undefined,
    bookingCurrency: string,
    vehicleTypeId?: string,
  ): Promise<{
    total: number;
    lines: Record<string, number>;
    items: ExtraSnapshotItem[];
    seatUnits: number;
    vehicleViolations: { name: string; allowed: string[] }[];
  }> {
    const lines: Record<string, number> = {};
    const items: ExtraSnapshotItem[] = [];
    const vehicleViolations: { name: string; allowed: string[] }[] = [];
    let seatUnits = 0;
    if (!selections || selections.length === 0)
      return { total: 0, lines, items, seatUnits, vehicleViolations };

    const ids = selections.map((s) => s.extraId);
    const extras = await this.prisma.b2cExtra.findMany({
      where: { id: { in: ids }, isActive: true },
      include: { allowedVehicleTypes: { include: { vehicleType: { select: { id: true, name: true } } } } },
    });
    const byId = new Map(extras.map((e) => [e.id, e]));

    let total = 0;
    for (const sel of selections) {
      const extra = byId.get(sel.extraId);
      if (!extra || sel.qty <= 0) continue;
      // Snapshot every selected extra (incl. cross-currency) for the job record.
      items.push({
        extraId: extra.id,
        name: extra.name,
        qty: sel.qty,
        unitAmount: Number(extra.price),
        currency: extra.currency,
      });
      // Seat-occupying extras count against vehicle capacity.
      if (extra.occupiesSeat) seatUnits += sel.qty;
      // Vehicle-type restriction: extra only fits certain vehicle types.
      if (
        extra.allowedVehicleTypes.length > 0 &&
        vehicleTypeId &&
        !extra.allowedVehicleTypes.some((a) => a.vehicleTypeId === vehicleTypeId)
      ) {
        vehicleViolations.push({
          name: extra.name,
          allowed: extra.allowedVehicleTypes.map((a) => a.vehicleType.name),
        });
      }
      // Only same-currency extras contribute to the booking total.
      if (extra.currency !== bookingCurrency) continue;
      const cost = sel.qty * Number(extra.price);
      total += cost;
      lines[extra.name] = cost;
    }
    return { total, lines, items, seatUnits, vehicleViolations };
  }

  // Throws if any selected extra is restricted to vehicle types other than the chosen one.
  private assertVehicleTypeAllowed(violations: { name: string; allowed: string[] }[]) {
    if (violations.length === 0) return;
    const v = violations[0];
    throw new BadRequestException(
      `"${v.name}" can only be carried by: ${v.allowed.join(', ')}. ` +
        `Please change your vehicle type.`,
    );
  }

  // Total seats consumed by extras: legacy seat fields (always seats) + catalog
  // extras flagged occupiesSeat.
  private legacySeatUnits(
    extras: { boosterSeatQty?: number; babySeatQty?: number; wheelChairQty?: number } | undefined,
  ): number {
    if (!extras) return 0;
    return (extras.boosterSeatQty || 0) + (extras.babySeatQty || 0) + (extras.wheelChairQty || 0);
  }

  // Snapshot the legacy seat extras (booster/baby/wheelchair) priced from the route's
  // price item, so they carry through to the converted job alongside catalog extras.
  private buildLegacySeatItems(
    extras: { boosterSeatQty?: number; babySeatQty?: number; wheelChairQty?: number } | undefined,
    priceItem: { boosterSeatPrice: unknown; babySeatPrice: unknown; wheelChairPrice: unknown; currency: string },
  ): ExtraSnapshotItem[] {
    const items: ExtraSnapshotItem[] = [];
    if (!extras) return items;
    const push = (name: string, qty: number | undefined, price: unknown) => {
      if (qty && qty > 0) {
        items.push({ extraId: null, name, qty, unitAmount: Number(price), currency: priceItem.currency });
      }
    };
    push('Booster Seat', extras.boosterSeatQty, priceItem.boosterSeatPrice);
    push('Baby Seat', extras.babySeatQty, priceItem.babySeatPrice);
    push('Wheelchair', extras.wheelChairQty, priceItem.wheelChairPrice);
    return items;
  }

  // ─── Quote ──────────────────────────────────────────────

  // Find a route price for a single vehicle type. Prices are stored once per
  // airport↔hotel-zone route (airport side as fromZone) and the same row serves
  // both ARR and DEP, so a departure (hotel→airport) falls back to the swapped
  // zone pair when the exact direction has no match.
  private async findRoutePriceItem(
    serviceType: ServiceType,
    fromZoneId: string,
    toZoneId: string,
    vehicleTypeId: string,
  ) {
    return (
      (await this.prisma.publicPriceItem.findFirst({
        where: { serviceType, fromZoneId, toZoneId, vehicleTypeId },
        include: { vehicleType: true },
      })) ??
      (await this.prisma.publicPriceItem.findFirst({
        where: { serviceType, fromZoneId: toZoneId, toZoneId: fromZoneId, vehicleTypeId },
        include: { vehicleType: true },
      }))
    );
  }

  async getQuote(dto: QuoteRequestDto) {
    const priceItem = await this.findRoutePriceItem(
      dto.serviceType as ServiceType,
      dto.fromZoneId,
      dto.toZoneId,
      dto.vehicleTypeId,
    );

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

    // Managed B2C catalog extras
    const custom = await this.computeCustomExtras(
      dto.customExtras,
      priceItem.currency,
      dto.vehicleTypeId,
    );
    extrasTotal += custom.total;
    Object.assign(extrasBreakdown, custom.lines);

    // Reject extras that require a different vehicle type (e.g. cargo gear needs a van).
    this.assertVehicleTypeAllowed(custom.vehicleViolations);

    // Seat-occupying extras share the cabin with passengers — enforce capacity.
    const seatExtras = this.legacySeatUnits(dto.extras) + custom.seatUnits;
    if (dto.paxCount + seatExtras > priceItem.vehicleType.seatCapacity) {
      throw new BadRequestException(
        `Passengers (${dto.paxCount}) plus seat-occupying extras (${seatExtras}) exceed the ` +
          `${priceItem.vehicleType.name} capacity (${priceItem.vehicleType.seatCapacity}). ` +
          `Please choose a larger vehicle.`,
      );
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

  // Generate a fresh GB-YYMMDD-XXXX ref for the return leg of a 2-way booking.
  private async generateGroupedRef(yy: string, mm: string, dd: string): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      let rnd = '';
      for (let i = 0; i < 4; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
      const ref = `GB-${yy}${mm}${dd}-${rnd}`;
      const clash = await this.prisma.guestBooking.findUnique({ where: { bookingRef: ref } });
      if (!clash) return ref;
    }
    return `GB-${yy}${mm}${dd}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  async createBooking(dto: CreateGuestBookingDto) {
    // Enforce the payment-method master switches server-side (never trust the
    // client to hide a disabled option).
    const settings = await this.prisma.websiteSettings.findFirst();
    const onlineEnabled = settings?.onlinePaymentEnabled ?? true;
    const cashEnabled = settings?.cashOnArrivalEnabled ?? true;
    if (dto.paymentMethod === 'ONLINE' && !onlineEnabled) {
      throw new BadRequestException('Online payment is currently unavailable.');
    }
    if (dto.paymentMethod === 'PAY_ON_ARRIVAL' && !cashEnabled) {
      throw new BadRequestException('Pay on arrival is currently unavailable.');
    }

    // Look up pricing (matches either zone orientation; see findRoutePriceItem)
    const priceItem = await this.findRoutePriceItem(
      dto.serviceType as ServiceType,
      dto.fromZoneId,
      dto.toZoneId,
      dto.vehicleTypeId,
    );

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

    // Managed B2C catalog extras
    const custom = await this.computeCustomExtras(
      dto.customExtras,
      priceItem.currency,
      dto.vehicleTypeId,
    );
    extrasTotal += custom.total;

    // Reject extras that require a different vehicle type (e.g. cargo gear needs a van).
    this.assertVehicleTypeAllowed(custom.vehicleViolations);

    // Seat-occupying extras share the cabin with passengers — enforce capacity.
    const seatExtras = this.legacySeatUnits(dto.extras) + custom.seatUnits;
    if (dto.paxCount + seatExtras > priceItem.vehicleType.seatCapacity) {
      throw new BadRequestException(
        `Passengers (${dto.paxCount}) plus seat-occupying extras (${seatExtras}) exceed the ` +
          `${priceItem.vehicleType.name} capacity (${priceItem.vehicleType.seatCapacity}). ` +
          `Please choose a larger vehicle.`,
      );
    }

    // Unified extras snapshot (legacy seats + catalog) carried through to the job.
    const snapshotItems = [
      ...this.buildLegacySeatItems(dto.extras, priceItem),
      ...custom.items,
    ];

    const subtotal = basePrice + driverTip + extrasTotal;
    const taxAmount = 0;
    const total = subtotal + taxAmount;

    // 2-Way (return) transfer: price the departure leg and sum it. An explicit
    // TWO_WAY_TRANSFER price row (if the admin entered one) is honoured by
    // findRoutePriceItem; otherwise the two legs are summed. Only valid on an
    // arrival outbound (airport→hotel) with a return departure (hotel→airport).
    const isRoundTrip = !!dto.roundTrip && dto.serviceType === 'ARR';
    let returnPriceItem: Awaited<ReturnType<typeof this.findRoutePriceItem>> = null;
    let returnLegTotal = 0;
    if (isRoundTrip) {
      returnPriceItem = await this.findRoutePriceItem(
        ServiceType.DEP,
        dto.toZoneId,
        dto.fromZoneId,
        dto.vehicleTypeId,
      );
      if (!returnPriceItem) {
        throw new NotFoundException('No pricing found for the return (departure) leg.');
      }
      returnLegTotal = Number(returnPriceItem.price) + Number(returnPriceItem.driverTip);
    }
    const combinedTotal = total + returnLegTotal;

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
    // Online payments default to the GetPayIn hosted checkout unless a specific
    // gateway is requested.
    const gatewayName = isOnline ? dto.paymentGateway || 'GETPAYIN' : null;

    // Round-trip grouping. For ONLINE the combined amount is charged once on the
    // outbound leg; for PAY_ON_ARRIVAL each leg is collected by its own driver.
    const groupRef = isRoundTrip ? bookingRef : null;
    const outboundTotal = isRoundTrip && isOnline ? combinedTotal : total;

    const booking = await this.prisma.guestBooking.create({
      data: {
        bookingRef,
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        guestCountry: dto.guestCountry,
        serviceType: dto.serviceType as ServiceType,
        jobDate: new Date(dto.jobDate),
        pickupTime: dto.pickupTime ? new Date(`${dto.jobDate}T${dto.pickupTime}:00`) : null,
        fromZoneId: dto.fromZoneId,
        toZoneId: dto.toZoneId,
        hotelId: dto.hotelId,
        originAirportId: dto.originAirportId,
        destinationAirportId: dto.destinationAirportId,
        flightNo: dto.flightNo,
        carrier: dto.carrier,
        terminal: dto.terminal,
        pickupPlaceId: dto.pickupPlaceId,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffPlaceId: dto.dropoffPlaceId,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        paxCount: dto.paxCount,
        vehicleTypeId: dto.vehicleTypeId,
        extras:
          dto.extras || (dto.customExtras && dto.customExtras.length > 0)
            ? ({ ...dto.extras, customExtras: dto.customExtras ?? [], items: snapshotItems } as object)
            : undefined,
        notes: dto.notes,
        groupRef,
        legType: isRoundTrip ? ('OUTBOUND' as const) : null,
        subtotal,
        taxAmount,
        total: outboundTotal,
        currency: priceItem.currency,
        paymentMethod,
        paymentStatus: isOnline
          ? B2CPaymentStatus.PENDING as B2CPaymentStatus
          : B2CPaymentStatus.PENDING as B2CPaymentStatus,
        paymentGateway: gatewayName
          ? (gatewayName as B2CPaymentGateway)
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
        total: isRoundTrip ? combinedTotal : total,
        currency: priceItem.currency,
        paymentMethod: dto.paymentMethod,
      })
      .catch((err) =>
        this.logger.error(`Failed to send confirmation email: ${err.message}`),
      );

    // Internal ops notification (additive — recipients configured in admin CMS).
    this.emailService
      .notifyOpsBookingEvent('new', {
        bookingRef: booking.bookingRef,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        guestPhone: booking.guestPhone ?? undefined,
        serviceType: booking.serviceType,
        jobDate: booking.jobDate.toISOString().split('T')[0],
        pickupTime: booking.pickupTime
          ? booking.pickupTime.toISOString().slice(11, 16)
          : undefined,
        fromZone: booking.fromZone?.name,
        toZone: booking.toZone?.name,
        hotel: booking.hotel?.name,
        flightNo: booking.flightNo ?? undefined,
        paxCount: booking.paxCount,
        vehicleType: booking.vehicleType?.name,
        total: isRoundTrip ? combinedTotal : total,
        currency: priceItem.currency,
        paymentMethod: dto.paymentMethod,
        paymentStatus: booking.paymentStatus,
        notes: booking.notes ?? undefined,
      })
      .catch((err) =>
        this.logger.error(`Failed to send ops booking notification: ${err.message}`),
      );

    // Create or find B2C client account
    let accountCreated = false;
    let b2cClientId: string | null = null;
    let accountPassword: string | null = null;
    try {
      const result = await this.b2cService.ensureB2CClientAccount(
        booking.guestEmail,
        booking.guestPhone,
        booking.guestName,
      );
      b2cClientId = result.user.id;
      accountCreated = result.isNew;
      if (result.isNew) accountPassword = result.rawPassword ?? null;
      await this.prisma.guestBooking.update({
        where: { id: booking.id },
        data: { b2cClientId },
      });
    } catch (err) {
      this.logger.error(`Failed to create B2C account for ${booking.guestEmail}: ${err.message}`);
    }

    // Auto-convert to traffic job so it appears in dispatch & traffic jobs pool
    try {
      const systemUser = await this.prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
      if (systemUser) {
        await this.guestBookingsService.convertToJob(booking.id, systemUser.id);
        this.logger.log(`Auto-converted guest booking ${booking.bookingRef} to traffic job`);

        // 2-Way: create + convert the RETURN (departure) leg, sharing the group.
        if (isRoundTrip && returnPriceItem) {
          const retRef = await this.generateGroupedRef(yy, mm, dd);
          const returnDate = dto.returnDate ?? dto.jobDate;
          const returnBooking = await this.prisma.guestBooking.create({
            data: {
              bookingRef: retRef,
              guestName: dto.guestName,
              guestEmail: dto.guestEmail,
              guestPhone: dto.guestPhone,
              guestCountry: dto.guestCountry,
              serviceType: ServiceType.DEP,
              jobDate: new Date(returnDate),
              pickupTime: dto.returnPickupTime
                ? new Date(`${returnDate}T${dto.returnPickupTime}:00`)
                : null,
              // Return leg runs hotel→airport: zones swapped vs the outbound.
              fromZoneId: dto.toZoneId,
              toZoneId: dto.fromZoneId,
              hotelId: dto.hotelId,
              destinationAirportId: dto.originAirportId,
              flightNo: dto.returnFlightNo,
              carrier: dto.returnCarrier,
              terminal: dto.returnTerminal,
              // Pickup is now the hotel/place (outbound drop-off becomes pickup).
              pickupPlaceId: dto.dropoffPlaceId ?? dto.pickupPlaceId,
              pickupLat: dto.dropoffLat ?? dto.pickupLat,
              pickupLng: dto.dropoffLng ?? dto.pickupLng,
              pickupAddress: dto.dropoffAddress ?? dto.pickupAddress,
              paxCount: dto.paxCount,
              vehicleTypeId: dto.vehicleTypeId,
              notes: dto.notes,
              groupRef,
              legType: 'RETURN' as const,
              subtotal: returnLegTotal,
              taxAmount: 0,
              total: returnLegTotal,
              currency: returnPriceItem.currency,
              paymentMethod,
              // Online: paid once on the outbound leg (mirrored on settle). Cash:
              // the return driver collects this leg separately.
              paymentStatus: B2CPaymentStatus.PENDING as B2CPaymentStatus,
              paymentGateway: gatewayName ? (gatewayName as B2CPaymentGateway) : null,
              bookingStatus: GuestBookingStatus.CONFIRMED as GuestBookingStatus,
              b2cClientId,
            },
          });
          await this.guestBookingsService.convertToJob(returnBooking.id, systemUser.id);
          this.logger.log(
            `Auto-converted RETURN leg ${returnBooking.bookingRef} (group ${groupRef})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Failed to auto-convert booking ${booking.bookingRef}: ${err.message}`);
    }

    // For online payments, open a hosted-checkout session and hand the guest a
    // redirect URL. A gateway failure must not lose the booking — we just return
    // without a paymentUrl and the guest can retry payment from the booking page.
    let paymentUrl: string | null = null;
    if (isOnline && gatewayName) {
      try {
        const session = await this.paymentsService.createPaymentSession(
          booking.bookingRef,
          gatewayName,
          '', // returnUrl — unused by GetPayIn (configured in its dashboard)
          '', // cancelUrl — unused by GetPayIn
        );
        paymentUrl = session.checkoutUrl;
      } catch (err) {
        this.logger.error(
          `Failed to create payment session for ${booking.bookingRef}: ${(err as Error).message}`,
        );
      }
    }

    return {
      bookingRef: booking.bookingRef,
      booking,
      paymentRequired: isOnline,
      paymentUrl,
      accountCreated,
      accountEmail: accountCreated ? booking.guestEmail : null,
      accountPassword,
    };
  }

  // ─── Get Booking ────────────────────────────────────────

  async getBooking(ref: string, email: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef: ref },
      include: {
        fromZone: true,
        toZone: true,
        vehicleType: true,
        hotel: true,
        originAirport: true,
        destinationAirport: true,
      },
    });

    // Ownership check: the email must match the one used to make the booking.
    // Return the SAME 404 for "not found" and "wrong email" so the endpoint
    // cannot be used to confirm which references exist (enumeration).
    if (!booking || !this.emailMatches(booking.guestEmail, email)) {
      throw new NotFoundException(
        `No booking found for reference "${ref}" with that email.`,
      );
    }

    // 2-Way: attach the sibling (other leg) so the lookup page shows the return.
    if (booking.groupRef) {
      const legs = await this.prisma.guestBooking.findMany({
        where: { groupRef: booking.groupRef },
        include: {
          fromZone: true,
          toZone: true,
          vehicleType: true,
          hotel: true,
          originAirport: true,
          destinationAirport: true,
        },
        orderBy: { legType: 'asc' }, // OUTBOUND before RETURN
      });
      return { ...booking, legs };
    }

    return booking;
  }

  /** Case-insensitive, trimmed email comparison. */
  private emailMatches(stored: string, provided: string): boolean {
    return (
      (stored ?? '').trim().toLowerCase() ===
      (provided ?? '').trim().toLowerCase()
    );
  }

  // ─── Cancel Booking ─────────────────────────────────────

  async cancelBooking(ref: string, email: string) {
    const booking = await this.prisma.guestBooking.findUnique({
      where: { bookingRef: ref },
    });

    // Same ownership check as getBooking — only the booking owner may cancel.
    if (!booking || !this.emailMatches(booking.guestEmail, email)) {
      throw new NotFoundException(
        `No booking found for reference "${ref}" with that email.`,
      );
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

    // 2-Way is cancelled as a whole: cancel the sibling leg too (decision v1).
    if (booking.groupRef) {
      await this.prisma.guestBooking.updateMany({
        where: {
          groupRef: booking.groupRef,
          bookingRef: { not: ref },
          bookingStatus: { not: GuestBookingStatus.CANCELLED as GuestBookingStatus },
        },
        data: { bookingStatus: GuestBookingStatus.CANCELLED as GuestBookingStatus },
      });
    }

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

    // Internal ops notification (additive — recipients configured in admin CMS).
    this.emailService
      .notifyOpsBookingEvent('cancelled', {
        bookingRef: updated.bookingRef,
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        guestPhone: updated.guestPhone ?? undefined,
        serviceType: updated.serviceType,
        jobDate: updated.jobDate.toISOString().split('T')[0],
        pickupTime: updated.pickupTime
          ? updated.pickupTime.toISOString().slice(11, 16)
          : undefined,
        fromZone: updated.fromZone?.name,
        toZone: updated.toZone?.name,
        hotel: updated.hotel?.name,
        flightNo: updated.flightNo ?? undefined,
        paxCount: updated.paxCount,
        vehicleType: updated.vehicleType?.name,
        total: Number(updated.total),
        currency: updated.currency,
        paymentMethod: updated.paymentMethod,
        paymentStatus: updated.paymentStatus,
      })
      .catch((err) =>
        this.logger.error(`Failed to send ops cancellation notification: ${err.message}`),
      );

    return updated;
  }
}
