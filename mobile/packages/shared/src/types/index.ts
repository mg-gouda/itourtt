// ─── Enums ──────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'DISPATCHER' | 'ACCOUNTANT' | 'AGENT_MANAGER' | 'VIEWER' | 'REP' | 'DRIVER' | 'SUPPLIER';
// TWO_WAY_TRANSFER / CITY_TO_CITY are legacy: not selectable, still present on old rows.
export type ServiceType = 'ARR' | 'DEP' | 'DAY_TOUR' | 'ONE_WAY_TRANSFER' | 'RETURN' | 'TWO_WAY_TRANSFER' | 'CITY_TO_CITY';
export type JobStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PortalJobStatus = 'PENDING' | 'IN_PROGRESS' | 'IN_PLACE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type VehicleOwnership = 'OWNED' | 'RENTED' | 'CONTRACTED';
export type Currency = 'EGP' | 'USD' | 'EUR' | 'GBP' | 'SAR';
export type InvoiceStatus = 'DRAFT' | 'POSTED' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK';
export type B2CPaymentMethod = 'ONLINE' | 'PAY_ON_ARRIVAL';
export type B2CPaymentGateway = 'STRIPE' | 'EGYPT_BANK' | 'DUBAI_BANK';
export type B2CPaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
export type GuestBookingStatus = 'CONFIRMED' | 'CANCELLED' | 'CONVERTED';
export type NotificationType = 'JOB_ASSIGNED' | 'JOB_UPDATED' | 'GENERAL';

// ─── Auth ───────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roleId?: string;
  roleSlug?: string;
  repId?: string;
  driverId?: string;
  supplierId?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginPayload {
  identifier: string;
  password: string;
  /** REP/DRIVER: take over a session open on another device or the portal. */
  takeover?: boolean;
}

