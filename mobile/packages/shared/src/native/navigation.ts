import { Linking, Platform, Alert } from 'react-native';

/**
 * Tap-to-navigate for the rep / driver apps: opens the Google Maps app on a
 * job's origin or destination with turn-by-turn navigation already started.
 *
 * Target precedence mirrors the web portal (frontend/src/lib/maps-nav.ts):
 *   exact pickup/drop-off point → airport → hotel → zone → legacy from/to zone.
 * Coordinates navigate to the exact point; a location without them falls back
 * to a place-name search, so the link works before a location is geocoded.
 */

type Coord = string | number | null | undefined;

interface NavPlace {
  name?: string | null;
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

export type RouteEnd = 'origin' | 'destination';

function point(lat: Coord, lng: Coord): string | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) {
    return null;
  }
  return `${a},${b}`;
}

function placeTarget(place: NavPlace, kind: 'airport' | 'hotel' | 'zone'): string | null {
  const exact = point(place.latitude, place.longitude);
  if (exact) return exact;
  const name = place.name?.trim();
  if (!name) return null;
  if (kind === 'airport') return /airport|مطار/i.test(name) ? name : `${name} Airport`;
  if (kind === 'hotel' && place.address?.trim()) return `${name}, ${place.address.trim()}`;
  return `${name}, Egypt`;
}

/** The lat,lng or search text Google Maps should navigate to, or null. */
export function navTarget(job: NavJob, end: RouteEnd): string | null {
  const o = end === 'origin';
  const exact = o ? point(job.pickupLat, job.pickupLng) : point(job.dropoffLat, job.dropoffLng);
  if (exact) return exact;
  const airport = o ? job.originAirport : job.destinationAirport;
  if (airport) return placeTarget(airport, 'airport');
  const hotel = o ? job.originHotel : job.destinationHotel;
  if (hotel) return placeTarget(hotel, 'hotel') ?? (hotel.zone ? placeTarget(hotel.zone, 'zone') : null);
  const zone = (o ? job.originZone : job.destinationZone) ?? (o ? job.fromZone : job.toZone);
  if (zone) return placeTarget(zone, 'zone');
  return null;
}

/** Universal Google Maps directions link with navigation started. */
export function googleMapsNavUrl(target: string): string {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&destination=${encodeURIComponent(target)}` +
    '&travelmode=driving&dir_action=navigate'
  );
}

/**
 * Open Google Maps navigating to one end of a job.
 * Android: the `google.navigation:` intent starts turn-by-turn in the Google
 * Maps app directly. iOS, or Android without Google Maps: the universal link,
 * which hands off to the app when installed and opens maps in the browser
 * otherwise.
 */
export async function openJobNavigation(job: NavJob, end: RouteEnd): Promise<void> {
  const target = navTarget(job, end);
  if (!target) {
    Alert.alert('Navigation', 'No location is set for this stop.');
    return;
  }
  const universal = googleMapsNavUrl(target);
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(`google.navigation:q=${encodeURIComponent(target)}&mode=d`);
      return;
    } catch {
      /* Google Maps not installed — fall through to the universal link */
    }
  }
  try {
    await Linking.openURL(universal);
  } catch {
    Alert.alert('Navigation', 'Unable to open Google Maps.');
  }
}

/** True when the job end resolves to somewhere navigable. */
export function canNavigate(job: NavJob, end: RouteEnd): boolean {
  return navTarget(job, end) !== null;
}
