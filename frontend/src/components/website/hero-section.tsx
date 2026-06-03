'use client';

import type { SiteSettings } from '@/lib/site-settings';

interface HeroSectionProps {
  settings: SiteSettings;
  children?: React.ReactNode; // Slot for the booking widget
}

export function HeroSection({ settings, children }: HeroSectionProps) {
  const hasImage = !!settings.heroImageUrl;

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-gray-50">
      {/* Subtle brand-tinted glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at top, ${settings.primaryColor}14 0%, transparent 55%)`,
        }}
      />

      {/* Optional background image overlay */}
      {hasImage && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.06]"
          style={{ backgroundImage: `url(${settings.heroImageUrl})` }}
        />
      )}

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Content */}
      <div className="relative px-4 pb-16 pt-16 sm:pb-20 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500 shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Private Airport Transfers · Egypt
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            {settings.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-500 sm:text-lg">
            {settings.heroSubtitle}
          </p>
        </div>

        {/* Booking Widget slot */}
        {children && (
          <div className="mx-auto mt-10 sm:mt-12 w-[85vw]">{children}</div>
        )}
      </div>

    </section>
  );
}
