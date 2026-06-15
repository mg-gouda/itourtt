import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service.js';
import { PublicApiService } from './public-api.service.js';
import type { AiSearchRequestDto } from './dto/ai-search.dto.js';

interface AirportEntry { id: string; name: string; code: string; sideZoneId: string | null }
interface ZoneEntry { id: string; name: string; cityName: string }
interface HotelEntry { id: string; name: string; zoneId: string; zoneName: string }

interface Catalog {
  airports: AirportEntry[];
  zones: ZoneEntry[];
  hotels: HotelEntry[];
}

// A concrete priced-route candidate (one of possibly several name matches).
interface RouteCombo {
  fromZoneId: string;
  toZoneId: string;
  originAirportId?: string;
  destinationAirportId?: string;
  hotelId?: string;
  hotelName?: string;
  fromPlaceName: string;
  toPlaceName: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VehicleOption = any; // shape from PublicApiService.getVehicleQuotes().options
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtraItem = any; // shape from PublicApiService.getExtras()

interface PricedRoute {
  serviceType: string;
  combo: RouteCombo;
  options: VehicleOption[];
}

// The evolving booking the model maintains across turns (echoed by the client).
export interface Draft {
  serviceType?: 'ARR' | 'DEP' | 'CITY_TO_CITY' | null;
  originName?: string | null;
  destinationName?: string | null;
  jobDate?: string | null;
  pickupTime?: string | null;
  paxCount?: number | null;
  roundTrip?: boolean;
  returnDate?: string | null;
  returnTime?: string | null;
  vehicleTypeName?: string | null;
  flightNo?: string | null;
  carrier?: string | null;
  terminal?: string | null;
  returnFlightNo?: string | null;
  returnCarrier?: string | null;
  returnTerminal?: string | null;
  extras?: { name: string; qty: number }[];
  confirmed?: boolean;
}

interface ModelResponse {
  status: 'collecting' | 'ready' | 'off_topic';
  reply?: string;
  draft?: Draft;
}

/**
 * Conversational booking agent for the public B2C site. It runs the whole of the
 * first two funnel steps in chat — resolves the route, lets the guest pick a
 * vehicle, collects flight details, offers extras with prices — then hands a
 * fully-resolved booking to the normal /book/details page.
 *
 * Grounded ONLY in our own catalog + live pricing; no tools / no web access, so
 * it cannot fetch competitor rates or answer off-topic questions. Prices and the
 * final vehicle/extras are always resolved server-side, never trusted from the LLM.
 */
@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly publicApiService: PublicApiService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async handle(dto: AiSearchRequestDto) {
    if (!this.genAI) {
      return { intent: 'error', reply: 'AI mode is temporarily unavailable. Please use the standard search.' };
    }

    const catalog = await this.buildCatalog();
    const extras = await this.publicApiService.getExtras();
    const incoming: Draft = (dto.draft as Draft) ?? {};

    // Resolve + price the route from the draft we already have, so the model can
    // present real vehicles/prices this turn.
    const priced = await this.resolvePricedRoute(incoming, catalog);

    const system = this.buildSystemInstruction(catalog, incoming, priced, extras, dto.locale);

    let parsed: ModelResponse;
    try {
      parsed = await this.callGemini(system, dto.messages);
    } catch (err: any) {
      this.logger.error(`Gemini error: ${err?.message}`);
      const busy = err?.message?.includes('429') || err?.message?.includes('RATE_LIMIT');
      return {
        intent: 'error',
        reply: busy
          ? 'The assistant is busy right now — please try again in a moment.'
          : "Sorry, I couldn't process that. Please rephrase or use the standard search.",
      };
    }

    const draft: Draft = parsed.draft ?? incoming;

    if (parsed.status === 'off_topic') {
      return { intent: 'off_topic', reply: parsed.reply || 'I can only help with Transfera transfer bookings.', draft };
    }

    if (parsed.status !== 'ready') {
      return { intent: 'collecting', reply: parsed.reply || 'Could you tell me a bit more?', draft };
    }

    // ── status === 'ready': validate everything and build the final booking ──
    const collecting = (reply: string) => ({ intent: 'collecting', reply, draft });

    const finalRoute = await this.resolvePricedRoute(draft, catalog);
    if (!finalRoute) {
      return collecting("I couldn't pin down the pickup or destination. Could you confirm the airport/area or hotel?");
    }
    if (!finalRoute.options.length) {
      return collecting(`Sorry, we don't currently price ${finalRoute.combo.fromPlaceName} → ${finalRoute.combo.toPlaceName}. Could you try a nearby area, or contact support@transfera.ae?`);
    }
    if (!draft.jobDate || !draft.pickupTime || !draft.paxCount || draft.paxCount < 1) {
      return collecting('I just need the travel date, pickup time and number of passengers.');
    }

    const opt = finalRoute.options.find(
      (o) => String(o.vehicleTypeName).toLowerCase() === String(draft.vehicleTypeName ?? '').toLowerCase(),
    );
    if (!opt) {
      const names = finalRoute.options.map((o) => `${o.vehicleTypeName} (${o.currency} ${o.price})`).join(', ');
      return collecting(`Which vehicle would you like? Available: ${names}.`);
    }

    if (finalRoute.serviceType !== 'CITY_TO_CITY' && !draft.flightNo) {
      return collecting('What is your flight number? I need it to complete an airport transfer.');
    }
    if (draft.roundTrip && (!draft.returnDate || !draft.returnTime)) {
      return collecting('For the return leg, what date and time should the driver pick you up?');
    }

    // Map chosen extras (by name) to catalog ids; validate seat capacity + vehicle restriction.
    const mapped = this.mapExtras(draft.extras ?? [], extras, opt.vehicleTypeId);
    if (mapped.invalidName) {
      return collecting(`I couldn't find the extra "${mapped.invalidName}". Available extras: ${extras.map((e: ExtraItem) => e.name).join(', ')}.`);
    }
    if (mapped.violationName) {
      return collecting(`"${mapped.violationName}" isn't available on the ${opt.vehicleTypeName}. Pick a different vehicle or drop that extra.`);
    }
    if (draft.paxCount + mapped.seatUnits > Number(opt.seatCapacity)) {
      return collecting(`The ${opt.vehicleTypeName} seats ${opt.seatCapacity}; ${draft.paxCount} passengers plus the seat-occupying extras won't fit. Please choose a larger vehicle.`);
    }

    return {
      intent: 'complete',
      reply: parsed.reply || 'All set — taking you to the final step to enter your details.',
      query: {
        serviceType: finalRoute.serviceType,
        fromZoneId: finalRoute.combo.fromZoneId,
        toZoneId: finalRoute.combo.toZoneId,
        originAirportId: finalRoute.combo.originAirportId ?? '',
        destinationAirportId: finalRoute.combo.destinationAirportId ?? '',
        hotelId: finalRoute.combo.hotelId ?? '',
        hotelName: finalRoute.combo.hotelName ?? '',
        fromPlaceName: finalRoute.combo.fromPlaceName,
        toPlaceName: finalRoute.combo.toPlaceName,
        jobDate: draft.jobDate,
        pickupTime: draft.pickupTime,
        paxCount: draft.paxCount,
        roundTrip: finalRoute.serviceType === 'ARR' ? !!draft.roundTrip : false,
        returnDate: draft.returnDate ?? '',
        returnTime: draft.returnTime ?? '',
        // Vehicle + quote (mirrors book-client selectVehicle()).
        vehicleTypeId: opt.vehicleTypeId,
        vehicleTypeName: opt.vehicleTypeName,
        quotePrice: Number(opt.price),
        quoteCurrency: opt.currency,
        seatCapacity: Number(opt.seatCapacity),
        driverTip: Number(opt.driverTip ?? 0),
        returnQuotePrice: draft.roundTrip ? (opt.returnPrice ?? null) : null,
        // Flight (airport transfers).
        flightNo: draft.flightNo ?? '',
        carrier: draft.carrier ?? '',
        terminal: draft.terminal ?? '',
        returnFlightNo: draft.roundTrip ? (draft.returnFlightNo ?? '') : '',
        returnCarrier: draft.roundTrip ? (draft.returnCarrier ?? '') : '',
        returnTerminal: draft.roundTrip ? (draft.returnTerminal ?? '') : '',
        customExtras: mapped.customExtras,
      },
    };
  }

