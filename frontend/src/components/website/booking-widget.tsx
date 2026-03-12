'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Clock,
  Users,
  ArrowRight,
  Loader2,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  CalendarDays,
  Briefcase,
  Minus,
  Plus,
  Baby,
  Armchair,
  Accessibility,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { useBookingStore } from '@/stores/booking-store';
import { localDateStr } from '@/lib/utils';
import type { SiteSettings } from '@/lib/site-settings';
import { useWT } from '@/lib/website-i18n';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/public`;

type Tab = 'ARR' | 'DEP';

interface LocationNode {
  id: string;
  name: string;
  type: string;
  children?: LocationNode[];
}

interface BookingWidgetProps {
  settings: SiteSettings;
}

/* ─── Stepper ─── */
function Stepper({
  value,
  onChange,
  min = 0,
  max = 50,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors disabled:opacity-30"
        style={{ backgroundColor: color }}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[2ch] text-center text-base font-semibold text-white">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-md text-white transition-colors disabled:opacity-30"
        style={{ backgroundColor: color }}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Field Card ─── */
function FieldCard({
  icon: Icon,
  iconColor,
  label,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3.5">
      <Icon className="h-5 w-5 shrink-0" style={{ color: iconColor }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

/* ─── Google Maps Script Loader ─── */
function useGoogleMaps(apiKey: string) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setLoaded(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) {
      setLoaded(true);
      return;
    }
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com"]',
    );
    if (existing) {
      existing.addEventListener('load', () => setLoaded(true));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [apiKey]);

  return loaded;
}

/* ─── Places Autocomplete ─── */
function PlacesAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  mapsLoaded,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (place: { name: string; placeId: string }) => void;
  placeholder: string;
  mapsLoaded: boolean;
}) {
  const [predictions, setPredictions] = useState<
    Array<{ place_id: string; description: string }>
  >([]);
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapsLoaded && !serviceRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceRef.current = new (window as any).google.maps.places.AutocompleteService();
    }
  }, [mapsLoaded]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (text: string) => {
    onChange(text);
    if (!text || text.length < 2 || !serviceRef.current) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    serviceRef.current.getPlacePredictions(
      { input: text },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (results: any[] | null) => {
        setPredictions(results || []);
        setOpen((results?.length ?? 0) > 0);
      },
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
      />
      {open && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ name: p.description, placeId: p.place_id });
                onChange(p.description);
                setPredictions([]);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-white/30" />
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Booking Widget ─── */
export function BookingWidget({ settings }: BookingWidgetProps) {
  const router = useRouter();
  const store = useBookingStore();

  const [activeTab, setActiveTab] = useState<Tab>('ARR');
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [showQuote, setShowQuote] = useState(false);
  const [luggage, setLuggage] = useState(2);
  const [placeSearch, setPlaceSearch] = useState('');
  const [googleKey, setGoogleKey] = useState('');

  const t = useWT();
  const mapsLoaded = useGoogleMaps(googleKey);

  // Sync tab → store
  useEffect(() => {
    store.setField('serviceType', activeTab);
    setShowQuote(false);
    setPlaceSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Extract airports from location tree
  const extractAirports = useCallback(
    (nodes: LocationNode[]): { id: string; name: string }[] => {
      const airports: { id: string; name: string }[] = [];
      const traverse = (node: LocationNode) => {
        if (node.type === 'AIRPORT')
          airports.push({ id: node.id, name: node.name });
        if (node.children) node.children.forEach(traverse);
      };
      nodes.forEach(traverse);
      return airports;
    },
    [],
  );

  // Fetch location tree (for airports) + Google Maps key
  useEffect(() => {
    fetch(`${API}/locations`)
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : data.data || [];
        setLocations(arr);
      })
      .catch(() => setLocations([]));

    fetch(`${API}/google-maps-key`)
      .then((r) => r.json())
      .then((data) => {
        const key = data?.data?.apiKey ?? data?.apiKey ?? '';
        setGoogleKey(key);
      })
      .catch(() => {});
  }, []);

  const airports = extractAirports(locations);

  const isArr = activeTab === 'ARR';

  // Airport field value — ARR uses originAirportId, DEP uses destinationAirportId
  const airportField = isArr ? 'originAirportId' : 'destinationAirportId';
  const airportValue = isArr ? store.originAirportId : store.destinationAirportId;

  // Place field — ARR: drop-off is a place, DEP: pickup is a place
  const placeStoreField = isArr ? 'to' : 'from';

  // Get Quote
  const handleGetQuote = async () => {
    setQuoteError('');
    setQuoting(true);
    setShowQuote(false);

    try {
      const body: Record<string, unknown> = {
        serviceType: activeTab,
        jobDate: store.jobDate,
        pickupTime: store.pickupTime,
        paxCount: store.paxCount,
        extras: store.extras,
      };

      // Airport
      if (isArr) {
        body.originAirportId = store.originAirportId;
        body.toPlace = store.toPlaceName;
        body.toPlaceId = store.toPlaceId;
      } else {
        body.destinationAirportId = store.destinationAirportId;
        body.fromPlace = store.fromPlaceName;
        body.fromPlaceId = store.fromPlaceId;
      }

      // backward compat zone IDs
      if (store.fromZoneId) body.fromZoneId = store.fromZoneId;
      if (store.toZoneId) body.toZoneId = store.toZoneId;

      const res = await fetch(`${API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to get quote');
      }

      const json = await res.json();
      const data = json.data ?? json;
      store.setQuote(
        data.total ?? data.price ?? data.totalPrice ?? 0,
        data.currency ?? 'USD',
        data,
      );
      setShowQuote(true);
    } catch (err: unknown) {
      setQuoteError(
        err instanceof Error
          ? err.message
          : 'Failed to get quote. Please try again.',
      );
    } finally {
      setQuoting(false);
    }
  };

  // For ARR: need airport + drop-off place. For DEP: need pickup place + airport.
  const placeName = isArr ? store.toPlaceName : store.fromPlaceName;
  const canQuote =
    airportValue &&
    placeName &&
    store.jobDate &&
    store.pickupTime &&
    store.paxCount > 0;

  const pc = settings.primaryColor;
  const selectCls =
    'w-full border-0 bg-transparent text-white shadow-none hover:bg-transparent focus:ring-0 h-auto p-0 text-sm';

  // ─── Airport Select (reusable) ───
  const AirportSelect = ({ color }: { color: string }) => (
    <div className="flex flex-1 items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3.5">
      <Plane className="h-5 w-5 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {isArr ? `${t('booking.arrivalAirport')} *` : `${t('booking.departureAirport')} *`}
        </p>
        <Select
          value={airportValue}
          onValueChange={(v) => {
            store.setField(airportField, v);
            setShowQuote(false);
          }}
        >
          <SelectTrigger className={selectCls}>
            <SelectValue placeholder={t('booking.selectAirport')} />
          </SelectTrigger>
          <SelectContent>
            {airports.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // ─── Google Places Field (reusable) ───
  const PlaceField = ({ color, label }: { color: string; label: string }) => (
    <div className="flex flex-1 items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3.5">
      <MapPin className="h-5 w-5 shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </p>
        <PlacesAutocomplete
          value={placeSearch}
          onChange={(v) => {
            setPlaceSearch(v);
            setShowQuote(false);
          }}
          onSelect={(place) => {
            store.setField(`${placeStoreField}PlaceName`, place.name);
            store.setField(`${placeStoreField}PlaceId`, place.placeId);
          }}
          placeholder={t('booking.searchLocation')}
          mapsLoaded={mapsLoaded}
        />
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] shadow-2xl backdrop-blur-xl">
      {/* ── Tabs ── */}
      <div className="flex">
        {(
          [
            {
              key: 'ARR' as Tab,
              label: t('booking.arrivalTransfer'),
              Icon: PlaneLanding,
            },
            {
              key: 'DEP' as Tab,
              label: t('booking.departureTransfer'),
              Icon: PlaneTakeoff,
            },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all ${
              activeTab === key
                ? 'text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
            style={
              activeTab === key
                ? { borderBottom: `2px solid ${pc}` }
                : { borderBottom: '2px solid transparent' }
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Fields ── */}
      <div className="space-y-3 p-5">
        {/* Date | Time | Passengers | Luggage */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FieldCard icon={CalendarDays} iconColor={pc} label={`${t('booking.date')} *`}>
            <Input
              type="date"
              value={store.jobDate}
              onChange={(e) => {
                store.setField('jobDate', e.target.value);
                setShowQuote(false);
              }}
              min={localDateStr(new Date())}
              className="h-auto border-0 bg-transparent p-0 text-sm text-white shadow-none focus-visible:ring-0 [color-scheme:dark]"
            />
          </FieldCard>

          <FieldCard icon={Clock} iconColor={pc} label={`${t('booking.time')} *`}>
            <Input
              type="time"
              value={store.pickupTime}
              onChange={(e) => {
                store.setField('pickupTime', e.target.value);
                setShowQuote(false);
              }}
              className="h-auto border-0 bg-transparent p-0 text-sm text-white shadow-none focus-visible:ring-0 [color-scheme:dark]"
            />
          </FieldCard>

          <FieldCard icon={Users} iconColor={pc} label={`${t('booking.passengers')} *`}>
            <Stepper
              value={store.paxCount}
              onChange={(v) => {
                store.setField('paxCount', v);
                setShowQuote(false);
              }}
              min={1}
              max={50}
              color={pc}
            />
          </FieldCard>

          <FieldCard icon={Briefcase} iconColor={pc} label={t('booking.luggage')}>
            <Stepper
              value={luggage}
              onChange={setLuggage}
              min={0}
              max={20}
              color={pc}
            />
          </FieldCard>
        </div>

        {/* Pickup → Drop-off row
            ARR: [Airport (pickup)] → [Google Places (drop-off)]
            DEP: [Google Places (pickup)] → [Airport (drop-off)] */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {isArr ? (
            <>
              <AirportSelect color="#4ade80" />
              <PlaceField
                color="#f87171"
                label={`${t('booking.dropoffHotel')} *`}
              />
            </>
          ) : (
            <>
              <PlaceField
                color="#4ade80"
                label={`${t('booking.pickupHotel')} *`}
              />
              <AirportSelect color="#f87171" />
            </>
          )}
        </div>

        {/* Extras */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldCard icon={Baby} iconColor={pc} label={t('booking.babySeat')}>
            <Stepper
              value={store.extras.babySeatQty}
              onChange={(v) => store.setField('extras.babySeatQty', v)}
              min={0}
              max={5}
              color={pc}
            />
          </FieldCard>

          <FieldCard icon={Armchair} iconColor={pc} label={t('booking.boosterSeat')}>
            <Stepper
              value={store.extras.boosterSeatQty}
              onChange={(v) => store.setField('extras.boosterSeatQty', v)}
              min={0}
              max={5}
              color={pc}
            />
          </FieldCard>

          <FieldCard icon={Accessibility} iconColor={pc} label={t('booking.wheelchair')}>
            <Stepper
              value={store.extras.wheelChairQty}
              onChange={(v) => store.setField('extras.wheelChairQty', v)}
              min={0}
              max={5}
              color={pc}
            />
          </FieldCard>
        </div>

        {/* ── Action ── */}
        {!showQuote ? (
          <Button
            onClick={handleGetQuote}
            disabled={!canQuote || quoting}
            className="w-full gap-2 text-base font-semibold text-white shadow-lg"
            style={{ backgroundColor: pc }}
            size="lg"
          >
            {quoting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('booking.gettingQuote')}
              </>
            ) : (
              <>
                {t('booking.getQuote')}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-300">
                  {t('booking.yourPrice')}
                </p>
                <p className="text-3xl font-bold text-white">
                  {store.quoteCurrency}{' '}
                  {store.quotePrice?.toFixed(2) ?? '0.00'}
                </p>
              </div>
              <Button
                onClick={() => router.push('/book/details')}

                className="mt-3 gap-2 px-8 font-semibold text-white sm:mt-0"
                style={{ backgroundColor: pc }}
                size="lg"
              >
                {t('booking.bookNow')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {store.quoteBreakdown && (
              <div className="mt-3 space-y-1 border-t border-emerald-500/20 pt-3 text-sm text-emerald-200/70">
                {Object.entries(store.quoteBreakdown).map(([key, val]) => {
                  if (
                    [
                      'price',
                      'total',
                      'totalPrice',
                      'currency',
                      'vehicleType',
                      'seatCapacity',
                      'extras',
                    ].includes(key)
                  )
                    return null;
                  if (typeof val !== 'number' || val === 0) return null;
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span>{val.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {quoteError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {quoteError}
          </div>
        )}
      </div>
    </div>
  );
}
