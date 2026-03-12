'use client';

import { BookingWidget } from '@/components/website/booking-widget';
import type { SiteSettings } from '@/lib/site-settings';

interface BookNowClientProps {
  settings: SiteSettings;
}

export function BookNowClient({ settings }: BookNowClientProps) {
  return (
    <section
      className="relative min-h-[80vh] overflow-hidden px-4 py-16 sm:py-24"
      style={{
        background: `linear-gradient(135deg, ${settings.heroGradientFrom} 0%, ${settings.heroGradientTo} 100%)`,
      }}
    >
      {/* Decorative glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12)_0%,transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.08)_0%,transparent_60%)]" />

      <div className="relative mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {settings.heroTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-white/70">
            {settings.heroSubtitle}
          </p>
        </div>
        <BookingWidget settings={settings} />
      </div>
    </section>
  );
}