  // ─── Catalog ──────────────────────────────────────────────

  private async buildCatalog(): Promise<Catalog> {
    const airportsRaw = await this.prisma.airport.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        code: true,
        cities: {
          where: { deletedAt: null },
          select: { zones: { where: { deletedAt: null }, select: { id: true, name: true } } },
        },
      },
    });

    const priceCounts = await this.prisma.publicPriceItem.groupBy({
      by: ['fromZoneId'],
      _count: { fromZoneId: true },
    });
    const fromCount = new Map<string, number>(priceCounts.map((p) => [p.fromZoneId, p._count.fromZoneId]));

    const airports: AirportEntry[] = airportsRaw.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      sideZoneId: this.pickAirportSideZone(a.name, a.cities.flatMap((c) => c.zones), fromCount),
    }));

    const zonesRaw = await this.prisma.zone.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, city: { select: { name: true } } },
    });
    const zones: ZoneEntry[] = zonesRaw.map((z) => ({ id: z.id, name: z.name, cityName: z.city.name }));

    const hotelsRaw = await this.prisma.hotel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, zoneId: true, zone: { select: { name: true } } },
    });
    const hotels: HotelEntry[] = hotelsRaw.map((h) => ({ id: h.id, name: h.name, zoneId: h.zoneId, zoneName: h.zone.name }));

    return { airports, zones, hotels };
  }

  private pickAirportSideZone(
    airportName: string,
    zones: { id: string; name: string }[],
    fromCount: Map<string, number>,
  ): string | null {
    if (!zones.length) return null;

    const priced = zones
      .map((z) => ({ id: z.id, count: fromCount.get(z.id) ?? 0 }))
      .filter((z) => z.count > 0)
      .sort((a, b) => b.count - a.count);
    if (priced.length) return priced[0].id;

    const airWords = airportName.toLowerCase().split(/\s+/);
    const scored = zones.map((z) => {
      if (z.name.toLowerCase() === airportName.toLowerCase()) return { id: z.id, score: 9999 };
      const zWords = z.name.toLowerCase().split(/\s+/);
      return { id: z.id, score: airWords.filter((w) => zWords.includes(w)).length };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  // ─── Route resolution + pricing ───────────────────────────

  // Resolve the draft's route to a priced combo (the first candidate that has
  // vehicle prices). Returns null when there isn't enough to resolve a route.
  private async resolvePricedRoute(draft: Draft, catalog: Catalog): Promise<PricedRoute | null> {
    if (!draft.serviceType || !draft.originName || !draft.destinationName || !draft.paxCount || draft.paxCount < 1) {
      return null;
    }
    const resolved = this.resolveQuery(
      {
        serviceType: draft.serviceType,
        originName: draft.originName,
        destinationName: draft.destinationName,
        paxCount: draft.paxCount,
      },
      catalog,
    );
    if (resolved.error || !resolved.combos?.length) return null;

    let firstCombo: RouteCombo | null = null;
    for (const c of resolved.combos) {
      if (!firstCombo) firstCombo = c;
      const quotes = await this.publicApiService.getVehicleQuotes({
        serviceType: resolved.serviceType!,
        fromZoneId: c.fromZoneId,
        toZoneId: c.toZoneId,
        paxCount: draft.paxCount,
      });
      if (quotes.options.length) {
        return { serviceType: resolved.serviceType!, combo: c, options: quotes.options };
      }
    }
    // Route names resolved but nothing priced — report the first candidate empty.
    return { serviceType: resolved.serviceType!, combo: firstCombo!, options: [] };
  }

  private resolveQuery(
    q: { serviceType: string; originName: string; destinationName: string; paxCount: number },
    catalog: Catalog,
  ): { error?: string; serviceType?: string; combos?: RouteCombo[] } {
    const serviceType = q.serviceType;
    const CAP = 8;

    if (serviceType === 'ARR') {
      const airport = this.matchAirport(q.originName, catalog);
      if (!airport?.sideZoneId) return { error: 'airport' };
      const dests = this.matchPlaces(q.destinationName, catalog).slice(0, CAP);
      if (!dests.length) return { error: 'dest' };
      return {
        serviceType,
        combos: dests.map((d) => ({
          fromZoneId: airport.sideZoneId!,
          toZoneId: d.zoneId,
          originAirportId: airport.id,
          hotelId: d.hotelId,
          hotelName: d.hotelName,
          fromPlaceName: airport.name,
          toPlaceName: d.displayName,
        })),
      };
    }

    if (serviceType === 'DEP') {
      const airport = this.matchAirport(q.destinationName, catalog);
      if (!airport?.sideZoneId) return { error: 'airport' };
      const origins = this.matchPlaces(q.originName, catalog).slice(0, CAP);
      if (!origins.length) return { error: 'origin' };
      return {
        serviceType,
        combos: origins.map((o) => ({
          fromZoneId: o.zoneId,
          toZoneId: airport.sideZoneId!,
          destinationAirportId: airport.id,
          hotelId: o.hotelId,
          hotelName: o.hotelName,
          fromPlaceName: o.displayName,
          toPlaceName: airport.name,
        })),
      };
    }

    const origins = this.matchPlaces(q.originName, catalog).slice(0, CAP);
    const dests = this.matchPlaces(q.destinationName, catalog).slice(0, CAP);
    if (!origins.length || !dests.length) return { error: 'place' };
    const combos: RouteCombo[] = [];
    for (const o of origins) {
      for (const d of dests) {
        if (o.zoneId === d.zoneId) continue;
        combos.push({
          fromZoneId: o.zoneId,
          toZoneId: d.zoneId,
          hotelId: d.hotelId ?? o.hotelId,
          hotelName: d.hotelName ?? o.hotelName,
          fromPlaceName: o.displayName,
          toPlaceName: d.displayName,
        });
      }
    }
    if (!combos.length) return { error: 'same' };
    return { serviceType: 'CITY_TO_CITY', combos: combos.slice(0, 12) };
  }

  private matchAirport(name: string, catalog: Catalog): AirportEntry | null {
    const lower = (name || '').toLowerCase().trim();
    if (!lower) return null;
    return (
      catalog.airports.find((a) => a.code?.toLowerCase() === lower) ||
      catalog.airports.find((a) => a.name.toLowerCase() === lower) ||
      catalog.airports.find((a) => lower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(lower)) ||
      null
    );
  }

  private matchPlaces(
    name: string,
    catalog: Catalog,
  ): { zoneId: string; displayName: string; hotelId?: string; hotelName?: string }[] {
    const lower = (name || '').toLowerCase().trim();
    if (!lower) return [];
    const out: { zoneId: string; displayName: string; hotelId?: string; hotelName?: string }[] = [];
    const seen = new Set<string>();
    const push = (c: { zoneId: string; displayName: string; hotelId?: string; hotelName?: string }) => {
      const key = `${c.hotelId ?? ''}:${c.zoneId}`;
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    };
    for (const h of catalog.hotels) if (h.name.toLowerCase() === lower) push({ zoneId: h.zoneId, displayName: h.name, hotelId: h.id, hotelName: h.name });
    for (const z of catalog.zones) if (z.name.toLowerCase() === lower) push({ zoneId: z.id, displayName: z.name });
    for (const h of catalog.hotels) if (h.name.toLowerCase().includes(lower) || lower.includes(h.name.toLowerCase())) push({ zoneId: h.zoneId, displayName: h.name, hotelId: h.id, hotelName: h.name });
    for (const z of catalog.zones) if (z.name.toLowerCase().includes(lower) || lower.includes(z.name.toLowerCase())) push({ zoneId: z.id, displayName: z.name });
    return out;
  }

  // Map chosen extras (by name) → { extraId, qty }; collect seat usage + violations.
  private mapExtras(
    chosen: { name: string; qty: number }[],
    catalog: ExtraItem[],
    vehicleTypeId: string,
  ): { customExtras: { extraId: string; qty: number }[]; seatUnits: number; invalidName?: string; violationName?: string } {
    const customExtras: { extraId: string; qty: number }[] = [];
    let seatUnits = 0;
    for (const sel of chosen) {
      const qty = Number(sel?.qty ?? 0);
      if (!sel?.name || qty < 1) continue;
      const ex = catalog.find((e) => String(e.name).toLowerCase() === String(sel.name).toLowerCase());
      if (!ex) return { customExtras, seatUnits, invalidName: sel.name };
      const allowed: string[] = ex.allowedVehicleTypeIds ?? [];
      if (allowed.length > 0 && !allowed.includes(vehicleTypeId)) {
        return { customExtras, seatUnits, violationName: ex.name };
      }
      if (ex.occupiesSeat) seatUnits += qty;
      customExtras.push({ extraId: ex.id, qty });
    }
    return { customExtras, seatUnits };
  }

  // ─── Prompt ───────────────────────────────────────────────

  private buildSystemInstruction(
    catalog: Catalog,
    incoming: Draft,
    priced: PricedRoute | null,
    extras: ExtraItem[],
    locale?: string,
  ): string {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(new Date());

    let s = `You are the booking assistant for Transfera (transfera.ae), a private ground-transfer company in Egypt. You guide the guest through booking ONE private transfer, conversationally, one step at a time.

STRICT RULES:
- Never discuss, mention, recommend or estimate prices for any other company/app (Uber, Careem, taxis, competitors). You have no web access; never claim to look anything up online.
- Decline anything not about booking a Transfera transfer — set status "off_topic" with a brief polite redirect.
- Use ONLY the data provided below. Never invent places, vehicles, prices, or extras.
- Determine serviceType: pickup is an airport => "ARR"; destination is an airport => "DEP"; neither is an airport => "CITY_TO_CITY".
- Today is ${weekday}, ${today} (Africa/Cairo). Resolve relative dates against this. jobDate = YYYY-MM-DD, times = 24h HH:MM.
- Reply in the guest's language${locale ? ` (locale: ${locale})` : ''}. Keep replies short and friendly.

WHAT TO COLLECT, IN ORDER (ask only for what is still missing; never re-ask what is already known):
1. Pickup location, destination, travel date, pickup time, number of passengers. (Ask if it's a round trip; if yes, also collect the return date & time.)
2. Once the route + passengers are known, the AVAILABLE VEHICLES (with prices) will be listed below — present them to the guest and let them CHOOSE one by name. Do not pick for them.
3. For airport transfers (ARR/DEP): the flight number (required), plus airline and terminal if offered. For a round trip, also the return flight number.
4. Offer the AVAILABLE EXTRAS below with their prices and ask if they'd like any (with quantity). Extras are optional — the guest may say no.
5. Finally, SUMMARISE the whole booking (route, date/time, vehicle + price, extras + prices, flight, estimated total) and ask the guest to confirm. Only after they explicitly confirm, set "confirmed": true and status "ready".

`;

    // Only include the big location catalog until the route is resolved — once we
    // have a priced route, the model just needs vehicles/extras.
    if (!priced) {
      const airportLines = catalog.airports.map((a) => `- ${a.name} (${a.code})`).join('\n');
      const byCity = new Map<string, string[]>();
      for (const z of catalog.zones) {
        const arr = byCity.get(z.cityName) ?? [];
        arr.push(z.name);
        byCity.set(z.cityName, arr);
      }
      const zoneLines = [...byCity.entries()].map(([city, zs]) => `- ${city}: ${zs.join(', ')}`).join('\n');
      const hotelLines = catalog.hotels.map((h) => `- ${h.name} (area: ${h.zoneName})`).join('\n');
      s += `=== AIRPORTS ===\n${airportLines || '(none)'}\n\n=== AREAS / ZONES (by city) ===\n${zoneLines || '(none)'}\n\n=== HOTELS ===\n${hotelLines || '(none)'}\n\n`;
    } else if (priced.options.length) {
      const veh = priced.options
        .map((o) => `- ${o.vehicleTypeName}: seats ${o.seatCapacity}, ${o.currency} ${o.price}`)
        .join('\n');
      s += `CURRENT ROUTE: ${priced.combo.fromPlaceName} → ${priced.combo.toPlaceName} (${priced.serviceType})\n=== AVAILABLE VEHICLES (for ${incoming.paxCount} passengers — use the EXACT name) ===\n${veh}\n\n`;
    } else {
      s += `NOTE: We don't currently have pricing for ${priced.combo.fromPlaceName} → ${priced.combo.toPlaceName}. Ask the guest for a nearby area/airport, or suggest contacting support@transfera.ae.\n\n`;
    }

    const extraLines = extras
      .map((e) => `- ${e.name}: ${e.currency} ${e.price}${e.occupiesSeat ? ' (uses a seat)' : ''}`)
      .join('\n');
    s += `=== AVAILABLE EXTRAS (use EXACT names) ===\n${extraLines || '(none)'}\n\n`;

    s += `ALREADY COLLECTED (continue from here, do not re-ask):\n${JSON.stringify(incoming)}\n\n`;

    s += `RESPONSE FORMAT — return ONLY a JSON object, no markdown:
{
  "status": "collecting" | "ready" | "off_topic",
  "reply": "your message to the guest (always present)",
  "draft": {
    "serviceType": "ARR" | "DEP" | "CITY_TO_CITY" | null,
    "originName": "exact catalog pickup name or null",
    "destinationName": "exact catalog destination name or null",
    "jobDate": "YYYY-MM-DD or null",
    "pickupTime": "HH:MM or null",
    "paxCount": number | null,
    "roundTrip": boolean,
    "returnDate": "YYYY-MM-DD or null",
    "returnTime": "HH:MM or null",
    "vehicleTypeName": "exact vehicle name the guest chose, or null",
    "flightNo": "string or null",
    "carrier": "string or null",
    "terminal": "string or null",
    "returnFlightNo": "string or null",
    "returnCarrier": "string or null",
    "returnTerminal": "string or null",
    "extras": [ { "name": "exact extra name", "qty": number } ],
    "confirmed": boolean
  }
}
Always return the FULL draft reflecting everything known so far.`;

    return s;
  }

  // ─── Gemini call ──────────────────────────────────────────

  private async callGemini(systemInstruction: string, messages: AiSearchRequestDto['messages']): Promise<ModelResponse> {
    const model = this.genAI!.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({ contents });
    return this.parseModelResponse(result.response.text());
  }

  private parseModelResponse(raw: string): ModelResponse {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    try {
      const obj = JSON.parse(cleaned.trim());
      const status = obj?.status;
      if (status === 'collecting' || status === 'ready' || status === 'off_topic') {
        return { status, reply: obj.reply, draft: obj.draft };
      }
      return { status: 'collecting', reply: typeof obj?.reply === 'string' ? obj.reply : undefined, draft: obj?.draft };
    } catch {
      return { status: 'collecting', reply: undefined };
    }
  }
}
