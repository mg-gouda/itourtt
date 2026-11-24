import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { areaRoute, findRmfHotel, legOfServiceType } from '../common/utils/rmf-hotel-match.js';

/** A job's ends (exactly one of airport / zone / hotel per side) plus what the notes rule reads. */
export interface RouteEnds {
  serviceType?: string | null;
  originAirportId?: string | null;
  originZoneId?: string | null;
  originHotelId?: string | null;
  destinationAirportId?: string | null;
  destinationZoneId?: string | null;
  destinationHotelId?: string | null;
  notes?: string | null;
}

export type RouteMatch =
  | { routeId: string; routeName: string; how: 'unique' | 'notes' }
  | { routeId: null; routeName: null; how: 'none' | 'ambiguous'; candidates?: string[]; candidateIds?: string[] };

type RouteRow = {
  id: string; name: string; defaultServiceType: string | null;
  fromAirportId: string | null; fromZoneId: string | null; toAirportId: string | null; toZoneId: string | null;
};

/**
 * Origin / destination → route (5.6.0). Online and B2C jobs come with origin/destination but no
 * route; this finds the route so the job pool and reports show one. Rules (business rules ›
 * Route from origin / destination):
 *  1. Ends: an airport counts as that airport, a zone as that zone, a hotel as its zone.
 *  2. Candidates: active routes whose default service type is the job's, whose From end equals the
 *     origin end and whose To end equals the destination end.
 *  3. One candidate → that route.
 *  4. Several → the RMF notes rule (job notes + hotel names name an RMF hotel → that area's route
 *     for the leg).
 *  5. Still several (e.g. day tours: city tour / shopping / sea trip share the same ends, 6.2.1) →
 *     the candidate whose name shares the most words with the notes, when exactly one leads.
 *     Nothing decides → no route; the form lists the candidates first for staff to pick.
 */
/** Words that say nothing about which trip it is. */
const NOISE = new Set(['the', 'and', 'with', 'way', 'two', 'one', 'from', 'to', 'trip', 'tour', 'hours', 'lunch', 'round', 'collecting']);
const wordsOf = (s: string) =>
  new Set(s.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/).filter((w) => w.length >= 3 && !NOISE.has(w)));

/** Rule 5: the one candidate whose name shares the most words with the notes (none if tied / no notes). */
function bestByNotes<T extends { name: string }>(candidates: T[], notes?: string | null): T | null {
  if (!notes?.trim()) return null;
  const said = wordsOf(notes);
  if (!said.size) return null;
  const scored = candidates
    .map((c) => ({ c, n: [...wordsOf(c.name)].filter((w) => said.has(w)).length }))
    .sort((a, b) => b.n - a.n);
  return scored[0].n > 0 && scored[0].n > (scored[1]?.n ?? 0) ? scored[0].c : null;
}

