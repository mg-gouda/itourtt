// Notes → Marsa Alam route, server side. Same rule as frontend/src/lib/rmf-hotel-match.ts (keep the
// two in step): the RMF hotel list (table rmf_hotels) names hotels north / south of RMF airport and in
// the deep south; when free text (job notes, hotel name) names one, the job's leg goes to that
// hotel's area route (ARR / DEP / GOING TRIP / RETURN TRIP). Business rules › Traffic Cover notes.

export interface RmfHotelLike {
  routeArea: string;
  matchWords: string;
  excludeWords?: string | null;
  isActive: boolean;
}

/** Lower-case, accents and punctuation removed, single spaces. */
export function normText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

const alternatives = (s: string | null | undefined) =>
  (s ?? '').split(',').map((a) => normText(a)).filter(Boolean);

/** True when every word of `alt` starts some word of the normalised text. */
function altMatches(words: string[], alt: string): boolean {
  return alt.split(' ').every((w) => words.some((x) => x.startsWith(w)));
}

/** The first active hotel (list already in sortOrder) named in free text, or null. */
export function findRmfHotel<H extends RmfHotelLike>(text: string | null | undefined, hotels: H[]): H | null {
  const t = normText(text);
  if (!t) return null;
  const words = t.split(' ');
  const padded = ` ${t} `;
  for (const h of hotels) {
    if (!h.isActive) continue;
    if (alternatives(h.excludeWords).some((x) => padded.includes(` ${x}`))) continue;
    if (alternatives(h.matchWords).some((alt) => altMatches(words, alt))) return h;
  }
  return null;
}

export type Leg = 'ARR' | 'DEP' | 'GOING' | 'RETURN';
const compact = (s: string) => s.split(' | ')[0].toUpperCase().replace(/[^A-Z]/g, '');
const LEG_PREFIX: Record<Leg, string> = { ARR: 'ARR', DEP: 'DEP', GOING: 'GOINGTRIPONEWAY', RETURN: 'RETURNTRIPONEWAY' };

/** The leg a job stands for, from its service type. */
export function legOfServiceType(serviceType: string | null | undefined): Leg | null {
  switch (serviceType) {
    case 'ARR': return 'ARR';
    case 'DEP': return 'DEP';
    case 'ONE_WAY_TRANSFER': return 'GOING';
    case 'RETURN': return 'RETURN';
    default: return null;
  }
}

/** The route (by its "EN | AR" name) for a leg to an area, or undefined. */
export function areaRoute<R extends { name: string }>(routes: R[], leg: Leg, area: string): R | undefined {
  const want = LEG_PREFIX[leg] + area.toUpperCase().replace(/[^A-Z]/g, '');
  return routes.find((r) => compact(r.name) === want);
}
