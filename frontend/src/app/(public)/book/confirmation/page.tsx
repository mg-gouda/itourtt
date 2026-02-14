'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/public/step-indicator';
import { useBookingStore } from '@/stores/booking-store';

const STEPS = ['Search', 'Details', 'Payment', 'Confirmation'];

const SERVICE_LABELS: Record<string, string> = {
  ARR: 'Arrival Transfer',
  DEP: 'Departure Transfer',
  EXCURSION: 'Excursion',
  CITY: 'City Transfer',
};

export default function BookConfirmationPage() {
  const store = useBookingStore();
  const resetDone = useRef(false);

  // Capture values before reset
  const bookingRef = store.bookingRef;
  const guestEmail = store.guestEmail;
  const serviceType = store.serviceType;
  const jobDate = store.jobDate;
  const pickupTime = store.pickupTime;
  const paxCount = store.paxCount;
  const quotePrice = store.quotePrice;
  const quoteCurrency = store.quoteCurrency;
  const paymentMethod = store.paymentMethod;

  useEffect(() => {
    // Reset the store after capturing values
    if (!resetDone.current) {
      resetDone.current = true;
      // Delay reset to ensure values are captured
      const timeout = setTimeout(() => {
        store.reset();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <StepIndicator steps={STEPS} currentStep={5} />

      <Card className="mt-2 text-center">
        <CardContent className="py-10">
          {/* Success Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-gray-900 sm:text-3xl">
            Booking Confirmed!
          </h1>

          {/* Booking Reference */}
          {bookingRef && (
            <div className="mt-4">
              <p className="text-sm text-gray-500">Your booking reference</p>
              <p className="mt-1 text-2xl font-mono font-bold tracking-wider text-blue-700">
                {bookingRef}
              </p>
            </div>
          )}

          {/* Trip Summary */}
          <div className="mx-auto mt-6 max-w-md rounded-lg border bg-gray-50 p-4 text-left text-sm">
            <div className="space-y-2">
              {serviceType && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium text-gray-900">
                    {SERVICE_LABELS[serviceType] || serviceType}
                  </span>
                </div>
              )}
              {jobDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-medium text-gray-900">{jobDate}</span>
                </div>
              )}
              {pickupTime && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Pickup Time</span>
                  <span className="font-medium text-gray-900">{pickupTime}</span>
                </div>
              )}
              {paxCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Passengers</span>
                  <span className="font-medium text-gray-900">{paxCount}</span>
                </div>
              )}
              {paymentMethod && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment</span>
                  <span className="font-medium text-gray-900">
                    {paymentMethod === 'PAY_ON_ARRIVAL' ? 'Pay on Arrival' : 'Online Payment'}
                  </span>
                </div>
              )}
              {quotePrice !== null && (
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium text-gray-700">Total</span>
                  <span className="text-lg font-bold text-green-700">
                    {quoteCurrency} {quotePrice.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Email confirmation */}
          {guestEmail && (
            <p className="mt-5 text-sm text-gray-500">
              You will receive a confirmation email at{' '}
              <span className="font-medium text-gray-700">{guestEmail}</span>
            </p>
          )}

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              <Link href="/book">
                Book Another Transfer
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {bookingRef && (
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link href={`/booking/${bookingRef}`}>
                  Track Your Booking
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
