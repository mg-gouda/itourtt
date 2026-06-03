'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Clock, CalendarDays, MapPin, Plane, ChevronRight, Car, Loader2, AlertCircle, Wifi, Snowflake, Cog, Briefcase, Navigation } from 'lucide-react';
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
  wifi: boolean;
  airConditioning: boolean;
  transmission: 'MANUAL' | 'AUTOMATIC' | null;
  luggageCapacity: number | null;
  gpsTracked: boolean;
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
    <div className="min-h-screen pt-16 bg-gray-50">
      {/* Header bar */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <button onClick={() => router.push('/w')} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition text-xs">
            ← Edit Search
          </button>
          <span className="flex items-center gap-1.5">
            <Plane className="h-3.5 w-3.5" style={{ color: isArr ? '#16a34a' : '#dc2626' }} />
            {isArr ? 'Arrival' : 'Departure'} Transfer
          </span>
          {dateDisplay && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              {dateDisplay} · {store.pickupTime}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-gray-400" />
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
                  style={i === 0 ? { backgroundColor: pc, color: 'white' } : { backgroundColor: '#f3f4f6', color: '#9ca3af' }}>
                  {i + 1}
                </div>
                <span className={`text-sm font-medium ${i === 0 ? 'text-gray-900' : 'text-gray-400'}`}>{step}</span>
              </div>
              {i < 2 && <ChevronRight className="h-4 w-4 text-gray-300" />}
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Choose your vehicle</h2>
        <p className="text-gray-500 text-center text-sm mb-8">All prices are per vehicle, not per person.</p>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center text-red-600 flex flex-col items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            <p>{error}</p>
            <button onClick={() => router.push('/w')} className="mt-2 text-sm underline text-red-500 hover:text-red-700">Go back and try again</button>
          </div>
        )}

        {!loading && !error && options.length === 0 && (
          <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500 shadow-sm">
            <Car className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No vehicles available for this route.</p>
            <p className="text-sm mt-1">Try a different date or passenger count.</p>
            <button onClick={() => router.push('/w')} className="mt-4 text-sm underline hover:text-gray-900">Edit search</button>
          </div>
        )}

        {!loading && !error && options.length > 0 && (
          <div className="flex flex-col gap-4">
            {options.map((opt) => (
              <button
                key={opt.vehicleTypeId}
                type="button"
                onClick={() => selectVehicle(opt)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-all hover:shadow-md hover:border-gray-300 sm:flex-row"
              >
                {/* Vehicle image */}
                <div className="relative h-44 shrink-0 bg-gray-100 overflow-hidden sm:h-auto sm:w-64">
                  {opt.imageUrl ? (
                    <img src={opt.imageUrl} alt={opt.vehicleTypeName} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full min-h-[11rem] items-center justify-center">
                      <Car className="h-16 w-16 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-gray-900 text-base sm:text-lg">{opt.vehicleTypeName}</h3>
                    <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      up to {opt.seatCapacity}
                    </span>
                  </div>
                  {opt.description && (
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{opt.description}</p>
                  )}
                  {/* Amenities */}
                  {(opt.airConditioning || opt.wifi || opt.gpsTracked || opt.transmission || opt.luggageCapacity != null) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opt.airConditioning && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          <Snowflake className="h-3 w-3" /> A/C
                        </span>
                      )}
                      {opt.wifi && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          <Wifi className="h-3 w-3" /> Wi-Fi
                        </span>
                      )}
                      {opt.transmission && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 capitalize">
                          <Cog className="h-3 w-3" /> {opt.transmission.toLowerCase()}
                        </span>
                      )}
                      {opt.luggageCapacity != null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          <Briefcase className="h-3 w-3" /> {opt.luggageCapacity}
                        </span>
                      )}
                      {opt.gpsTracked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          <Navigation className="h-3 w-3" /> GPS
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-4 flex items-end justify-between gap-3 pt-4 border-t border-gray-100 sm:mt-auto">
                    <div className="flex flex-col">
                      <span className="text-xl font-extrabold text-gray-900">{opt.currency} {opt.price.toFixed(2)}</span>
                      <span className="text-xs text-gray-400">Per vehicle · all inclusive</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform group-hover:scale-[1.02]" style={{ backgroundColor: pc }}>
                      Book now <ChevronRight className="h-4 w-4" />
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
