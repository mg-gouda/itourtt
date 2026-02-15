'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CreditCard,
  Banknote,
  Loader2,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StepIndicator } from '@/components/public/step-indicator';
import { useBookingStore } from '@/stores/booking-store';
import { cn } from '@/lib/utils';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api`;
const STEPS = ['Search', 'Details', 'Payment', 'Confirmation'];

const SERVICE_LABELS: Record<string, string> = {
  ARR: 'Arrival Transfer',
  DEP: 'Departure Transfer',
  EXCURSION: 'Excursion',
  CITY: 'City Transfer',
};

const PAYMENT_GATEWAYS = [
  { id: 'STRIPE', label: 'Stripe', description: 'Visa, Mastercard, and more' },
  { id: 'EGYPT_BANK', label: 'Egypt Bank', description: 'Local Egyptian bank payment' },
  { id: 'DUBAI_BANK', label: 'Dubai Bank', description: 'UAE bank payment' },
];

export default function BookPaymentPage() {
  const router = useRouter();
  const store = useBookingStore();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!store.paymentMethod) return;

    setError('');
    setSubmitting(true);

    try {
      const body = {
        serviceType: store.serviceType,
        fromZoneId: store.fromZoneId,
        toZoneId: store.toZoneId,
        hotelId: store.hotelId || undefined,
        originAirportId: store.originAirportId || undefined,
        destinationAirportId: store.destinationAirportId || undefined,
        jobDate: store.jobDate,
        pickupTime: store.pickupTime,
        paxCount: store.paxCount,
        vehicleTypeId: store.vehicleTypeId,
        guestName: store.guestName,
        guestEmail: store.guestEmail,
        guestPhone: store.guestPhone,
        guestCountry: store.guestCountry || undefined,
        flightNo: store.flightNo || undefined,
        carrier: store.carrier || undefined,
        terminal: store.terminal || undefined,
        extras: store.extras,
        notes: store.notes || undefined,
        paymentMethod: store.paymentMethod,
        paymentGateway: store.paymentGateway || undefined,
      };

      const res = await fetch(`${API}/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to create booking');
      }

      const json = await res.json();
      const data = json.data ?? json;
      const ref = data.bookingRef || data.ref || data.id || '';
      store.setField('bookingRef', ref);

      // If online payment, redirect to payment URL
      if (store.paymentMethod === 'ONLINE' && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      // Otherwise, go to confirmation
      router.push('/book/confirmation');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <StepIndicator steps={STEPS} currentStep={3} />

      {/* Booking Summary */}
      <Card className="mt-2 border-blue-100 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-blue-800">Booking Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {/* Trip */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div>
                <span className="text-gray-500">Service:</span>{' '}
                <span className="font-medium">{SERVICE_LABELS[store.serviceType] || store.serviceType}</span>
              </div>
              <div>
                <span className="text-gray-500">Date:</span>{' '}
                <span className="font-medium">{store.jobDate}</span>
              </div>
              <div>
                <span className="text-gray-500">Time:</span>{' '}
                <span className="font-medium">{store.pickupTime}</span>
              </div>
              <div>
                <span className="text-gray-500">Passengers:</span>{' '}
                <span className="font-medium">{store.paxCount}</span>
              </div>
            </div>

            {/* Guest */}
            <div className="border-t pt-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                <div>
                  <span className="text-gray-500">Guest:</span>{' '}
                  <span className="font-medium">{store.guestName}</span>
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>{' '}
                  <span className="font-medium">{store.guestEmail}</span>
                </div>
                <div>
                  <span className="text-gray-500">Phone:</span>{' '}
                  <span className="font-medium">{store.guestPhone}</span>
                </div>
                {store.flightNo && (
                  <div>
                    <span className="text-gray-500">Flight:</span>{' '}
                    <span className="font-medium">{store.flightNo}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Total */}
            {store.quotePrice !== null && (
              <div className="border-t pt-2 text-right">
                <span className="text-gray-500">Total:</span>{' '}
                <span className="text-xl font-bold text-green-700">
                  {store.quoteCurrency} {store.quotePrice.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Method Selection */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-xl">Payment Method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Pay Online */}
            <button
              type="button"
              onClick={() => {
                store.setField('paymentMethod', 'ONLINE');
                if (!store.paymentGateway) store.setField('paymentGateway', 'STRIPE');
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all',
                store.paymentMethod === 'ONLINE'
                  ? 'border-blue-600 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full',
                  store.paymentMethod === 'ONLINE'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                <CreditCard className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Pay Online</p>
                <p className="mt-1 text-xs text-gray-500">
                  Secure payment via credit/debit card
                </p>
              </div>
              {store.paymentMethod === 'ONLINE' && (
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              )}
            </button>

            {/* Pay on Arrival */}
            <button
              type="button"
              onClick={() => {
                store.setField('paymentMethod', 'PAY_ON_ARRIVAL');
                store.setField('paymentGateway', '');
              }}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all',
                store.paymentMethod === 'PAY_ON_ARRIVAL'
                  ? 'border-green-600 bg-green-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div
                className={cn(
                  'flex h-14 w-14 items-center justify-center rounded-full',
                  store.paymentMethod === 'PAY_ON_ARRIVAL'
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                <Banknote className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Pay on Arrival</p>
                <p className="mt-1 text-xs text-gray-500">
                  Pay your driver in cash upon arrival
                </p>
              </div>
              {store.paymentMethod === 'PAY_ON_ARRIVAL' && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
            </button>
          </div>

          {/* Online Payment Gateway Sub-options */}
          {store.paymentMethod === 'ONLINE' && (
            <div className="rounded-lg border bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Select Payment Gateway</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PAYMENT_GATEWAYS.map((gw) => (
                  <button
                    key={gw.id}
                    type="button"
                    onClick={() => store.setField('paymentGateway', gw.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border px-4 py-3 text-left transition-all',
                      store.paymentGateway === gw.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    )}
                  >
                    <Building2 className={cn(
                      'h-4 w-4 shrink-0',
                      store.paymentGateway === gw.id ? 'text-blue-600' : 'text-gray-400'
                    )} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{gw.label}</p>
                      <p className="text-[11px] text-gray-500">{gw.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => router.push('/book/details')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!store.paymentMethod || submitting}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Booking'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
