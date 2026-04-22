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
  ChevronDown,
  ChevronUp,
  Sparkles,
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
        className="flex h-6 w-6 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-30"
        style={{ backgroundColor: color }}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[2ch] text-center text-sm font-bold text-gray-900">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-6 w-6 items-center justify-center rounded-lg text-white transition-colors disabled:opacity-30"
        style={{ backgroundColor: color }}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ─── Field ─── */
function Field({
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
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
    if (!apiKey) { setLoaded(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) { setLoaded(true); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { existing.addEventListener('load', () => setLoaded(true)); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const apiModeRef = useRef<'new' | 'legacy' | null>(null);

  useEffect(() => {
    if (!mapsLoaded) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google?.maps?.places;
    if (g?.AutocompleteService) apiModeRef.current = 'legacy';
    else if (g?.AutocompleteSuggestion) apiModeRef.current = 'new';
  }, [mapsLoaded]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = async (text: string) => {
    onChange(text);
    if (!text || text.length < 2 || !apiModeRef.current) {
      setPredictions([]); setOpen(false); return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google.maps.places;
      if (apiModeRef.current === 'new') {
        const { suggestions } = await g.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text, language: 'en',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = (suggestions || []).map((s: any) => ({
          place_id: s.placePrediction?.placeId || '',
          description: s.placePrediction?.text?.text || '',
        }));
        setPredictions(results);
        setOpen(results.length > 0);
      } else {
        const service = new g.AutocompleteService();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.getPlacePredictions({ input: text }, (results: any[] | null) => {
          setPredictions(results || []);
          setOpen((results?.length ?? 0) > 0);
        });
      }
    } catch { setPredictions([]); setOpen(false); }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
      />
      {open && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[100] mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ name: p.description, placeId: p.place_id });
                onChange(p.description);
                setPredictions([]); setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-300" />
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
  const [showAddons, setShowAddons] = useState(false);

  const t = useWT();
  const mapsLoaded = useGoogleMaps(googleKey);

  useEffect(() => {
    store.setField('serviceType', activeTab);
    setShowQuote(false);
    setPlaceSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const extractAirports = useCallback(
    (nodes: LocationNode[]): { id: string; name: string }[] => {
      const airports: { id: string; name: string }[] = [];
      const traverse = (node: LocationNode) => {
        if (node.type === 'AIRPORT') airports.push({ id: node.id, name: node.name });
        if (node.children) node.children.forEach(traverse);
      };
      nodes.forEach(traverse);
      return airports;
    },
    [],
  );

  useEffect(() => {
    fetch(`${API}/locations`)
      .then((r) => r.json())
      .then((data) => setLocations(Array.isArray(data) ? data : data.data || []))
      .catch(() => setLocations([]));

    fetch(`${API}/google-maps-key`)
      .then((r) => r.json())
      .then((data) => setGoogleKey(data?.data?.apiKey ?? data?.apiKey ?? ''))
      .catch(() => {});
  }, []);

  const airports = extractAirports(locations);
  const isArr = activeTab === 'ARR';

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
      if (isArr) {
        body.originAirportId = store.originAirportId;
        body.toPlace = store.toPlaceName;
        body.toPlaceId = store.toPlaceId;
      } else {
        body.destinationAirportId = store.destinationAirportId;
        body.fromPlace = store.fromPlaceName;
        body.fromPlaceId = store.fromPlaceId;
      }
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
        err instanceof Error ? err.message : 'Failed to get quote. Please try again.',
      );
    } finally {
      setQuoting(false);
    }
  };

  const airportValue = isArr ? store.originAirportId : store.destinationAirportId;
  const placeName = isArr ? store.toPlaceName : store.fromPlaceName;
  const canQuote = airportValue && placeName && store.jobDate && store.pickupTime && store.paxCount > 0;
  const pc = settings.primaryColor;

  const addonCount =
    store.extras.babySeatQty +
    store.extras.boosterSeatQty +
    store.extras.wheelChairQty +
    (luggage !== 2 ? 1 : 0);

  const selectCls =
    'w-full border-0 bg-transparent text-gray-900 shadow-none hover:bg-transparent focus:ring-0 h-auto p-0 text-sm';

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-100">
        {(
          [
            { key: 'ARR' as Tab, label: t('booking.arrivalTransfer'), Icon: PlaneLanding },
            { key: 'DEP' as Tab, label: t('booking.departureTransfer'), Icon: PlaneTakeoff },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className="flex flex-1 items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all"
            style={
              activeTab === key
                ? { color: pc, borderBottom: `2.5px solid ${pc}` }
                : { color: '#9ca3af', borderBottom: '2.5px solid transparent' }
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Fields ── */}
      <div className="space-y-3 p-5">
        {/* Row 1: Date | Time | Passengers */}
        <div className="grid grid-cols-3 gap-3">
          <Field icon={CalendarDays} iconColor={pc} label={`${t('booking.date')} *`}>
            <Input
              type="date"
              value={store.jobDate}
              onChange={(e) => { store.setField('jobDate', e.target.value); setShowQuote(false); }}
              min={localDateStr(new Date())}
              className="h-auto border-0 bg-transparent p-0 text-sm text-gray-900 shadow-none focus-visible:ring-0"
            />
          </Field>

          <Field icon={Clock} iconColor={pc} label={`${t('booking.time')} *`}>
            <Input
              type="time"
              value={store.pickupTime}
              onChange={(e) => { store.setField('pickupTime', e.target.value); setShowQuote(false); }}
              className="h-auto border-0 bg-transparent p-0 text-sm text-gray-900 shadow-none focus-visible:ring-0"
            />
          </Field>

          <Field icon={Users} iconColor={pc} label={`${t('booking.passengers')} *`}>
            <Stepper
              value={store.paxCount}
              onChange={(v) => { store.setField('paxCount', v); setShowQuote(false); }}
              min={1}
              max={50}
              color={pc}
            />
          </Field>
        </div>

        {/* Row 2: Airport ↔ Place — inlined to avoid inner-component remount on every keypress */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Airport field */}
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <Plane className="h-4 w-4 shrink-0" style={{ color: isArr ? '#16a34a' : '#dc2626' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {isArr ? `${t('booking.arrivalAirport')} *` : `${t('booking.departureAirport')} *`}
              </p>
              <Select
                value={isArr ? store.originAirportId : store.destinationAirportId}
                onValueChange={(v) => {
                  store.setField(isArr ? 'originAirportId' : 'destinationAirportId', v);
                  setShowQuote(false);
                }}
              >
                <SelectTrigger className={selectCls}>
                  <SelectValue placeholder={t('booking.selectAirport')} />
                </SelectTrigger>
                <SelectContent>
                  {airports.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Place field (hotel / address) — PlacesAutocomplete must never remount mid-typing */}
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <MapPin className="h-4 w-4 shrink-0" style={{ color: isArr ? '#dc2626' : '#16a34a' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {isArr ? `${t('booking.dropoffHotel')} *` : `${t('booking.pickupHotel')} *`}
              </p>
              <PlacesAutocomplete
                value={placeSearch}
                onChange={(v) => { setPlaceSearch(v); setShowQuote(false); }}
                onSelect={(place) => {
                  store.setField(isArr ? 'toPlaceName' : 'fromPlaceName', place.name);
                  store.setField(isArr ? 'toPlaceId' : 'fromPlaceId', place.placeId);
                }}
                placeholder={t('booking.searchLocation')}
                mapsLoaded={mapsLoaded}
              />
            </div>
          </div>
        </div>

        {/* Add-ons toggle */}
        <button
          type="button"
          onClick={() => setShowAddons((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-gray-200 px-4 py-2.5 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600"
        >
          <span className="flex items-center gap-2 font-medium">
            <Briefcase className="h-4 w-4" />
            {t('booking.addons')}
            {addonCount > 0 && (
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: pc }}
              >
                {addonCount}
              </span>
            )}
          </span>
          {showAddons
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAddons && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field icon={Briefcase} iconColor={pc} label={t('booking.luggage')}>
              <Stepper value={luggage} onChange={setLuggage} min={0} max={20} color={pc} />
            </Field>
            <Field icon={Baby} iconColor={pc} label={t('booking.babySeat')}>
              <Stepper
                value={store.extras.babySeatQty}
                onChange={(v) => store.setField('extras.babySeatQty', v)}
                min={0} max={5} color={pc}
              />
            </Field>
            <Field icon={Armchair} iconColor={pc} label={t('booking.boosterSeat')}>
              <Stepper
                value={store.extras.boosterSeatQty}
                onChange={(v) => store.setField('extras.boosterSeatQty', v)}
                min={0} max={5} color={pc}
              />
            </Field>
            <Field icon={Accessibility} iconColor={pc} label={t('booking.wheelchair')}>
              <Stepper
                value={store.extras.wheelChairQty}
                onChange={(v) => store.setField('extras.wheelChairQty', v)}
                min={0} max={5} color={pc}
              />
            </Field>
          </div>
        )}

        {/* Action */}
        {!showQuote ? (
          <Button
            onClick={handleGetQuote}
            disabled={!canQuote || quoting}
            className="w-full gap-2 text-base font-semibold text-white shadow-lg transition-opacity disabled:opacity-50"
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
                <Sparkles className="h-4 w-4" />
                {t('booking.getQuote')}
              </>
            )}
          </Button>
        ) : (
          <div
            className="rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${pc}12, ${pc}06)`,
              border: `1px solid ${pc}25`,
            }}
          >
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {t('booking.yourPrice')}
                </p>
                <p className="mt-0.5 text-3xl font-extrabold text-gray-900">
                  {store.quoteCurrency}{' '}{store.quotePrice?.toFixed(2) ?? '0.00'}
                </p>
              </div>
              <Button
                onClick={() => router.push('/book/details')}
                className="gap-2 px-8 font-semibold text-white"
                style={{ backgroundColor: pc }}
                size="lg"
              >
                {t('booking.bookNow')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {store.quoteBreakdown && (
              <div className="mt-3 space-y-1 border-t border-black/5 pt-3 text-sm">
                {Object.entries(store.quoteBreakdown).map(([key, val]) => {
                  if (
                    ['price', 'total', 'totalPrice', 'currency', 'vehicleType', 'seatCapacity', 'extras'].includes(key)
                  ) return null;
                  if (typeof val !== 'number' || val === 0) return null;
                  return (
                    <div key={key} className="flex justify-between text-gray-500">
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="font-medium text-gray-700">{val.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {quoteError && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {quoteError}
          </div>
        )}
      </div>
    </div>
  );
}
