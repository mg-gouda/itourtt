/**
 * Haversine distance + the rep/driver status geofence.
 *
 * Every rep/driver status update carries a mandatory GPS fix. Since 2026-11-16
 * it is ENFORCED: a fix more than the target's radius from where that status
 * happens is rejected (403). The radii are company settings, edited from
 * System Parameters › Locations: one for an airport target
 * (CompanySettings.geofenceAirportMeters) and one for anything else
 * (CompanySettings.geofenceOtherMeters) — but only when that place is a precise point (an
 * exact pickup/drop-off pin, an airport, or a hotel with coordinates). A zone
 * centroid covers a whole area, so a miss against one is logged, never blocked.
 * The per-leg admin unlock (`driverUnlockedAt` / `repUnlockedAt`) bypasses it,
 * which is the fix for a wrong location pin or a phone with a bad GPS fix.
 */
import { ForbiddenException, Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const EARTH_RADIUS_METERS = 6_371_000;

/** The two geofence radii, in metres. */
export interface GeofenceRadii {
  airportMeters: number;
  otherMeters: number;
}

/**
 * Only used when no company_settings row exists yet; mirrors the column
 * defaults. The live values are read from CompanySettings on every check.
 */
export const DEFAULT_GEOFENCE_RADII: GeofenceRadii = { airportMeters: 2000, otherMeters: 600 };

/** The configured radii (System Parameters › Locations). */
export async function getGeofenceRadii(prisma: PrismaService): Promise<GeofenceRadii> {
  const s = await prisma.companySettings.findFirst({
    select: { geofenceAirportMeters: true, geofenceOtherMeters: true },
  });
  return s
    ? { airportMeters: s.geofenceAirportMeters, otherMeters: s.geofenceOtherMeters }
    : DEFAULT_GEOFENCE_RADII;
}

const logger = new Logger('Geofence');

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Returns distance in meters between two lat/lng points using the Haversine formula. */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Returns true if the point (lat1, lng1) is within `radiusMeters` of (lat2, lng2). */
export function isWithinGeofence(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  radiusMeters: number,
): boolean {
  return haversineDistance(lat1, lng1, lat2, lng2) <= radiusMeters;
}

// ─── Targets ────────────────────────────────────────────────────────────────

interface GeofenceLocation {
  name?: string | null;
  latitude?: unknown;
  longitude?: unknown;
}

export interface GeofenceJob {
  serviceType: string;
  pickupLat?: unknown;
  pickupLng?: unknown;
  dropoffLat?: unknown;
  dropoffLng?: unknown;
  originAirport?: GeofenceLocation | null;
  originHotel?: (GeofenceLocation & { zone?: GeofenceLocation | null }) | null;
  originZone?: GeofenceLocation | null;
  fromZone?: GeofenceLocation | null;
  destinationAirport?: GeofenceLocation | null;
  destinationHotel?: (GeofenceLocation & { zone?: GeofenceLocation | null }) | null;
  destinationZone?: GeofenceLocation | null;
  toZone?: GeofenceLocation | null;
}

export interface GeofenceTarget {
  lat: number;
  lng: number;
  /** Human name for the error message ("Hurghada International Airport"). */
  label: string;
  /** A point (pin / airport / hotel) — enforceable. False for a zone centroid. */
  precise: boolean;
  /** Airport targets use the airport radius; everything else the other one. */
  isAirport: boolean;
}

function toCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return null;
  return { lat: a, lng: b };
}

function fromLocation(
  loc: GeofenceLocation | null | undefined,
  precise: boolean,
  fallbackLabel: string,
  isAirport = false,
): GeofenceTarget | null {
  if (!loc) return null;
  const c = toCoord(loc.latitude, loc.longitude);
  return c ? { ...c, label: loc.name || fallbackLabel, precise, isAirport } : null;
}

const fromAirport = (loc: GeofenceLocation | null | undefined) =>
  fromLocation(loc, true, 'the airport', true);

/**
 * One end of a job: exact pin → airport → hotel → zone (→ hotel's zone →
 * legacy from/to zone). The first three are precise; zones are not.
 */
