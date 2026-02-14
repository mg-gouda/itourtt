'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const bookingRef = searchParams.get('ref') || '';

  return (
    <Card className="text-center">
      <CardContent className="py-12">
        {/* Success Icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-gray-900 sm:text-3xl">
          Payment Successful!
        </h1>
        <p className="mt-3 text-gray-500">
          Your payment has been processed successfully and your booking is confirmed.
        </p>

        {bookingRef && (
          <div className="mt-5">
            <p className="text-sm text-gray-500">Booking Reference</p>
            <p className="mt-1 text-xl font-mono font-bold tracking-wider text-blue-700">
              {bookingRef}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {bookingRef ? (
            <Button
              asChild
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              <Link href={`/booking/${bookingRef}`}>
                View Your Booking
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading...</div>}>
        <PaymentSuccessContent />
      </Suspense>
    </div>
  );
}
