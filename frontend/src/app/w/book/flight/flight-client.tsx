'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, Clock, Users, Baby, Armchair, Accessibility, Briefcase, ChevronRight } from 'lucide-react';
import { useBookingStore } from '@/stores/booking-store';
import type { SiteSettings } from '@/lib/site-settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  useEffect(() => {
    if (!store.vehicleTypeId) { router.replace('/w/book'); }
  }, [store.vehicleTypeId, router]);

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
                className="border-gray-200 bg-gray-50 focus-visible:ring-1 uppercase"
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
                className="border-gray-200 bg-gray-50 focus-visible:ring-1"
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
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
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

          <div className="space-y-4">
            {[
              { icon: Baby, label: 'Baby Seat', sub: 'For infants up to 13 kg', key: 'babySeatQty' as const, price: store.quoteBreakdown?.babySeatPrice as number ?? 0 },
              { icon: Armchair, label: 'Booster Seat', sub: 'For children 15–36 kg', key: 'boosterSeatQty' as const, price: store.quoteBreakdown?.boosterSeatPrice as number ?? 0 },
              { icon: Accessibility, label: 'Wheelchair', sub: 'Collapsible wheelchair space', key: 'wheelChairQty' as const, price: store.quoteBreakdown?.wheelChairPrice as number ?? 0 },
            ].map(({ icon: Icon, label, sub, key }) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
                    <Icon className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </div>
                </div>
                <Stepper
                  value={store.extras[key]}
                  onChange={(v) => store.setField(`extras.${key}`, v)}
                  min={0} max={5} color={pc}
                />
              </div>
            ))}
          </div>

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
              <p className="text-xl font-extrabold text-gray-900">{store.quoteCurrency} {store.quotePrice.toFixed(2)}</p>
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