function resolveEnd(job: GeofenceJob, end: 'origin' | 'destination'): GeofenceTarget | null {
  const o = end === 'origin';
  const pin = o ? toCoord(job.pickupLat, job.pickupLng) : toCoord(job.dropoffLat, job.dropoffLng);
  if (pin)
    return {
      ...pin,
      label: o ? 'the pickup point' : 'the drop-off point',
      precise: true,
      isAirport: false,
    };

  const airport = o ? job.originAirport : job.destinationAirport;
  const hotel = o ? job.originHotel : job.destinationHotel;
  const zone = o ? job.originZone : job.destinationZone;
  const legacyZone = o ? job.fromZone : job.toZone;

  return (
    fromAirport(airport) ??
    fromLocation(hotel, true, 'the hotel') ??
    fromLocation(zone, false, 'the zone') ??
    fromLocation(hotel?.zone, false, 'the zone') ??
    fromLocation(legacyZone, false, 'the zone')
  );
}

/**
 * Where a REP must be: the job's airport — arrival airport for ARR, departure
 * airport for DEP. A job with no airport (day tour, city transfer) has no rep
 * geofence.
 */
export function resolveRepGeofenceTarget(job: GeofenceJob): GeofenceTarget | null {
  return (
    fromAirport(job.originAirport) ?? fromAirport(job.destinationAirport)
  );
}

/**
 * Where a DRIVER must be for a given status: the pickup end to start the trip
 * (IN_PROGRESS) or report a NO_SHOW, the drop-off end to COMPLETE it.
 * Any other status (e.g. CANCELLED) has no geofence.
 */
export function resolveDriverGeofenceTarget(
  job: GeofenceJob,
  status: string,
): GeofenceTarget | null {
  if (status === 'COMPLETED') return resolveEnd(job, 'destination');
  if (status === 'IN_PROGRESS' || status === 'NO_SHOW') return resolveEnd(job, 'origin');
  return null;
}

// ─── Enforcement ────────────────────────────────────────────────────────────

const LOC = { select: { name: true, latitude: true, longitude: true } } as const;

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

/**
 * Reject a rep/driver status update made too far from where it happens.
 * Loads the job's locations itself so every caller checks the same thing,
 * whatever it happened to include. Call it BEFORE uploading evidence, so a
 * rejected submission never leaves orphan photos behind.
 */
export async function assertWithinGeofence(
  prisma: PrismaService,
  args: {
    jobId: string;
    role: 'DRIVER' | 'REP';
    status: string;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
  },
): Promise<void> {
  const { jobId, role, status, latitude, longitude } = args;
  if (latitude == null || longitude == null) return; // GPS is enforced by the DTO/controller

  const job = await prisma.trafficJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      internalRef: true,
      serviceType: true,
      driverUnlockedAt: true,
      repUnlockedAt: true,
      pickupLat: true,
      pickupLng: true,
      dropoffLat: true,
      dropoffLng: true,
      originAirport: LOC,
      originZone: LOC,
      originHotel: { select: { ...LOC.select, zone: LOC } },
      fromZone: LOC,
      destinationAirport: LOC,
      destinationZone: LOC,
      destinationHotel: { select: { ...LOC.select, zone: LOC } },
      toZone: LOC,
    },
  });
  if (!job) return; // the caller reports the missing job

  const target =
    role === 'REP' ? resolveRepGeofenceTarget(job) : resolveDriverGeofenceTarget(job, status);
  if (!target) return; // nowhere configured to check against

  const radii = await getGeofenceRadii(prisma);
  const radius = target.isAirport ? radii.airportMeters : radii.otherMeters;
  const dist = haversineDistance(latitude, longitude, target.lat, target.lng);
  if (dist <= radius) return;

  const who = role === 'REP' ? 'Rep' : 'Driver';
  const unlocked = role === 'REP' ? job.repUnlockedAt : job.driverUnlockedAt;
  const detail =
    `${who} ${status} on ${job.internalRef}: at (${latitude},${longitude}), ` +
    `${Math.round(dist)}m from ${target.label} (${target.lat},${target.lng}), limit ${radius}m`;

  if (unlocked) {
    logger.warn(`Geofence bypassed (job unlocked) — ${detail}`);
    return;
  }
  if (!target.precise) {
    logger.warn(`Geofence miss vs zone centre (not enforced) — ${detail}`);
    return;
  }

  logger.warn(`Geofence BLOCKED — ${detail}`);
  throw new ForbiddenException(
    `You are ${formatDistance(dist)} from ${target.label}. Status updates must be made within ` +
      `${formatDistance(radius)} of the job location. If you are there, move into the open ` +
      `for a better GPS signal and try again, or ask dispatch to unlock the job. ` +
      `(أنت على بُعد ${formatDistance(dist)} من الموقع — يجب تحديث الحالة ضمن ${formatDistance(radius)}، أو اطلب من التشغيل فتح المهمة.)`,
  );
}
