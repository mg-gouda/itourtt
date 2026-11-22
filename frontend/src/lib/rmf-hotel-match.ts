// Notes → Marsa Alam route. The hotel list is kept in System Parameters › Routes › RMF Hotels
// (table rmf_hotels: North / South of RMF airport, Deep South). Traffic Cover loads it and, when a
// row's Notes name one of those hotels, sets the row's route to that hotel's area for the row's leg
// (ARR / DEP / GOING TRIP / RETURN TRIP). Business rules › Traffic Cover notes → Marsa Alam route.

export type RmfSection = "NORTH" | "SOUTH" | "DEEP_SOUTH";

export interface RmfHotel {
  id: string;
  name: string;
  section: RmfSection;
  /** Route area: NORTH-MARSA ALAM / SOUTH MARSA ALAM / SHAMS ALAM / WADI LAHMI. */
  routeArea: string;
  /** Comma-separated alternatives; one matches when each of its words starts a word of the notes. */
  matchWords: string;
  /** Comma-separated words or phrases; when one is in the notes, the hotel does not match. */
  excludeWords?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export const RMF_SECTIONS: { key: RmfSection; label: string; area: string }[] = [
  { key: "NORTH", label: "North of RMF", area: "NORTH-MARSA ALAM" },
  { key: "SOUTH", label: "South of RMF", area: "SOUTH MARSA ALAM" },
  { key: "DEEP_SOUTH", label: "Deep South", area: "SHAMS ALAM" },
];

export const RMF_AREAS = ["NORTH-MARSA ALAM", "SOUTH MARSA ALAM", "SHAMS ALAM", "WADI LAHMI"];

/** Lower-case, accents and punctuation removed, single spaces ("Mövenpick El-Quseir 5*" → "movenpick el quseir 5"). */
export function normText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();
}

const alternatives = (s: string | null | undefined) =>
  (s ?? "").split(",").map((a) => normText(a)).filter(Boolean);

/** True when every word of `alt` starts some word of the normalised text. */
function altMatches(words: string[], alt: string): boolean {
  return alt.split(" ").every((w) => words.some((x) => x.startsWith(w)));
}

/** The first active hotel (by sortOrder) named in free text (job notes), or null. */
export function findRmfHotel(text: string | null | undefined, hotels: RmfHotel[]): RmfHotel | null {
  const t = normText(text);
  if (!t) return null;
  const words = t.split(" ");
  const padded = ` ${t} `;
  for (const h of hotels) {
    if (!h.isActive) continue;
    if (alternatives(h.excludeWords).some((x) => padded.includes(` ${x}`))) continue;
    if (alternatives(h.matchWords).some((alt) => altMatches(words, alt))) return h;
  }
  return null;
}

type Leg = "ARR" | "DEP" | "GOING" | "RETURN";
const compact = (s: string) => s.split(" | ")[0].toUpperCase().replace(/[^A-Z]/g, "");
const LEG_PREFIX: Record<Leg, string> = { ARR: "ARR", DEP: "DEP", GOING: "GOINGTRIPONEWAY", RETURN: "RETURNTRIPONEWAY" };

/** The leg a row stands for: its current route's prefix first, else its service type. */
export function legOf(routeName: string | undefined, serviceType: string | undefined): Leg | null {
  const c = routeName ? compact(routeName) : "";
  if (c.startsWith("ARR")) return "ARR";
  if (c.startsWith("DEP")) return "DEP";
  if (c.startsWith("GOINGTRIP")) return "GOING";
  if (c.startsWith("RETURNTRIP")) return "RETURN";
  switch (serviceType) {
    case "ARR": return "ARR";
    case "DEP": return "DEP";
    case "ONE_WAY_TRANSFER": return "GOING";
    case "RETURN": return "RETURN";
    default: return null;
  }
}

/** The system route (by its "EN | AR" name) for a leg to an area, or undefined. */
export function areaRoute<R extends { id: string; name: string }>(routes: R[], leg: Leg, area: string): R | undefined {
  const want = LEG_PREFIX[leg] + area.toUpperCase().replace(/[^A-Z]/g, "");
  return routes.find((r) => compact(r.name) === want);
}
