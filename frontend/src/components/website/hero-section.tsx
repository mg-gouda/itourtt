'use client';

import type { SiteSettings } from '@/lib/site-settings';

interface HeroSectionProps {
  settings: SiteSettings;
  children?: React.ReactNode; // Slot for the booking widget
}

export function HeroSection({ settings, children }: HeroSectionProps) {
  const hasImage = !!settings.heroImageUrl;

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${settings.heroGradientFrom} 0%, ${settings.heroGradientTo} 100%)`,
        }}
      />

      {/* Optional background image overlay */}
      {hasImage && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{ backgroundImage: `url(${settings.heroImageUrl})` }}
        />
      )}

      {/* Decorative glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12)_0%,transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.08)_0%,transparent_60%)]" />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Content */}
      <div className="relative px-4 py-20 sm:py-28 lg:py-36">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {settings.heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
            {settings.heroSubtitle}
          </p>
        </div>

        {/* Booking Widget slot */}
        {children && (
          <div className="mx-auto mt-12 max-w-4xl sm:mt-16">{children}</div>
        )}
      </div>

    </section>
  );
}
