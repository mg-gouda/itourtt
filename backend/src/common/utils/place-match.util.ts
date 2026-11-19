// Is a Google Places result the same place as a location we have by name?
// The rules come from the 2026-11-19 location clean-up (docs/map/11-business-rules.md › Location pins),
// where a looser match had produced pins in the wrong town or abroad:
//  - names must agree (≥ 0.85 similarity on the meaningful words),
//  - Google's name must not carry an extra distinctive word ("Rixos *Radamis*" ≠ "Rixos"),
//  - the point must be in Egypt and within 100 km of the location's city.
import { haversineDistance } from '../geofence.util.js';

/** Filler words that never tell two hotels apart. Brand words (aqua, spa, beach, plaza…) are NOT here. */
const FILLER = new Set(['hotel', 'hotels', 'resort', 'resorts', 'and', 'the', 'by', 'egypt', 'red', 'sea', 'governorate', 'eg', 'of', 'at', 'a', 'hurghada']);

/** Words Google may add without making it another place. */
const DESCRIPTORS = new Set([
  'spa', 'aqua', 'park', 'aquapark', 'beach', 'villas', 'suites', 'suite', 'select', 'adults', 'adult', 'only', 'family',
  'golf', 'club', 'waterpark', 'boutique', 'palace', 'marina', 'city', 'center', 'centre', 'international', 'airport',
  'apartment', 'apartments', 'el', 'al', 'abu', 'abo', 'sharm', 'sheikh', 'makadi', 'bay', 'soma', 'sahl', 'hasheesh',
  'hashish', 'gouna', 'safaga', 'marsa', 'alam', 'luxor', 'cairo', 'road', 'giza', 'alexandria', 'dahab', 'taba',
]);

export const PIN_MATCH_MIN = 0.85;
export const PIN_MOVE_METERS = 250;
const MAX_FROM_CITY_METERS = 100_000;
const EGYPT = { latMin: 21.5, latMax: 32.0, lngMin: 24.5, lngMax: 37.0 };

/** Lower-case, accents stripped, anything that is not a letter or digit becomes a space. */
export function normalizePlaceName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Key for duplicate detection: "Cook's Club, El Gouna" and "cooks club el gouna" collide. */
export function placeNameKey(s: string | null | undefined): string {
  return normalizePlaceName(s).replace(/\s+/g, '');
}

function words(s: string): Set<string> {
  return new Set(normalizePlaceName(s).split(' ').filter((w) => w.length > 1 && !FILLER.has(w)));
}

/** 0..1 — Ratcliff/Obershelp ratio, the same measure Python's difflib uses. */
function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const match = (x: string, y: string): number => {
    let best = 0, bi = 0, bj = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < y.length; j++) {
        let k = 0;
        while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
        if (k > best) { best = k; bi = i; bj = j; }
      }
    }
    if (!best) return 0;
    return best + match(x.slice(0, bi), y.slice(0, bj)) + match(x.slice(bi + best), y.slice(bj + best));
  };
  return (2 * match(a, b)) / (a.length + b.length);
}

/** How alike two place names are (0..1), ignoring filler words and word order. */
export function placeNameSimilarity(a: string, b: string): number {
  const wa = words(a), wb = words(b);
  if (!wa.size || !wb.size) return ratio(normalizePlaceName(a), normalizePlaceName(b));
  const common = [...wa].filter((w) => wb.has(w)).length;
  const contain = common / Math.min(wa.size, wb.size);
  const jaccard = common / new Set([...wa, ...wb]).size;
  const seq = ratio([...wa].sort().join(' '), [...wb].sort().join(' '));
  return Math.round(Math.max(seq, 0.5 * contain + 0.5 * jaccard) * 1000) / 1000;
}

/** Distinctive words in Google's name that ours lacks (e.g. "radamis"). */
export function extraPlaceWords(ours: string, theirs: string): string[] {
  const mine = words(ours);
  const glued = normalizePlaceName(ours).replace(/\s+/g, '');
  return [...words(theirs)].filter(
    (w) => !mine.has(w) && !DESCRIPTORS.has(w) && !glued.includes(w) && ![...mine].some((m) => ratio(w, m) >= 0.8),
  );
}

export function inEgypt(lat: number, lng: number): boolean {
  return lat >= EGYPT.latMin && lat <= EGYPT.latMax && lng >= EGYPT.lngMin && lng <= EGYPT.lngMax;
}

export interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

/**
 * The best candidate and whether it is safe to use for a location called `name`.
 * `city` is the location's city point, when known.
 */
export function judgePlaceMatch(
  name: string,
  candidates: PlaceCandidate[],
  city?: { lat: number; lng: number } | null,
): { best: PlaceCandidate | null; similarity: number; ok: boolean; reason: string | null } {
  const usable = candidates.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (!usable.length) return { best: null, similarity: 0, ok: false, reason: 'Google found nothing' };
  const best = usable.reduce((a, b) => (placeNameSimilarity(name, b.name) > placeNameSimilarity(name, a.name) ? b : a));
  const similarity = placeNameSimilarity(name, best.name);
  const extra = extraPlaceWords(name, best.name);
  let reason: string | null = null;
  if (!inEgypt(best.lat, best.lng)) reason = `Google's match "${best.name}" is outside Egypt`;
  else if (city && haversineDistance(city.lat, city.lng, best.lat, best.lng) > MAX_FROM_CITY_METERS)
    reason = `Google's match "${best.name}" is far from the city`;
  else if (extra.length) reason = `Google's match "${best.name}" looks like another place (${extra.join(', ')})`;
  else if (similarity < PIN_MATCH_MIN) reason = `Google's best match "${best.name}" does not clearly match`;
  return { best, similarity, ok: reason === null, reason };
}
