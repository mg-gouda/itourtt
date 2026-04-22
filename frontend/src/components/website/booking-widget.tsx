'use client';

import { useEffect, useState, useCallback } from 'react';
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
  Car,
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

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public`;

type Tab = 'ARR' | 'DEP';

interface LocationNode {
  id: string;
  name: string;
  type: string;
  children?: LocationNode[];
}

interface VehicleType {
  id: string;
  name: string;
  capacity: number;
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

/* ─── Booking Widget ─── */
export function BookingWidget({ settings }: BookingWidgetProps) {
  const router = useRouter();
  const store = useBookingStore();

  const [activeTab, setActiveTab] = useState<Tab>('ARR');
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [showQuote, setShowQuote] = useState(false);
  const [luggage, setLuggage] = useState(2);
  const [showAddons, setShowAddons] = useState(false);

  const t = useWT();

  useEffect(() => {
    store.setField('serviceType', activeTab);
    setShowQuote(false);
    store.setField('fromZoneId', '');
    store.setField('toZoneId', '');
    store.setField('originAirportId', '');
    store.setField('destinationAirportId', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    fetch(`${API}/locations`)
      .then((r) => r.json())
      .then((data) => setLocations(Array.isArray(data) ? data : data.data || []))
      .catch(() => setLocations([]));

    fetch(`${API}/vehicle-types`)
      .then((r) => r.json())
      .then((data) => setVehicleTypes(Array.isArray(data) ? data : data.data || []))
      .catch(() => setVehicleTypes([]));
  }, []);

  /* Extract flat list of airports from tree */
  const airports = useCallback(
    (nodes: LocationNode[]): { id: string; name: string }[] => {
      const list: { id: string; name: string }[] = [];
      const walk = (n: LocationNode) => {
        if (n.type === 'AIRPORT') list.push({ id: n.id, name: n.name });
        n.children?.forEach(walk);
      };
      nodes.forEach(walk);
      return list;
    },
    [],
  )(locations);

  /* Extract flat list of zones from tree */
  const zones = useCallback(
    (nodes: LocationNode[]): { id: string; name: string }[] => {
      const list: { id: string; name: string }[] = [];
      const walk = (n: LocationNode) => {
        if (n.type === 'ZONE') list.push({ id: n.id, name: n.name });
        n.children?.forEach(walk);
      };
      nodes.forEach(walk);
      return list;
    },
    [],
  )(locations);

  /* Get the first zone that sits under a given airport in the tree */
  const firstZoneForAirport = useCallback(
    (nodes: LocationNode[], airportId: string): string | null => {
      for (const country of nodes) {
        for (const airport of country.children ?? []) {
          if (airport.id === airportId && airport.type === 'AIRPORT') {
            for (const city of airport.children ?? []) {
              for (const zone of city.children ?? []) {
                if (zone.type === 'ZONE') return zone.id;
              }
            }
          }
        }
      }
      return null;
    },
    [],
  );

  /* When airport is selected, auto-resolve the airport-side zone for pricing */
  const handleAirportChange = (airportId: string) => {
    const isArr = activeTab === 'ARR';
    store.setField(isArr ? 'originAirportId' : 'destinationAirportId', airportId);
    const zoneId = firstZoneForAirport(locations, airportId);
    if (zoneId) store.setField(isArr ? 'fromZoneId' : 'toZoneId', zoneId);
    setShowQuote(false);
  };

  const handleGetQuote = async () => {
    setQuoteError('');
    setQuoting(true);
    setShowQuote(false);
    try {
      const res = await fetch(`${API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: activeTab,
          fromZoneId: store.fromZoneId,
          toZoneId: store.toZoneId,
          vehicleTypeId: store.vehicleTypeId,
          paxCount: store.paxCount,
          extras: store.extras,
        }),
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

  const isArr = activeTab === 'ARR';
  const airportValue = isArr ? store.originAirportId : store.destinationAirportId;
  const hotelZone = isArr ? store.toZoneId : store.fromZoneId;
  const canQuote =
    airportValue &&
    hotelZone &&
    store.fromZoneId &&
    store.toZoneId &&
    store.vehicleTypeId &&
    store.jobDate &&
    store.pickupTime &&
    store.paxCount > 0;
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

        {/* Row 2: Airport ↔ Hotel Zone */}
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
                onValueChange={handleAirportChange}
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

          {/* Hotel / Stay Area Zone */}
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <MapPin className="h-4 w-4 shrink-0" style={{ color: isArr ? '#dc2626' : '#16a34a' }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {isArr ? `${t('booking.dropoffHotel')} *` : `${t('booking.pickupHotel')} *`}
              </p>
              <Select
                value={hotelZone}
                onValueChange={(v) => {
                  store.setField(isArr ? 'toZoneId' : 'fromZoneId', v);
                  setShowQuote(false);
                }}
              >
                <SelectTrigger className={selectCls}>
                  <SelectValue placeholder={t('booking.searchLocation')} />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Row 3: Vehicle Type */}
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <Car className="h-4 w-4 shrink-0" style={{ color: pc }} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Vehicle Type *
            </p>
            <Select
              value={store.vehicleTypeId}
              onValueChange={(v) => { store.setField('vehicleTypeId', v); setShowQuote(false); }}
            >
              <SelectTrigger className={selectCls}>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((vt) => (
                  <SelectItem key={vt.id} value={vt.id}>
                    {vt.name} (up to {vt.capacity} pax)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
