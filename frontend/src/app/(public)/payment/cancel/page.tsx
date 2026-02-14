'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function PaymentCancelPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <Card className="text-center">
        <CardContent className="py-12">
          {/* Warning Icon */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <AlertCircle className="h-12 w-12 text-amber-600" />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-gray-900 sm:text-3xl">
            Payment Cancelled
          </h1>
          <p className="mt-3 text-gray-500">
            Your payment was not completed. Your booking has not been confirmed yet.
            You can try again or contact our support team for assistance.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              size="lg"
            >
              <Link href="/book/payment">
                <ArrowLeft className="h-4 w-4" />
                Try Again
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <a href="mailto:info@itour-tt.com">
                <Headphones className="h-4 w-4" />
                Contact Support
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
