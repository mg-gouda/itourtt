'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Search,
  CreditCard,
  Plane,
  CheckCircle2,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroSection } from '@/components/website/hero-section';
import { BookingWidget } from '@/components/website/booking-widget';
import { FeaturesSection } from '@/components/website/features-section';
import type { SiteSettings } from '@/lib/site-settings';
import { useWT } from '@/lib/website-i18n';

interface LandingClientProps {
  settings: SiteSettings;
}

export function WebsiteLandingClient({ settings }: LandingClientProps) {
  const t = useWT();

  return (
    <>
      {/* ── Hero with Booking Widget ── */}
      <HeroSection settings={settings}>
        <BookingWidget settings={settings} />
      </HeroSection>

      {/* ── Features Section ── */}
      <FeaturesSection settings={settings} />

      {/* ── How It Works ── */}
      <section className="bg-white px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
              {t('landing.howItWorks')}
            </h2>
            <p className="mt-3 text-gray-500">
              {t('landing.threeSteps')}
            </p>
          </div>

          <div className="relative mt-14 grid grid-cols-1 gap-12 md:grid-cols-3">
            {/* Connecting line – desktop only */}
            <div className="absolute left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] top-8 hidden border-t-2 border-dashed border-gray-200 md:block" />

            {[
              { Icon: Search,   step: '1', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
              { Icon: CreditCard, step: '2', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
              { Icon: Plane,    step: '3', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
            ].map(({ Icon, step, title, desc }) => (
              <div key={step} className="relative flex flex-col items-center text-center">
                <div
                  className="relative flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{
                    backgroundColor: settings.primaryColor,
                    boxShadow: `0 8px 24px ${settings.primaryColor}35`,
                  }}
                >
                  <Icon className="h-7 w-7" />
                  <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-extrabold shadow-sm" style={{ color: settings.primaryColor }}>
                    {step}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Indicators ── */}
      <section className="bg-gray-50/60 px-4 py-14 sm:py-18">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { value: '10,000+', label: t('landing.happyTravelers') },
              { value: '99%',     label: t('landing.onTimeRate') },
              { value: '24/7',    label: t('landing.customerSupport') },
              { value: '4.9',     label: t('landing.averageRating'), icon: Star },
            ].map(({ value, label, icon: StatIcon }) => (
              <div
                key={label}
                className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-4 py-6 text-center shadow-sm"
              >
                <div className="flex items-center gap-1">
                  <span
                    className="text-3xl font-extrabold sm:text-4xl"
                    style={{ color: settings.primaryColor }}
                  >
                    {value}
                  </span>
                  {StatIcon && (
                    <StatIcon className="h-5 w-5 fill-amber-400 text-amber-400" />
                  )}
                </div>
                <p className="mt-1.5 text-xs font-medium text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials / Social Proof ── */}
      <section className="bg-white px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            {t('landing.guestsSay')}
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { quote: t('testimonial.1.quote'), name: t('testimonial.1.name'), location: t('testimonial.1.location') },
              { quote: t('testimonial.2.quote'), name: t('testimonial.2.name'), location: t('testimonial.2.location') },
              { quote: t('testimonial.3.quote'), name: t('testimonial.3.name'), location: t('testimonial.3.location') },
            ].map((testimonial) => (
              <div
                key={testimonial.name}
                className="flex flex-col rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-600">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{testimonial.name}</p>
                    <p className="text-xs text-gray-400">{testimonial.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Book With Us ── */}
      <section className="bg-gray-50/60 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            {settings.siteName} — {t('landing.theDifference')}
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              t('landing.noHiddenFees'),
              t('landing.freeCancellation'),
              t('landing.flightTracking'),
              t('landing.proDrivers'),
              t('landing.modernVehicles'),
              t('landing.doorToDoor'),
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${settings.primaryColor}15` }}
                >
                  <CheckCircle2
                    className="h-4 w-4"
                    style={{ color: settings.primaryColor }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="px-4 py-16 text-center sm:py-20"
        style={{
          background: `linear-gradient(135deg, ${settings.primaryColor}, ${settings.accentColor})`,
        }}
      >
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            {t('landing.readyToBook')}
          </h2>
          <p className="mt-3 text-lg text-white/80">
            {t('landing.instantQuote')}
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 gap-2 bg-white px-10 text-base font-semibold hover:bg-gray-100"
            style={{ color: settings.primaryColor }}
          >
            <Link href="/book">
              {t('booking.bookNow')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