// ─── Locations ──────────────────────────────────────────────────
export interface Country {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface Airport {
  id: string;
  name: string;
  code: string;
  countryId: string;
  country?: Country;
  createdAt: string;
  updatedAt: string;
}

export interface City {
  id: string;
  name: string;
  airportId: string;
  airport?: Airport;
  createdAt: string;
  updatedAt: string;
}

export interface Zone {
  id: string;
  name: string;
  cityId: string;
  city?: City;
  createdAt: string;
  updatedAt: string;
}

export interface Hotel {
  id: string;
  name: string;
  zoneId: string;
  zone?: Zone;
  createdAt: string;
  updatedAt: string;
}

export interface LocationTree {
  countries: (Country & {
    airports: (Airport & {
      cities: (City & {
        zones: (Zone & {
          hotels: Hotel[];
        })[];
      })[];
    })[];
  })[];
}

// ─── Vehicles ───────────────────────────────────────────────────
export interface VehicleType {
  id: string;
  name: string;
  seatCapacity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleTypeId: string;
  vehicleType?: VehicleType;
  ownership: VehicleOwnership;
  color?: string | null;
  carBrand?: string | null;
  carModel?: string | null;
  makeYear?: number | null;
  luggageCapacity?: number | null;
  supplierId?: string | null;
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Drivers ────────────────────────────────────────────────────
export interface Driver {
  id: string;
  name: string;
  mobileNumber: string;
  licenseNumber: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicle {
  id: string;
  driverId: string;
  vehicleId: string;
  driver?: Driver;
  vehicle?: Vehicle;
  isPrimary: boolean;
  assignedAt: string;
  unassignedAt: string | null;
}

// ─── Reps ───────────────────────────────────────────────────────
export interface Rep {
  id: string;
  name: string;
  mobileNumber: string;
  feePerFlight?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Agents ─────────────────────────────────────────────────────
export interface Agent {
  id: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  phone: string;
  email: string;
  currency: Currency;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Customers ──────────────────────────────────────────────────
export interface Customer {
  id: string;
  legalName: string;
  tradeName: string | null;
  currency: Currency;
  creditLimit: number | null;
  creditDays: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Suppliers ──────────────────────────────────────────────────
export interface Supplier {
  id: string;
  legalName: string;
  tradeName: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Traffic Jobs ───────────────────────────────────────────────
export interface TrafficFlight {
  id: string;
  trafficJobId: string;
  flightNo: string;
  carrier: string;
  terminal: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
}

export interface TrafficAssignment {
  id: string;
  trafficJobId: string;
  vehicleId: string;
  driverId: string | null;
  repId: string | null;
  vehicle?: Vehicle;
  driver?: Driver;
  rep?: Rep;
  assignedById: string;
  assignedAt: string;
}

export interface TrafficJob {
  id: string;
  internalRef: string;
  agentRef: string | null;
  agentId: string | null;
  customerId: string | null;
  agent?: Agent;
  customer?: Customer;
  serviceType: ServiceType;
  jobDate: string;
  status: JobStatus;
  paxCount: number;
  adultCount?: number;
  childCount?: number;
  originAirportId: string | null;
  originZoneId: string | null;
  originHotelId: string | null;
  destinationAirportId: string | null;
  destinationZoneId: string | null;
  destinationHotelId: string | null;
  originAirport?: Airport;
  originZone?: Zone;
  originHotel?: Hotel;
  destinationAirport?: Airport;
  destinationZone?: Zone;
  destinationHotel?: Hotel;
  notes: string | null;
  flight?: TrafficFlight;
  assignment?: TrafficAssignment;
  clientName?: string | null;
  clientMobile?: string | null;
  pickUpTime?: string | null;
  boosterSeat?: boolean;
  boosterSeatQty?: number;
  babySeat?: boolean;
  babySeatQty?: number;
  wheelChair?: boolean;
  wheelChairQty?: number;
  printSign?: boolean;
  collectionRequired?: boolean;
  collectionAmount?: number | null;
  collectionCurrency?: Currency;
  collectionCollected?: boolean;
  collectionLiquidated?: boolean;
  custRepName?: string | null;
  custRepMobile?: string | null;
  custRepMeetingPoint?: string | null;
  custRepMeetingTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Portal Job Types ───────────────────────────────────────────
/** Coordinates the portal APIs return on a job's locations (Prisma Decimal → string). */
export interface PortalLocationCoords {
  latitude?: string | number | null;
  longitude?: string | number | null;
  address?: string | null;
}

export interface PortalJob {
  id: string;
  internalRef: string;
  serviceType: ServiceType;
  /** Job type for the driver / rep badge: ONLINE (tour operator), B2B, B2C (public site). */
  bookingChannel?: string | null;
  jobDate: string;
  status: JobStatus;
  paxCount: number;
  adultCount?: number;
  childCount?: number;
  clientName: string | null;
  clientMobile: string | null;
  pickUpTime: string | null;
  notes: string | null;
  // latitude/longitude/address feed tap-to-navigate (native/navigation.ts).
  originAirport?: ({ id: string; name: string; code: string } & PortalLocationCoords) | null;
  originZone?: ({ id: string; name: string } & PortalLocationCoords) | null;
  originHotel?: ({ id: string; name: string } & PortalLocationCoords) | null;
  destinationAirport?: ({ id: string; name: string; code: string } & PortalLocationCoords) | null;
  destinationZone?: ({ id: string; name: string } & PortalLocationCoords) | null;
  destinationHotel?: ({ id: string; name: string } & PortalLocationCoords) | null;
  pickupLat?: string | number | null;
  pickupLng?: string | number | null;
  dropoffLat?: string | number | null;
  dropoffLng?: string | number | null;
  flight?: TrafficFlight;
  assignment?: TrafficAssignment;
  boosterSeat?: boolean;
  boosterSeatQty?: number;
  babySeat?: boolean;
  babySeatQty?: number;
  wheelChair?: boolean;
  wheelChairQty?: number;
  printSign?: boolean;
}

export interface DriverPortalJob extends PortalJob {
  driverStatus: PortalJobStatus;
  collectionRequired: boolean;
  /** Prisma Decimal — may arrive as a string. */
  collectionAmount: number | string | null;
  collectionCurrency: Currency | null;
  collectionCollected: boolean;
  feeEarned?: number | null;
  agentRef?: string | null;
  /** Server-computed NO SHOW unlock — never derive it locally. */
  noShowAvailableFrom?: string | null;
  /** Admin unlock: lifts the 48h timelock. */
  driverUnlockedAt?: string | null;
  fromZone?: { id?: string; name: string } | null;
  toZone?: { id?: string; name: string } | null;
  jobExtras?: { name: string; qty: number }[];
}

export interface RepPortalJob extends PortalJob {
  repStatus: PortalJobStatus;
  /** Escort answer after IN PLACE: true = completes at the drop-off, false = at the airport, null = not asked yet. */
  repEscort?: boolean | null;
  feeEarned?: number | null;
  agentRef?: string | null;
  /** B2B customer's order no. — shown as the reference when there is no agent ref. */
  customerJobId?: string | null;
  bookingChannel?: string | null;
  /** Server-computed NO SHOW unlock (agent override → company default). Never derive it locally. */
  noShowAvailableFrom?: string | null;
  /** Admin unlock: lifts the 48h timelock and the ARR IN PLACE window. */
  repUnlockedAt?: string | null;
  guestSurvey?: { id: string } | null;
  fromZone?: { id: string; name: string } | null;
  toZone?: { id: string; name: string } | null;
  jobExtras?: { name: string; qty: number }[];
  agent?: { legalName: string } | null;
  customer?: { legalName: string } | null;
  custRepName?: string | null;
  custRepMobile?: string | null;
  custRepMeetingPoint?: string | null;
  custRepMeetingTime?: string | null;
}

export interface SupplierPortalJob extends PortalJob {
  supplierStatus: PortalJobStatus;
  supplierNotes?: string | null;
}

// ─── Notifications ──────────────────────────────────────────────
export interface PortalNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  trafficJobId?: string | null;
  /** Set for complaint events — opens that complaint. */
  complaintId?: string | null;
  trafficJob?: { internalRef: string; serviceType: string; jobDate: string } | null;
}

/** The arrival guest survey (rep app). Mirrors the backend GuestSurveyDto. */
export interface GuestSurveyInput {
  ageRange: '20-30' | '30-45' | '45-60';
  noOfAdults: number;
  noOfChildren: number;
  noOfInfants: number;
  flightNo: string;
  stayLength?: string;
  repeaterGuest: 'YES' | 'NO';
  guestNationality: string;
  localTravelAgent?: string;
  hotelName: string;
  email?: string;
  generalComment: string;
  contactNumber: string;
}

export interface GuestSurveyPayload {
  survey: (GuestSurveyInput & { id: string }) | null;
  prefill?: { flightNo?: string | null; hotelName?: string | null; paxCount?: number | null } | null;
}

// ─── Complaints ─────────────────────────────────────────────────
/**
 * A settled complaint the signed-in rep or driver was held responsible for.
 * Only terminal outcomes ever reach the portals — a dispute still being argued
 * is internal — and the claimed/conceded amounts are never sent.
 */
export interface PortalComplaint {
  id: string;
  complaintNo: string;
  subject: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'REPLIED' | 'ESCALATED' | 'WON' | 'PARTIALLY_LOST' | 'LOST' | 'CANCELLED';
  /** Still answerable (not resolved / cancelled). */
  open: boolean;
  /** Messages in this person's thread with the office. */
  messageCount: number;
  /** Open, and nothing sent yet or the office spoke last. */
  awaitingYou: boolean;
  resolvedAt: string | null;
  scorePenalty: number;
  categoryEn: string;
  categoryAr: string;
  jobRef: string;
  jobDate: string;
  serviceType: string;
  /** Set only when a charge against this person was actually posted. */
  chargedAmount: number | null;
  chargedCurrency: string | null;
}

/** A posted deduction (ComplaintCharge) against the signed-in rep or driver. */
export interface PortalDeduction {
  id: string;
  amount: number;
  currency: Currency;
  /** Why the money was taken, as entered by the office. */
  reason: string | null;
  postedAt: string | null;
  createdAt: string;
  job: { id: string; internalRef: string; jobDate: string; serviceType: string };
  complaintNo: string | null;
  complaintSubject: string | null;
  categoryEn: string | null;
  categoryAr: string | null;
}

// ─── Guest Booking ──────────────────────────────────────────────
export interface BookingExtras {
  boosterSeatQty: number;
  babySeatQty: number;
  wheelChairQty: number;
}

export interface QuoteRequest {
  serviceType: ServiceType;
  originAirportId?: string;
  originZoneId?: string;
  originHotelId?: string;
  destinationAirportId?: string;
  destinationZoneId?: string;
  destinationHotelId?: string;
  vehicleTypeId: string;
  paxCount: number;
}

export interface QuoteResponse {
  price: number;
  currency: Currency;
  breakdown?: Record<string, unknown>;
}

export interface CreateGuestBooking {
  serviceType: ServiceType;
  originAirportId?: string;
  originZoneId?: string;
  originHotelId?: string;
  destinationAirportId?: string;
  destinationZoneId?: string;
  destinationHotelId?: string;
  vehicleTypeId: string;
  jobDate: string;
  pickupTime?: string;
  paxCount: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCountry?: string;
  flightNo?: string;
  carrier?: string;
  terminal?: string;
  extras?: BookingExtras;
  notes?: string;
  paymentMethod: B2CPaymentMethod;
  paymentGateway?: B2CPaymentGateway;
}

export interface GuestBooking {
  id: string;
  bookingRef: string;
  status: GuestBookingStatus;
  serviceType: ServiceType;
  jobDate: string;
  pickupTime: string | null;
  paxCount: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  price: number;
  currency: Currency;
  paymentStatus: B2CPaymentStatus;
  paymentMethod: B2CPaymentMethod;
  originAirport?: Airport;
  originZone?: Zone;
  originHotel?: Hotel;
  destinationAirport?: Airport;
  destinationZone?: Zone;
  destinationHotel?: Hotel;
  vehicleType?: VehicleType;
  createdAt: string;
}

// ─── API Response ───────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Driver Profile ─────────────────────────────────────────────
export interface DriverProfile {
  id: string;
  name: string;
  mobileNumber: string;
  licenseNumber: string | null;
  licenseExpiryDate?: string | null;
  isActive?: boolean;
  /** The API sends `driverVehicles` (current assignments); `vehicles` kept for older builds. */
  driverVehicles?: { id: string; vehicle: Vehicle }[];
  vehicles?: (DriverVehicle & { vehicle: Vehicle })[];
}

// ─── Rep Profile ────────────────────────────────────────────────
export interface RepProfile {
  id: string;
  name: string;
  mobileNumber: string;
  /** Prisma Decimal — arrives as a string. */
  feePerFlight: number | string;
  isActive?: boolean;
  createdAt?: string;
  /** The API sends `repZones`; `zones` is kept for older builds. */
  repZones?: { id: string; zone: Zone }[];
  zones?: { id: string; zone: Zone }[];
}

// ─── Supplier Profile ───────────────────────────────────────────
export interface SupplierProfile {
  id: string;
  legalName: string;
  tradeName: string;
  phone: string;
  email: string;
  vehicles: Vehicle[];
  drivers: Driver[];
}
