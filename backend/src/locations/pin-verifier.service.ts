import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { GeocodingService } from '../common/geocoding.service.js';
import { haversineDistance } from '../common/geofence.util.js';
import { judgePlaceMatch, PIN_MOVE_METERS, type PlaceCandidate } from '../common/utils/place-match.util.js';

/** Hotel.pinStatus values. */
export type PinStatus = 'VERIFIED' | 'CORRECTED' | 'REVIEW' | 'MANUAL';

export interface PinCheckResult {
  status: PinStatus | 'SKIPPED';
  note: string | null;
  candidates: PlaceCandidate[];
}

const NIGHTLY_BATCH = 150;

/**
 * Keeps hotel GPS pins right (rules: docs/map/11-business-rules.md › Location pins). A wrong pin
 * blocks reps/drivers at the geofence, so every new or renamed hotel is checked against Google:
 *
 * - Google's match agrees with the name (common/utils/place-match.util.ts) and the pin is within
 *   250 m → VERIFIED; more than 250 m away or missing → the pin is moved → CORRECTED.
 * - No confident match → REVIEW: nothing is changed, the Locations page flags the hotel.
 * - A pin someone set by hand (MANUAL) is never moved and never re-checked.
 *
 * Checks run after create / rename / zone change / Excel import, and nightly for anything new.
 * Never throws: a Google outage must not break saving a hotel.
 */
@Injectable()
export class PinVerifierService {
  private readonly logger = new Logger(PinVerifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  async verifyHotel(hotelId: string): Promise<PinCheckResult> {
    try {
      const h = await this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: {
          id: true, name: true, latitude: true, longitude: true, placeId: true, pinStatus: true, deletedAt: true,
          zone: { select: { name: true, latitude: true, longitude: true, city: { select: { name: true, latitude: true, longitude: true } } } },
        },
      });
      if (!h || h.deletedAt || h.pinStatus === 'MANUAL') return { status: 'SKIPPED', note: null, candidates: [] };

      const point = (lat: unknown, lng: unknown) =>
        lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
      const zonePt = point(h.zone?.latitude, h.zone?.longitude);
      const cityPt = point(h.zone?.city?.latitude, h.zone?.city?.longitude);
      const candidates = await this.geocoding.searchPlaces(
        [h.name, h.zone?.name, h.zone?.city?.name, 'Egypt'].filter(Boolean).join(', '),
        'hotel',
        zonePt ?? cityPt ?? undefined,
      );
      const verdict = judgePlaceMatch(h.name, candidates, cityPt);
      const now = new Date();

      if (!verdict.ok || !verdict.best) {
        const note = verdict.reason ?? 'No confident Google match';
        await this.prisma.hotel.update({ where: { id: h.id }, data: { pinStatus: 'REVIEW', pinNote: note, pinCheckedAt: now } });
        return { status: 'REVIEW', note, candidates };
      }

      const best = verdict.best;
      const stored = point(h.latitude, h.longitude);
      const moved = stored ? haversineDistance(stored.lat, stored.lng, best.lat, best.lng) : null;
      if (stored && moved !== null && moved <= PIN_MOVE_METERS) {
        await this.prisma.hotel.update({
          where: { id: h.id },
          data: { pinStatus: 'VERIFIED', pinNote: null, pinCheckedAt: now, ...(h.placeId ? {} : { placeId: best.placeId }) },
        });
        return { status: 'VERIFIED', note: null, candidates };
      }

      const note = stored
        ? `Moved ${(moved! / 1000).toFixed(1)} km to Google's "${best.name}"`
        : `Pin added from Google's "${best.name}"`;
      await this.prisma.hotel.update({
        where: { id: h.id },
        data: { latitude: best.lat, longitude: best.lng, placeId: best.placeId, pinStatus: 'CORRECTED', pinNote: note, pinCheckedAt: now },
      });
      this.logger.log(`Hotel pin ${h.name}: ${note}`);
      return { status: 'CORRECTED', note, candidates };
    } catch (e: any) {
      this.logger.warn(`Pin check failed for hotel ${hotelId}: ${e?.message}`);
      return { status: 'SKIPPED', note: e?.message ?? null, candidates: [] };
    }
  }

  /** Fire-and-forget form for save paths. */
  verifyLater(hotelId: string) {
    void this.verifyHotel(hotelId);
  }

  /** Mark a pin as set by hand: it is trusted from now on and never moved. */
  async markManual(hotelId: string) {
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: { pinStatus: 'MANUAL', pinNote: 'Pin set by hand', pinCheckedAt: new Date() },
    });
  }

  /** Nightly: hotels never checked, or changed since their last check (manual pins excluded). */
  @Cron('30 3 * * *', { timeZone: 'Africa/Cairo' })
  async nightly() {
    // Single-replica guard (see Scheduled work in 11-business-rules.md): every pod fires the cron;
    // the unique (jobName, runDate) row lets only the first one run, so Google is paid once.
    const cairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const runDate = new Date(Date.UTC(cairo.getFullYear(), cairo.getMonth(), cairo.getDate()));
    try {
      await this.prisma.cronRunLock.create({ data: { jobName: 'hotel-pin-check', runDate } });
    } catch {
      return; // another replica has it
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM hotels
      WHERE deleted_at IS NULL AND is_active = true AND (pin_status IS NULL OR pin_status <> 'MANUAL')
        AND (pin_checked_at IS NULL OR updated_at > pin_checked_at + interval '1 minute')
      ORDER BY created_at DESC
      LIMIT ${NIGHTLY_BATCH}`;
    const tally: Record<string, number> = {};
    for (const r of rows) {
      const res = await this.verifyHotel(r.id);
      tally[res.status] = (tally[res.status] || 0) + 1;
    }
    if (rows.length) this.logger.log(`Nightly hotel pin check: ${JSON.stringify(tally)}`);
  }
}
