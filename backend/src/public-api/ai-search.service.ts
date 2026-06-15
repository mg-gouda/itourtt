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

// The structured query the model returns when it has enough information.
interface ModelQuery {
  serviceType: 'ARR' | 'DEP' | 'CITY_TO_CITY';
  originName: string;
  destinationName: string;
  paxCount: number;
  jobDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:MM
  roundTrip?: boolean;
  returnDate?: string;
  returnTime?: string;
}

interface ModelResponse {
  intent: 'need_info' | 'off_topic' | 'query';
  reply?: string;
  query?: ModelQuery;
}

/**
 * Conversational booking assistant for the public B2C site. Free-text guest
 * messages are turned into a structured transfer query grounded ONLY in our own
 * location catalog + pricing — the model has no tools and no web access, so it
 * cannot fetch competitor rates or answer off-topic questions.
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
    const system = this.buildSystemInstruction(catalog, dto.locale);

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

    // Conversational outcomes (ask for more info / politely decline) pass through.
    if (parsed.intent === 'off_topic') {
      return { intent: 'off_topic', reply: parsed.reply || 'I can only help with Transfera transfer bookings.' };
    }
    if (parsed.intent !== 'query' || !parsed.query) {
      return { intent: 'need_info', reply: parsed.reply || 'Could you tell me your pickup, destination, date, time and number of passengers?' };
    }

    const q = parsed.query;

    // Guard against missing essentials even if the model returned a query.
    if (!q.jobDate || !q.pickupTime || !q.paxCount || q.paxCount < 1) {
      return {
        intent: 'need_info',
        reply: parsed.reply || 'I just need the travel date, pickup time and number of passengers to search.',
      };
    }

    // Resolve names to candidate routes. Zone/hotel names are not unique in the
    // catalog (e.g. several "El Gouna" zones), so resolution yields a list of
    // candidate routes and we pick the first that is actually priced.
    const resolved = this.resolveQuery(q, catalog);
    if (resolved.error || !resolved.combos?.length) {
      return { intent: 'need_info', reply: resolved.error || 'Could you give a bit more detail about your pickup and destination?' };
    }

    for (const c of resolved.combos) {
      const quotes = await this.publicApiService.getVehicleQuotes({
        serviceType: resolved.serviceType!,
        fromZoneId: c.fromZoneId,
        toZoneId: c.toZoneId,
        paxCount: q.paxCount,
      });
      if (quotes.options.length) {
        return {
          intent: 'results',
          reply: parsed.reply || `Here are vehicles for ${c.fromPlaceName} → ${c.toPlaceName} on ${q.jobDate}.`,
          query: {
            serviceType: resolved.serviceType,
            fromZoneId: c.fromZoneId,
            toZoneId: c.toZoneId,
            originAirportId: c.originAirportId,
            destinationAirportId: c.destinationAirportId,
            hotelId: c.hotelId,
            hotelName: c.hotelName,
            fromPlaceName: c.fromPlaceName,
            toPlaceName: c.toPlaceName,
            jobDate: q.jobDate,
            pickupTime: q.pickupTime,
            paxCount: q.paxCount,
            // Round trip only applies to airport arrivals (mirrors the booking widget).
            roundTrip: resolved.serviceType === 'ARR' ? !!q.roundTrip : false,
            returnDate: q.returnDate ?? '',
            returnTime: q.returnTime ?? '',
          },
          options: quotes.options,
        };
      }
    }

    const c0 = resolved.combos[0];
    return {
      intent: 'no_route',
      reply:
        parsed.reply ||
        `Sorry, we don't currently have pricing for ${c0.fromPlaceName} → ${c0.toPlaceName}. Please try a nearby airport or area, or contact support@transfera.ae.`,
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

    const airports: AirportEntry[] = airportsRaw.map((a) => ({
      id: a.id,
      name: a.name,
      code: a.code,
      sideZoneId: this.pickAirportSideZone(a.name, a.cities.flatMap((c) => c.zones)),
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
    const hotels: HotelEntry[] = hotelsRaw.map((h) => ({
      id: h.id,
      name: h.name,
      zoneId: h.zoneId,
      zoneName: h.zone.name,
    }));

    return { airports, zones, hotels };
  }

  // Mirror the booking widget's firstZoneForAirport(): prefer the zone whose name
  // matches the airport name (admins create an "Airport Zone" for pricing), else
  // the zone with the most shared words.
  private pickAirportSideZone(airportName: string, zones: { id: string; name: string }[]): string | null {
    if (!zones.length) return null;
    const airWords = airportName.toLowerCase().split(/\s+/);
    const scored = zones.map((z) => {
      if (z.name.toLowerCase() === airportName.toLowerCase()) return { id: z.id, score: 9999 };
      const zWords = z.name.toLowerCase().split(/\s+/);
      return { id: z.id, score: airWords.filter((w) => zWords.includes(w)).length };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  // ─── Prompt ───────────────────────────────────────────────

  private buildSystemInstruction(catalog: Catalog, locale?: string): string {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(new Date());

    const airportLines = catalog.airports.map((a) => `- ${a.name} (${a.code})`).join('\n');
    // Group zones by city to keep the list compact.
    const byCity = new Map<string, string[]>();
    for (const z of catalog.zones) {
      const arr = byCity.get(z.cityName) ?? [];
      arr.push(z.name);
      byCity.set(z.cityName, arr);
    }
    const zoneLines = [...byCity.entries()].map(([city, zs]) => `- ${city}: ${zs.join(', ')}`).join('\n');
    const hotelLines = catalog.hotels.map((h) => `- ${h.name} (area: ${h.zoneName})`).join('\n');

    return `You are the booking assistant for Transfera (transfera.ae), a private ground-transfer company in Egypt. You ONLY help guests book a private transfer (airport pickup/drop-off or city-to-city).

STRICT RULES:
- Never discuss, mention, recommend, or estimate prices for any other company, app, or website (e.g. Uber, Careem, taxis, competitors). You have no web access; never claim to look anything up online.
- Decline anything not about booking a Transfera transfer (general travel advice, weather, tours, chit-chat) — set intent "off_topic" with a brief, polite redirect.
- Use ONLY the locations listed below. Do not invent places. Choose the closest matching catalog name for the guest's pickup and destination.
- Determine serviceType: if the PICKUP is an airport => "ARR"; if the DESTINATION is an airport => "DEP"; if neither side is an airport => "CITY_TO_CITY".
- Today is ${weekday}, ${today} (Africa/Cairo). Resolve relative dates ("today", "tomorrow", "next Friday") against this. Output jobDate as YYYY-MM-DD and pickupTime as 24h HH:MM.
- If the guest hasn't given enough to search (pickup, destination, date, time, and passenger count), set intent "need_info" and ask ONE concise follow-up for the missing piece. Default paxCount to what they state; do not assume.
- Reply in the guest's language${locale ? ` (locale: ${locale})` : ''}.

RESPONSE FORMAT — return ONLY a JSON object, no markdown:
{
  "intent": "need_info" | "off_topic" | "query",
  "reply": "short message to the guest (always present)",
  "query": {            // include ONLY when intent is "query"
    "serviceType": "ARR" | "DEP" | "CITY_TO_CITY",
    "originName": "exact catalog name of the pickup",
    "destinationName": "exact catalog name of the destination",
    "paxCount": number,
    "jobDate": "YYYY-MM-DD",
    "pickupTime": "HH:MM",
    "roundTrip": boolean,
    "returnDate": "YYYY-MM-DD (only if roundTrip)",
    "returnTime": "HH:MM (only if roundTrip)"
  }
}

=== AIRPORTS ===
${airportLines || '(none)'}

=== AREAS / ZONES (by city) ===
${zoneLines || '(none)'}

=== HOTELS ===
${hotelLines || '(none)'}
`;
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
    const text = result.response.text();
    return this.parseModelResponse(text);
  }

  private parseModelResponse(raw: string): ModelResponse {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    const obj = JSON.parse(cleaned.trim());
    if (obj && (obj.intent === 'need_info' || obj.intent === 'off_topic' || obj.intent === 'query')) {
      return obj as ModelResponse;
    }
    // Unexpected shape — treat as a clarification prompt.
    return { intent: 'need_info', reply: typeof obj?.reply === 'string' ? obj.reply : undefined };
  }

  // ─── Resolution ───────────────────────────────────────────

  private resolveQuery(q: ModelQuery, catalog: Catalog): {
    error?: string;
    serviceType?: string;
    combos?: RouteCombo[];
  } {
    const serviceType = q.serviceType;
    const CAP = 8; // bound candidates per side to keep pricing lookups cheap

    if (serviceType === 'ARR') {
      const airport = this.matchAirport(q.originName, catalog);
      if (!airport) return { error: `I couldn't find the airport "${q.originName}". Which airport are you arriving at?` };
      if (!airport.sideZoneId) return { error: `We don't have pricing set up for ${airport.name} yet.` };
      const dests = this.matchPlaces(q.destinationName, catalog).slice(0, CAP);
      if (!dests.length) return { error: `I couldn't find "${q.destinationName}". Could you give the area or hotel name?` };
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
      if (!airport) return { error: `I couldn't find the airport "${q.destinationName}". Which airport are you flying from?` };
      if (!airport.sideZoneId) return { error: `We don't have pricing set up for ${airport.name} yet.` };
      const origins = this.matchPlaces(q.originName, catalog).slice(0, CAP);
      if (!origins.length) return { error: `I couldn't find "${q.originName}". Could you give the area or hotel name?` };
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

    // CITY_TO_CITY
    const origins = this.matchPlaces(q.originName, catalog).slice(0, CAP);
    const dests = this.matchPlaces(q.destinationName, catalog).slice(0, CAP);
    if (!origins.length) return { error: `I couldn't find "${q.originName}". Could you give the area or hotel name?` };
    if (!dests.length) return { error: `I couldn't find "${q.destinationName}". Could you give the area or hotel name?` };
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
    if (!combos.length) return { error: 'Pickup and destination are the same area — where would you like to go?' };
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

  // Resolve a free-text place to one or more pricing-zone candidates. Names are
  // not unique (duplicate zones, hotel-named zones), so we return an ordered list
  // — EXACT matches first (so a generic "El Gouna" zone isn't shadowed by a
  // "…El Gouna" hotel), then "contains" matches — and the caller tries each
  // against pricing. A hotel contributes its zone (for pricing) plus its id/name.
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
}
