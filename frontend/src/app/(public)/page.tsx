'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Headphones,
  Star,
  Shield,
  Search,
  CreditCard,
  Plane,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <>
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-24 text-center sm:py-32 lg:py-40">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15)_0%,transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Book Your Airport Transfer
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/70 sm:text-xl">
            Safe, comfortable, and reliable private transfers across Egypt.
            From the airport to your hotel, we have got you covered.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="gap-2 bg-blue-600 px-8 text-base font-semibold text-white hover:bg-blue-700"
            >
              <Link href="/book">
                Book Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/20 bg-transparent px-8 text-base text-white hover:bg-white/10"
            >
              <Link href="/booking/lookup">Track a Booking</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="bg-white px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            Why Choose iTour Transfers?
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Trusted by thousands of travelers every year
          </p>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1 */}
            <Card className="border-0 bg-gray-50 shadow-none">
              <CardContent className="flex flex-col items-center text-center pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <Headphones className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">24/7 Support</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Our customer support team is available around the clock to assist you
                  with any questions or changes to your booking.
                </p>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="border-0 bg-gray-50 shadow-none">
              <CardContent className="flex flex-col items-center text-center pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-100 text-green-600">
                  <Star className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">Meet &amp; Greet</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Your driver will meet you at arrivals with a name sign, help with
                  luggage, and escort you to your vehicle.
                </p>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="border-0 bg-gray-50 shadow-none">
              <CardContent className="flex flex-col items-center text-center pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                  <Shield className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  Professional Drivers
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Licensed, experienced, and vetted drivers with modern, well-maintained
                  vehicles for a safe and comfortable ride.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-gray-50 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            How It Works
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Book your transfer in three simple steps
          </p>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/30">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-gray-900">1. Search</h3>
              <p className="mt-2 text-sm text-gray-500">
                Enter your trip details -- pickup, drop-off, date, and passengers --
                to get an instant price quote.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/30">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-gray-900">2. Book</h3>
              <p className="mt-2 text-sm text-gray-500">
                Fill in your details, choose extras if needed, and pay securely online
                or opt to pay on arrival.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/30">
                <Plane className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-gray-900">3. Travel</h3>
              <p className="mt-2 text-sm text-gray-500">
                Receive your confirmation, meet your driver at the airport, and enjoy
                a smooth, comfortable transfer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-16 text-center sm:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to Book Your Transfer?
          </h2>
          <p className="mt-3 text-lg text-white/80">
            Get an instant quote and book in under 2 minutes
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 gap-2 bg-white px-10 text-base font-semibold text-blue-700 hover:bg-gray-100"
          >
            <Link href="/book">
              Book Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
