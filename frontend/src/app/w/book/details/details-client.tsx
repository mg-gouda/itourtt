'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Phone, Globe, Loader2, CheckCircle2, ChevronRight, KeyRound, ExternalLink } from 'lucide-react';
import { useBookingStore } from '@/stores/booking-store';
import type { SiteSettings } from '@/lib/site-settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/public`;

interface CatalogExtra {
  id: string;
  name: string;
  price: number;
  currency: string;
}

interface DetailsClientProps { settings: SiteSettings; }

export function DetailsClient({ settings }: DetailsClientProps) {
  const router = useRouter();
  const store = useBookingStore();
  const pc = settings.primaryColor;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [catalogExtras, setCatalogExtras] = useState<CatalogExtra[]>([]);

  useEffect(() => {
    if (!store.vehicleTypeId || !store.flightNo) { router.replace('/w/book/flight'); }
  }, [store.vehicleTypeId, store.flightNo, router]);

  useEffect(() => {
    let active = true;
    fetch(`${API}/extras`)
      .then((r) => r.json())
      .then((j) => { if (active) setCatalogExtras(Array.isArray(j.data) ? j.data : []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Line items for the selected catalog extras (in the quote currency).
  const extraLines = store.customExtras
    .map((sel) => {
      const ex = catalogExtras.find((c) => c.id === sel.extraId);
      if (!ex || ex.currency !== store.quoteCurrency) return null;
      return { name: ex.name, qty: sel.qty, cost: ex.price * sel.qty };
    })
    .filter((l): l is { name: string; qty: number; cost: number } => l !== null);
  const customExtrasTotal = extraLines.reduce((s, l) => s + l.cost, 0);
  const grandTotal = (store.quotePrice ?? 0) + customExtrasTotal;

  const canSubmit = store.guestName.trim() && store.guestEmail.trim() && store.guestPhone.trim();

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceType: store.serviceType,
          originAirportId: store.originAirportId || undefined,
          destinationAirportId: store.destinationAirportId || undefined,
          fromZoneId: store.fromZoneId,
          toZoneId: store.toZoneId,
          hotelId: store.hotelId || undefined,
          vehicleTypeId: store.vehicleTypeId,
          jobDate: store.jobDate,
          pickupTime: store.pickupTime,
          paxCount: store.paxCount,
          guestName: store.guestName,
          guestEmail: store.guestEmail,
          guestPhone: store.guestPhone,
          guestCountry: store.guestCountry || undefined,
          flightNo: store.flightNo,
          terminal: store.terminal || undefined,
          carrier: store.carrier || undefined,
          extras: store.extras,
          customExtras: store.customExtras.length > 0 ? store.customExtras : undefined,
          notes: store.notes || undefined,
          paymentMethod: 'PAY_ON_ARRIVAL',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Booking failed. Please try again.');
      }
      const json = await res.json();
      const ref = json.data?.bookingRef ?? json.bookingRef ?? '';
      store.setField('bookingRef', ref);
      store.setField('accountCreated', json.data?.accountCreated ?? json.accountCreated ?? false);
      store.setField('accountEmail', json.data?.accountEmail ?? json.accountEmail ?? null);
      store.setField('accountPassword', json.data?.accountPassword ?? json.accountPassword ?? null);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${pc}15` }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: pc }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
            {store.bookingRef && (
              <p className="text-gray-500 mb-1">Your reference: <span className="font-bold text-gray-900">{store.bookingRef}</span></p>
            )}
            <p className="text-sm text-gray-400">A confirmation has been sent to {store.guestEmail}</p>
          </div>

          {store.accountCreated && store.accountEmail && (
            <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${pc}40` }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${pc}15` }}>
                  <KeyRound className="h-4 w-4" style={{ color: pc }} />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">Account Created for You</h3>
              </div>
              <p className="text-xs text-gray-500 mb-3">Log in to manage your booking, track your driver, and amend or cancel your trip.</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                  <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Email (username)</span>
                  <span className="font-mono font-semibold text-gray-900 text-xs">{store.accountEmail}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Password</span>
                  <span className="font-mono font-semibold text-gray-900 text-xs">{store.accountPassword ?? store.guestPhone}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">Your password is your mobile number. You can change it after logging in.</p>
              <a href="/w/login"
                className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ backgroundColor: pc }}>
                <ExternalLink className="h-3.5 w-3.5" />
                Go to My Account
              </a>
            </div>
          )}

          {!store.accountCreated && (
            <div className="text-center">
              <a href="/w/login" className="text-xs font-medium" style={{ color: pc }}>
                Already have an account? Log in to manage your booking →
              </a>
            </div>
          )}

          <button onClick={() => { store.reset(); router.push('/w'); }}
            className="w-full rounded-xl px-8 py-3 text-sm font-bold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

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
                  style={i === 2 ? { backgroundColor: pc, color: 'white' } : { backgroundColor: '#d1fae5', color: '#059669' }}>
                  {i < 2 ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === 2 ? 'text-gray-900' : 'text-emerald-600'}`}>{step}</span>
                {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your details</h1>
          <p className="mt-1 text-sm text-gray-500">We'll send your booking confirmation here.</p>
        </div>

        {/* Personal info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900 text-sm">
            <User className="h-4 w-4" style={{ color: pc }} />
            Personal Information
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Full Name *</Label>
              <Input placeholder="John Smith" value={store.guestName}
                onChange={(e) => store.setField('guestName', e.target.value)}
                className="border-gray-200 bg-gray-50 focus-visible:ring-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email *
                </Label>
                <Input type="email" placeholder="john@example.com" value={store.guestEmail}
                  onChange={(e) => store.setField('guestEmail', e.target.value)}
                  className="border-gray-200 bg-gray-50 focus-visible:ring-1" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Phone *
                </Label>
                <Input type="tel" placeholder="+20 123 456 789" value={store.guestPhone}
                  onChange={(e) => store.setField('guestPhone', e.target.value)}
                  className="border-gray-200 bg-gray-50 focus-visible:ring-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="h-3 w-3" /> Country
              </Label>
              <Input placeholder="United Kingdom" value={store.guestCountry}
                onChange={(e) => store.setField('guestCountry', e.target.value)}
                className="border-gray-200 bg-gray-50 focus-visible:ring-1" />
            </div>
          </div>
        </div>

        {/* Order summary */}
        {store.quotePrice !== null && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Booking Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Transfer</span>
                <span className="font-medium text-gray-900">{store.quoteCurrency} {store.quotePrice.toFixed(2)}</span>
              </div>
              {extraLines.map((line) => (
                <div key={line.name} className="flex justify-between text-gray-600">
                  <span>{line.name}{line.qty > 1 ? ` × ${line.qty}` : ''}</span>
                  <span className="font-medium text-gray-900">{store.quoteCurrency} {line.cost.toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span style={{ color: pc }}>{store.quoteCurrency} {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ backgroundColor: pc }}
        >
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : 'Confirm Booking'}
        </button>

        <p className="text-center text-xs text-gray-400">
          By confirming you agree to our terms of service. Payment is collected on arrival.
        </p>
      </div>
    </div>
  );
}
