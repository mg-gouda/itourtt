'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, Clock, Users, Briefcase, ChevronRight, Sparkles, Car, AlertCircle } from 'lucide-react';
import { useBookingStore } from '@/stores/booking-store';
import type { SiteSettings } from '@/lib/site-settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public`;

interface CatalogExtra {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  occupiesSeat: boolean;
  allowedVehicleTypeIds: string[];
  allowedVehicleTypeNames: string[];
}

interface VehicleOption {
  vehicleTypeId: string;
  vehicleTypeName: string;
  seatCapacity: number;
  price: number;
  currency: string;
  driverTip: number;
}

// Why the guest can't add an extra to the current vehicle, plus the change
// they were attempting — used to offer larger/compatible vehicles inline.
interface CapacityAlert {
  reason: 'capacity' | 'vehicle-type';
  message: string;
  extra: CatalogExtra;
  desiredQty: number;
}

interface FlightClientProps { settings: SiteSettings; }

function Stepper({ value, onChange, min = 0, max = 10, color }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white font-bold disabled:opacity-30"
        style={{ backgroundColor: color }}>−</button>
      <span className="w-6 text-center font-bold text-gray-900">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white font-bold disabled:opacity-30"
        style={{ backgroundColor: color }}>+</button>
    </div>
  );
}

