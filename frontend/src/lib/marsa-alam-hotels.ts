// Marsa Alam hotels → route area, from the owner's list "RMF HOTEL NEAMS.xlsx" (2026-11-21).
// NORTH = north of Marsa Alam airport (RMF), SOUTH = south of RMF up to Marsa Alam town (incl.
// Port Ghalib), SHAMS ALAM = deep south beyond Marsa Alam town, WADI LAHMI = Azur Wadi Lahmy.
// Car Dispatch reads a row's Notes: when one of these hotels is named there, the row's route is set
// to the matching ARR / DEP / GOING / RETURN route of that area (business rules › Car Dispatch).
// Patterns are lower-case regexes tested on the normalised notes; ambiguous chain names
// (Movenpick, Novotel, Three Corners, Sea World, Shams, Azur) need their Marsa Alam part.

export type MarsaAlamArea = "NORTH-MARSA ALAM" | "SOUTH MARSA ALAM" | "SHAMS ALAM" | "WADI LAHMI";

const H = (area: MarsaAlamArea, name: string, pattern: RegExp) => ({ area, name, pattern });

export const MARSA_ALAM_HOTELS = [
  // ── North of RMF ──
  H("NORTH-MARSA ALAM", "Flamenco", /flamenco/),
  H("NORTH-MARSA ALAM", "Movenpick El Quseir", /m[oö]venpick.*(quseir|qusier|quseer|kosseir)|(quseir|qusier|quseer|kosseir).*m[oö]venpick/),
  H("NORTH-MARSA ALAM", "Swiss Hotel", /\bswiss (hotel|inn)\b/),
  H("NORTH-MARSA ALAM", "Rohanou", /rohanou/),
  H("NORTH-MARSA ALAM", "Lazuli", /lazu?li/),
  H("NORTH-MARSA ALAM", "Onatti", /onatti/),
  H("NORTH-MARSA ALAM", "Sea World", /^(?!.*(aqua blu|hurghada|sahl)).*sea ?world/),
  H("NORTH-MARSA ALAM", "Novotel Marsa Alam", /novotel.*(marsa|quseir|alam)|(marsa|alam).*novotel/),
  H("NORTH-MARSA ALAM", "Utopia", /utopia/),
  H("NORTH-MARSA ALAM", "Acel Beach", /\bacel\b/),
  H("NORTH-MARSA ALAM", "Akassia", /akassia/),
  H("NORTH-MARSA ALAM", "Diamond Beach", /diamond beach/),
  H("NORTH-MARSA ALAM", "Coral Hills", /coral hil/),
  H("NORTH-MARSA ALAM", "Dreams Beach", /dreams? beach/),
  H("NORTH-MARSA ALAM", "Swiss Touches", /swiss ?touch/),
  H("NORTH-MARSA ALAM", "Three Corners Sea Beach", /three corners sea beach/),
  H("NORTH-MARSA ALAM", "Coraya", /coraya/),
  H("NORTH-MARSA ALAM", "Alaya", /\balaya\b/),
  H("NORTH-MARSA ALAM", "Lamaya", /lamaya/),
  H("NORTH-MARSA ALAM", "Jaz Solaya", /solaya/),
  H("NORTH-MARSA ALAM", "Jaz Dar El Madina", /dar ?el ?madina|dar elmadina/),
  H("NORTH-MARSA ALAM", "Jaz New Reef", /new reef/),
  H("NORTH-MARSA ALAM", "Jaz Grand Marsa", /grand marsa/),
  H("NORTH-MARSA ALAM", "Amarina Jannah", /jannah/),
  // ── South of RMF (incl. Port Ghalib) ──
  H("SOUTH MARSA ALAM", "Port Ghalib hotels", /port ?ghalib|p\.? ?ghalib|porto ghaleb|marina lodge|siva port/),
  H("SOUTH MARSA ALAM", "Three Corners Fayrouz", /fayrouz|fayrouz plaza/),
  H("SOUTH MARSA ALAM", "Costa Mares", /costa ?mares?/),
  H("SOUTH MARSA ALAM", "Jaz Amara", /\bamara\b/),
  H("SOUTH MARSA ALAM", "Jaz Riviera", /jaz riviera/),
  H("SOUTH MARSA ALAM", "Casa Mare (Tulip Royal)", /casa mare|tulip royal/),
  H("SOUTH MARSA ALAM", "Casa Blue (Tulip Magic)", /casa blue|tulip magic/),
  H("SOUTH MARSA ALAM", "El Nada", /\bel[- ]?nada\b|\bnada beach|\bbliss nada\b/),
  H("SOUTH MARSA ALAM", "Concord Moreen", /moreen/),
  H("SOUTH MARSA ALAM", "Happy Life", /happy ?life/),
  H("SOUTH MARSA ALAM", "Hilton Nubian", /\bnubian\b/),
  H("SOUTH MARSA ALAM", "El Malikia Abu Dabab", /malikia|abu dabab/),
  H("SOUTH MARSA ALAM", "Three Corners Equinox", /equ[ia]nox/),
  H("SOUTH MARSA ALAM", "Sataya", /sataya/),
  H("SOUTH MARSA ALAM", "Elphistone", /elphi?n?stone?|elphiston/),
  H("SOUTH MARSA ALAM", "Pickalbatros Villaggio", /villaggio/),
  H("SOUTH MARSA ALAM", "Pickalbatros Vita", /\bvita (resort|marsa)|albatros vita/),
  H("SOUTH MARSA ALAM", "Calimera Habiba", /habiba/),
  H("SOUTH MARSA ALAM", "Blue Reef", /blue reef/),
  H("SOUTH MARSA ALAM", "Crystal Beach", /crystal beach/),
  H("SOUTH MARSA ALAM", "Amarina Queen", /amarina queen/),
  H("SOUTH MARSA ALAM", "Brayka Bay", /brayka/),
  H("SOUTH MARSA ALAM", "Aurora", /aurora/),
  H("SOUTH MARSA ALAM", "Beach Safari", /beach safari|besch safari/),
  // ── Deep south (beyond Marsa Alam town) ──
  H("SHAMS ALAM", "True Beach", /true beach/),
  H("SHAMS ALAM", "Soulotel Dream Lagoon", /dream lagoon|soulotel/),
  H("SHAMS ALAM", "Gemma", /\bgemma\b/),
  H("SHAMS ALAM", "Sunrise Anjum", /anjum/),
  H("SHAMS ALAM", "Fantazia", /fant[a]?zia/),
  H("SHAMS ALAM", "Gorgonia", /gorgonia/),
  H("SHAMS ALAM", "Shams Alam", /shams ?alam/),
  H("WADI LAHMI", "Azur Wadi Lahmy", /wadi ?lahm/),
];

/** The first Marsa Alam hotel named in free text (notes), or null. */
export function findMarsaAlamHotel(text: string | null | undefined) {
  const t = (text ?? "").toLowerCase().replace(/[‘’`´]/g, "'").replace(/\s+/g, " ");
  if (!t.trim()) return null;
  return MARSA_ALAM_HOTELS.find((h) => h.pattern.test(t)) ?? null;
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

/** The system route (by its "EN | AR" name) for a leg to a Marsa Alam area, or undefined. */
export function marsaAlamRoute<R extends { id: string; name: string }>(routes: R[], leg: Leg, area: MarsaAlamArea): R | undefined {
  const want = LEG_PREFIX[leg] + area.replace(/[^A-Z]/g, "");
  return routes.find((r) => compact(r.name) === want);
}