@Injectable()
export class RouteResolverService {
  private readonly logger = new Logger(RouteResolverService.name);
  private cache: {
    at: number;
    routes: RouteRow[];
    rmf: Awaited<ReturnType<RouteResolverService['loadRmf']>>;
    /** zone → the zone it "counts as" for routes (5.7.0). */
    routeZoneOf: Map<string, string>;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private loadRmf() {
    return this.prisma.rmfHotel.findMany({
      where: { isActive: true },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: { routeArea: true, matchWords: true, excludeWords: true, isActive: true },
    });
  }

  /** Routes + RMF hotels + zone mappings, cached for a minute (edits show up within that). */
  private async data() {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache;
    const [routes, rmf, mapped] = await Promise.all([
      this.prisma.jobServiceType.findMany({
        where: { isActive: true },
        select: { id: true, name: true, defaultServiceType: true, fromAirportId: true, fromZoneId: true, toAirportId: true, toZoneId: true },
      }),
      this.loadRmf(),
      this.prisma.zone.findMany({ where: { routeZoneId: { not: null } }, select: { id: true, routeZoneId: true } }),
    ]);
    const routeZoneOf = new Map(mapped.map((z) => [z.id, z.routeZoneId as string]));
    this.cache = { at: Date.now(), routes: routes as RouteRow[], rmf, routeZoneOf };
    return this.cache;
  }

  async resolve(e: RouteEnds): Promise<RouteMatch> {
    if (!e.serviceType) return { routeId: null, routeName: null, how: 'none' };
    const hotelIds = [e.originHotelId, e.destinationHotelId].filter((x): x is string => !!x);
    const hotels = hotelIds.length
      ? await this.prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, name: true, zoneId: true } })
      : [];
    const hotel = (id?: string | null) => (id ? hotels.find((h) => h.id === id) : undefined);
    const { routes, rmf, routeZoneOf } = await this.data();
    // A zone mapped "counts as" another zone uses that zone's routes.
    const asRouteZone = (z: string | null) => (z ? routeZoneOf.get(z) ?? z : null);
    const from = { airport: e.originAirportId || null, zone: asRouteZone(e.originZoneId || hotel(e.originHotelId)?.zoneId || null) };
    const to = { airport: e.destinationAirportId || null, zone: asRouteZone(e.destinationZoneId || hotel(e.destinationHotelId)?.zoneId || null) };
    if (!(from.airport || from.zone) || !(to.airport || to.zone)) return { routeId: null, routeName: null, how: 'none' };

    const endMatches = (airport: string | null, zone: string | null, end: { airport: string | null; zone: string | null }) =>
      airport ? airport === end.airport : zone ? zone === end.zone : false;
    const candidates = routes.filter(
      (r) =>
        r.defaultServiceType === e.serviceType &&
        endMatches(r.fromAirportId, r.fromZoneId, from) &&
        endMatches(r.toAirportId, r.toZoneId, to),
    );
    if (candidates.length === 1) return { routeId: candidates[0].id, routeName: candidates[0].name, how: 'unique' };

    // Several (or none) by ends: the RMF notes rule decides Marsa Alam legs.
    const leg = legOfServiceType(e.serviceType);
    const text = [e.notes, hotel(e.originHotelId)?.name, hotel(e.destinationHotelId)?.name].filter(Boolean).join(' ');
    const rmfHotel = leg ? findRmfHotel(text, rmf) : null;
    if (leg && rmfHotel) {
      const pool = candidates.length ? candidates : routes;
      const r = areaRoute(pool, leg, rmfHotel.routeArea) ?? areaRoute(routes, leg, rmfHotel.routeArea);
      if (r) return { routeId: r.id, routeName: r.name, how: 'notes' };
    }
    const byNotes = candidates.length > 1 ? bestByNotes(candidates, e.notes) : null;
    if (byNotes) return { routeId: byNotes.id, routeName: byNotes.name, how: 'notes' };
    return candidates.length
      ? {
          routeId: null, routeName: null, how: 'ambiguous',
          candidates: candidates.map((c) => c.name), candidateIds: candidates.map((c) => c.id),
        }
      : { routeId: null, routeName: null, how: 'none' };
  }

  /**
   * One-off / repeatable: give a route to online and B2C jobs from `fromDate` on that have none.
   * Returns counts; jobs nothing decides are left alone.
   */
  async backfill(fromDate: string) {
    const jobs = await this.prisma.trafficJob.findMany({
      where: {
        deletedAt: null,
        jobServiceTypeId: null,
        bookingChannel: { in: ['ONLINE', 'B2C'] },
        jobDate: { gte: new Date(fromDate) },
      },
      select: {
        id: true, serviceType: true, notes: true,
        originAirportId: true, originZoneId: true, originHotelId: true,
        destinationAirportId: true, destinationZoneId: true, destinationHotelId: true,
      },
    });
    let set = 0;
    let ambiguous = 0;
    let none = 0;
    for (const j of jobs) {
      const m = await this.resolve(j);
      if (m.routeId) {
        await this.prisma.trafficJob.update({ where: { id: j.id }, data: { jobServiceTypeId: m.routeId } });
        set++;
      } else if (m.how === 'ambiguous') ambiguous++;
      else none++;
    }
    this.logger.log(`route backfill from ${fromDate}: ${jobs.length} jobs, ${set} set, ${ambiguous} ambiguous, ${none} no match`);
    return { checked: jobs.length, set, ambiguous, noMatch: none };
  }
}
