'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Clock, CalendarDays, MapPin, Plane, ChevronRight, Car, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useBookingStore } from '@/stores/booking-store';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public`;

interface VehicleOption {
  vehicleTypeId: string;
  vehicleTypeName: string;
  seatCapacity: number;
  imageUrl: string | null;
  description: string | null;
  price: number;
  currency: string;
  driverTip: number;
  boosterSeatPrice: number;
  babySeatPrice: number;
  wheelChairPrice: number;
}

interface BookNowClientProps {
  settings: SiteSettings;
}

export function BookNowClient({ settings }: BookNowClientProps) {
  const router = useRouter();
  const store = useBookingStore();
  const [options, setOptions] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pc = settings.primaryColor;

  useEffect(() => {
    if (!store.fromZoneId || !store.toZoneId || !store.serviceType) {
      router.replace('/w');
      return;
    }
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/vehicle-quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceType: store.serviceType,
            fromZoneId: store.fromZoneId,
            toZoneId: store.toZoneId,
            paxCount: store.paxCount,
          }),
        });
        if (!res.ok) throw new Error('No results found for this route.');
        const json = await res.json();
        const data = json.data ?? json;
        setOptions(data.options ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load vehicles.');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [store.fromZoneId, store.toZoneId, store.serviceType, store.paxCount, router]);

  const selectVehicle = (opt: VehicleOption) => {
    store.setField('vehicleTypeId', opt.vehicleTypeId);
    store.setQuote(opt.price, opt.currency, {
      vehicleType: opt.vehicleTypeName,
      seatCapacity: opt.seatCapacity,
      driverTip: opt.driverTip,
    });
    router.push('/w/book/flight');
  };

  const isArr = store.serviceType === 'ARR';
  const dateDisplay = store.jobDate
    ? format(new Date(store.jobDate + 'T12:00:00'), 'EEE, dd MMM yyyy')
    : '';

  return (
    <div className="min-h-screen pt-16" style={{ background: `linear-gradient(160deg, ${settings.heroGradientFrom} 0%, ${settings.heroGradientTo} 100%)` }}>
      {/* Header bar */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center gap-4 text-sm text-white/80">
          <button onClick={() => router.push('/w')} className="flex items-center gap-1.5 text-white/60 hover:text-white transition text-xs">
            ← Edit Search
          </button>
          <span className="flex items-center gap-1.5">
            <Plane className="h-3.5 w-3.5" style={{ color: isArr ? '#4ade80' : '#f87171' }} />
            {isArr ? 'Arrival' : 'Departure'} Transfer
          </span>
          {dateDisplay && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 opacity-60" />
              {dateDisplay} · {store.pickupTime}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 opacity-60" />
            {store.paxCount} passenger{store.paxCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {['Select Vehicle', 'Flight & Extras', 'Your Details'].map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                  style={i === 0 ? { backgroundColor: pc, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                  {i + 1}
                </div>
                <span className={`text-sm font-medium ${i === 0 ? 'text-white' : 'text-white/40'}`}>{step}</span>
              </div>
              {i < 2 && <ChevronRight className="h-4 w-4 text-white/20" />}
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-2">Choose your vehicle</h2>
        <p className="text-white/60 text-center text-sm mb-8">All prices are per vehicle, not per person.</p>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-6 text-center text-red-300 flex flex-col items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            <p>{error}</p>
            <button onClick={() => router.push('/w')} className="mt-2 text-sm underline text-red-200 hover:text-white">Go back and try again</button>
          </div>
        )}

        {!loading && !error && options.length === 0 && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-10 text-center text-white/50">
            <Car className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No vehicles available for this route.</p>
            <p className="text-sm mt-1">Try a different date or passenger count.</p>
            <button onClick={() => router.push('/w')} className="mt-4 text-sm underline hover:text-white">Edit search</button>
          </div>
        )}

        {!loading && !error && options.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((opt) => (
              <button
                key={opt.vehicleTypeId}
                type="button"
                onClick={() => selectVehicle(opt)}
                className="group relative overflow-hidden rounded-2xl bg-white text-left shadow-lg transition-all hover:shadow-2xl hover:-translate-y-0.5"
              >
                {/* Vehicle image */}
                <div className="relative h-40 bg-gray-100 overflow-hidden">
                  {opt.imageUrl ? (
                    <img src={opt.imageUrl} alt={opt.vehicleTypeName} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Car className="h-16 w-16 text-gray-300" />
                    </div>
                  )}
                  {/* Price badge */}
                  <div className="absolute bottom-3 right-3 rounded-xl px-3 py-1.5 text-white text-sm font-bold shadow-lg"
                    style={{ backgroundColor: pc }}>
                    {opt.currency} {opt.price.toFixed(2)}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-gray-900 text-base">{opt.vehicleTypeName}</h3>
                    <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      up to {opt.seatCapacity}
                    </span>
                  </div>
                  {opt.description && (
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{opt.description}</p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Per vehicle · all inclusive</span>
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: pc }}>
                      Select <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