export function FlightClient({ settings }: FlightClientProps) {
  const router = useRouter();
  const store = useBookingStore();
  const pc = settings.primaryColor;
  const isArr = store.serviceType === 'ARR';

  const [catalogExtras, setCatalogExtras] = useState<CatalogExtra[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [capacityAlert, setCapacityAlert] = useState<CapacityAlert | null>(null);

  useEffect(() => {
    if (!store.vehicleTypeId) { router.replace('/w/book'); }
  }, [store.vehicleTypeId, router]);

  useEffect(() => {
    let active = true;
    fetch(`${API}/extras`)
      .then((r) => r.json())
      .then((j) => {
        if (active) setCatalogExtras(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load the same vehicle options the guest saw on step 1, so they can swap to a
  // larger / compatible vehicle right here without going back to the search.
  useEffect(() => {
    if (!store.fromZoneId || !store.toZoneId || !store.serviceType) return;
    let active = true;
    fetch(`${API}/vehicle-quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceType: store.serviceType,
        fromZoneId: store.fromZoneId,
        toZoneId: store.toZoneId,
        paxCount: store.paxCount,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        const data = j.data ?? j;
        if (active) setVehicleOptions(data.options ?? []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [store.fromZoneId, store.toZoneId, store.serviceType, store.paxCount]);

  const qtyFor = (id: string) =>
    store.customExtras.find((e) => e.extraId === id)?.qty ?? 0;

  // Seat-occupying extras (baby/booster seat, wheelchair) share the cabin with the
  // passengers, so pax + those extras must fit the selected vehicle's capacity.
  const seatCapacity = Number(store.quoteBreakdown?.seatCapacity ?? 0);
  const seatExtrasUsed = catalogExtras.reduce(
    (sum, ex) => (ex.occupiesSeat ? sum + qtyFor(ex.id) : sum),
    0,
  );
  const seatsLeft = seatCapacity > 0 ? seatCapacity - store.paxCount - seatExtrasUsed : Infinity;

  // Guard an extra's quantity change against vehicle-type restriction and capacity.
  // Instead of silently disabling the control, surface a clear alert the moment
  // the guest tries to add an extra that won't fit the current vehicle.
  const changeExtraQty = (ex: CatalogExtra, next: number) => {
    const increasing = next > qtyFor(ex.id);
    if (
      increasing &&
      ex.allowedVehicleTypeIds.length > 0 &&
      !ex.allowedVehicleTypeIds.includes(store.vehicleTypeId)
    ) {
      setCapacityAlert({
        reason: 'vehicle-type',
        extra: ex,
        desiredQty: next,
        message:
          `"${ex.name}" can only be carried by ${ex.allowedVehicleTypeNames.join(', ')}.` +
          ` Switch your vehicle below to add it — no need to start your search over.`,
      });
      return;
    }
    if (ex.occupiesSeat && increasing && seatsLeft <= 0) {
      setCapacityAlert({
        reason: 'capacity',
        extra: ex,
        desiredQty: next,
        message:
          `This ${seatCapacity}-seat vehicle is full with ${store.paxCount} passenger${store.paxCount !== 1 ? 's' : ''}` +
          ` and the extras already selected. Switch to a larger vehicle below to add "${ex.name}" — no need to start your search over.`,
      });
      return;
    }
    setCapacityAlert(null);
    store.setCustomExtraQty(ex.id, next);
  };

  // Seat usage by every seat-occupying extra except the given one — used to test
  // whether a candidate vehicle could fit pax + extras + the pending addition.
  const seatExtrasExcluding = (extraId: string) =>
    catalogExtras.reduce(
      (sum, ex) => (ex.occupiesSeat && ex.id !== extraId ? sum + qtyFor(ex.id) : sum),
      0,
    );

  // Larger / compatible vehicles that would actually fit the blocked selection.
  // Vehicles too small (or not allowed for the extra) are excluded, so the guest
  // can never switch into a vehicle that still wouldn't work.
  const vehiclesForAlert = (alert: CapacityAlert): VehicleOption[] => {
    const { extra, desiredQty } = alert;
    const requiredSeats =
      store.paxCount +
      seatExtrasExcluding(extra.id) +
      (extra.occupiesSeat ? desiredQty : 0);
    return vehicleOptions.filter((opt) => {
      if (opt.vehicleTypeId === store.vehicleTypeId) return false;
      if (
        extra.allowedVehicleTypeIds.length > 0 &&
        !extra.allowedVehicleTypeIds.includes(opt.vehicleTypeId)
      ) {
        return false;
      }
      return opt.seatCapacity >= requiredSeats;
    });
  };

  // Swap the vehicle in place (re-quoting price + capacity) and apply the extra
  // the guest was trying to add, all without leaving this step.
  const switchVehicle = (opt: VehicleOption, alert: CapacityAlert) => {
    store.setField('vehicleTypeId', opt.vehicleTypeId);
    store.setQuote(opt.price, opt.currency, {
      vehicleType: opt.vehicleTypeName,
      seatCapacity: opt.seatCapacity,
      driverTip: opt.driverTip,
    });
    store.setCustomExtraQty(alert.extra.id, alert.desiredQty);
    setCapacityAlert(null);
  };

  // Sum catalog extras priced in the quote currency.
  const customExtrasTotal = catalogExtras.reduce((sum, ex) => {
    if (ex.currency !== store.quoteCurrency) return sum;
    return sum + ex.price * qtyFor(ex.id);
  }, 0);

  const canContinue = store.flightNo.trim().length > 0;

  return (
    <div className="min-h-screen pt-16 bg-gray-50">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700 transition">← Back</button>
          <div className="flex items-center gap-3 ml-auto">
            {['Select Vehicle', 'Flight & Extras', 'Your Details'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={i === 1 ? { backgroundColor: pc, color: 'white' } : i < 1
                    ? { backgroundColor: '#d1fae5', color: '#059669' }
                    : { backgroundColor: '#f3f4f6', color: '#9ca3af' }}>
                  {i < 1 ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === 1 ? 'text-gray-900' : i < 1 ? 'text-emerald-600' : 'text-gray-400'}`}>{step}</span>
                {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flight details</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isArr ? 'Your arrival flight information so we can monitor delays.' : 'Your departure flight information for scheduling.'}
          </p>
        </div>

        {/* Flight info card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <Plane className="h-4 w-4" style={{ color: pc }} />
            Flight Information
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Flight Number *
              </Label>
              <Input
                placeholder="e.g. MS777"
                value={store.flightNo}
                onChange={(e) => store.setField('flightNo', e.target.value.toUpperCase())}
                className="border-gray-200 bg-gray-50 text-gray-800 focus-visible:ring-1 uppercase"
                style={{ '--tw-ring-color': pc } as React.CSSProperties}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Terminal
              </Label>
              <Input
                placeholder="e.g. T1"
                value={store.terminal}
                onChange={(e) => store.setField('terminal', e.target.value)}
                className="border-gray-200 bg-gray-50 text-gray-800 focus-visible:ring-1"
                style={{ '--tw-ring-color': pc } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {isArr ? 'Origin (flying from)' : 'Destination (flying to)'}
            </Label>
            <Input
              placeholder="e.g. London Heathrow"
              value={store.carrier}
              onChange={(e) => store.setField('carrier', e.target.value)}
              className="border-gray-200 bg-gray-50 text-gray-800 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Optional extras card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <Briefcase className="h-4 w-4" style={{ color: pc }} />
            Optional Extras
          </h2>

          {/* Managed catalog extras */}
          {catalogExtras.length > 0 && (
            <div className="space-y-4">
              {capacityAlert && (() => {
                const candidates = vehiclesForAlert(capacityAlert);
                return (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800 space-y-2.5">
                    <p className="flex items-start gap-2 font-medium leading-relaxed">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>{capacityAlert.message}</span>
                    </p>
                    {candidates.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                          Change vehicle
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {candidates.map((opt) => (
                            <button
                              key={opt.vehicleTypeId}
                              type="button"
                              onClick={() => switchVehicle(opt, capacityAlert)}
                              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 transition hover:border-amber-400 hover:shadow-sm"
                            >
                              <Car className="h-3.5 w-3.5 text-amber-600" />
                              <span className="font-semibold text-gray-900">{opt.vehicleTypeName}</span>
                              <span className="text-gray-400">· up to {opt.seatCapacity}</span>
                              <span className="font-bold" style={{ color: pc }}>
                                {opt.currency} {opt.price.toFixed(2)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-amber-700">
                        No other vehicle on this route can carry the selected passengers and extras.
                      </p>
                    )}
                  </div>
                );
              })()}
              {catalogExtras.map((ex) => (
                <div key={ex.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
                      <Sparkles className="h-4 w-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ex.name}</p>
                      <p className="text-xs text-gray-400">
                        {ex.description ? `${ex.description} · ` : ''}
                        {ex.currency} {ex.price.toFixed(2)}
                        {ex.occupiesSeat ? ' · occupies a seat' : ''}
                        {ex.allowedVehicleTypeIds.length > 0
                          ? ` · ${ex.allowedVehicleTypeNames.join('/')} only`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <Stepper
                    value={qtyFor(ex.id)}
                    onChange={(v) => changeExtraQty(ex, v)}
                    min={0}
                    max={10}
                    color={pc}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Special Requests</Label>
            <textarea
              rows={2}
              placeholder="Any special requirements or notes for the driver…"
              value={store.notes}
              onChange={(e) => store.setField('notes', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 resize-none"
              style={{ '--tw-ring-color': pc } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Price summary */}
        {store.quotePrice !== null && (
          <div className="rounded-2xl px-5 py-4 flex items-center justify-between"
            style={{ background: `linear-gradient(135deg, ${pc}12, ${pc}06)`, border: `1px solid ${pc}25` }}>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Your price</p>
              <p className="text-xl font-extrabold text-gray-900">
                {store.quoteCurrency} {(store.quotePrice + customExtrasTotal).toFixed(2)}
              </p>
              {customExtrasTotal > 0 && (
                <p className="text-xs text-gray-400">
                  incl. {store.quoteCurrency} {customExtrasTotal.toFixed(2)} extras
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Users className="h-3.5 w-3.5" />
              {store.paxCount} pax ·
              <Clock className="h-3.5 w-3.5 ml-1" />
              {store.pickupTime}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push('/w/book/details')}
          disabled={!canContinue}
          className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition-opacity disabled:opacity-40"
          style={{ backgroundColor: pc }}
        >
          Continue to Your Details →
        </button>
      </div>
    </div>
  );
}
