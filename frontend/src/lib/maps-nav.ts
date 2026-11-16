/**
 * Tap-to-navigate for the rep / driver portals: turns a job's origin or
 * destination into a Google Maps link that opens the Google Maps app (on a
 * phone) with the route set and turn-by-turn navigation started.
 *
 * Target precedence for each end mirrors the label the card prints:
 *   exact pickup/drop-off point → airport → hotel → zone → legacy from/to zone.
 * A location with coordinates navigates to the exact point; one without falls
 * back to a place-name search, so the link still works before geocoding.
 */

type Coord = string | number | null | undefined;

interface NavPlace {
  name?: string | null;
  code?: string | null;
  address?: string | null;
  latitude?: Coord;
  longitude?: Coord;
  zone?: NavPlace | null;
}

export interface NavJob {
  pickupLat?: Coord;
  pickupLng?: Coord;
  dropoffLat?: Coord;
  dropoffLng?: Coord;
  originAirport?: NavPlace | null;
  originHotel?: NavPlace | null;
  originZone?: NavPlace | null;
  fromZone?: NavPlace | null;
  destinationAirport?: NavPlace | null;
  destinationHotel?: NavPlace | null;
  destinationZone?: NavPlace | null;
  toZone?: NavPlace | null;
}

export type RouteEnd = "origin" | "destination";

function point(lat: Coord, lng: Coord): string | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) {
    return null;
  }
  return `${a},${b}`;
}

function placeTarget(place: NavPlace, kind: "airport" | "hotel" | "zone"): string | null {
  const exact = point(place.latitude, place.longitude);
  if (exact) return exact;
  const name = place.name?.trim();
  if (!name) return null;
  if (kind === "airport") return /airport|مطار/i.test(name) ? name : `${name} Airport`;
  if (kind === "hotel" && place.address?.trim()) return `${name}, ${place.address.trim()}`;
  return `${name}, Egypt`;
}

/** The lat,lng or search text Google Maps should navigate to, or null. */
export function navTarget(job: NavJob, end: RouteEnd): string | null {
  const o = end === "origin";
  const exact = o ? point(job.pickupLat, job.pickupLng) : point(job.dropoffLat, job.dropoffLng);
  if (exact) return exact;
  const airport = o ? job.originAirport : job.destinationAirport;
  if (airport) return placeTarget(airport, "airport");
  const hotel = o ? job.originHotel : job.destinationHotel;
  if (hotel) return placeTarget(hotel, "hotel") ?? (hotel.zone ? placeTarget(hotel.zone, "zone") : null);
  const zone = (o ? job.originZone : job.destinationZone) ?? (o ? job.fromZone : job.toZone);
  if (zone) return placeTarget(zone, "zone");
  return null;
}

/**
 * Google Maps "directions" URL with navigation started. On Android and iOS this
 * universal link hands off to the Google Maps app when it is installed (and
 * falls back to maps in the browser when it is not); `dir_action=navigate`
 * starts turn-by-turn from the current location straight away.
 */
export function googleMapsNavUrl(target: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: target,
    travelmode: "driving",
    dir_action: "navigate",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Navigation URL for one end of a job, or null when there is nowhere to go. */
export function jobNavUrl(job: NavJob, end: RouteEnd): string | null {
  const target = navTarget(job, end);
  return target ? googleMapsNavUrl(target) : null;
}
