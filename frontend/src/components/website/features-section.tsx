'use client';

import {
  Headphones,
  Shield,
  Star,
  Plane,
  Clock,
  CreditCard,
  MapPin,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SiteSettings, FeatureItem } from '@/lib/site-settings';
import { useWT } from '@/lib/website-i18n';

interface FeaturesSectionProps {
  settings: SiteSettings;
}

const ICON_MAP: Record<string, LucideIcon> = {
  headphones: Headphones,
  shield: Shield,
  star: Star,
  plane: Plane,
  clock: Clock,
  'credit-card': CreditCard,
  'map-pin': MapPin,
  users: Users,
};

const GRADIENT_MAP: Record<string, { from: string; to: string; text: string }> = {
  blue:   { from: '#dbeafe', to: '#bfdbfe', text: '#2563eb' },
  green:  { from: '#dcfce7', to: '#bbf7d0', text: '#16a34a' },
  purple: { from: '#f3e8ff', to: '#e9d5ff', text: '#9333ea' },
  red:    { from: '#fee2e2', to: '#fecaca', text: '#dc2626' },
  amber:  { from: '#fef3c7', to: '#fde68a', text: '#d97706' },
  indigo: { from: '#e0e7ff', to: '#c7d2fe', text: '#4f46e5' },
  teal:   { from: '#ccfbf1', to: '#99f6e4', text: '#0d9488' },
  pink:   { from: '#fce7f3', to: '#fbcfe8', text: '#db2777' },
};

const DEFAULT_FEATURE_KEYS = [
  { icon: 'headphones', titleKey: 'features.supportTitle',  descKey: 'features.supportDesc',  color: 'blue'   },
  { icon: 'star',       titleKey: 'features.meetGreetTitle',descKey: 'features.meetGreetDesc',color: 'green'  },
  { icon: 'shield',     titleKey: 'features.driversTitle',  descKey: 'features.driversDesc',  color: 'purple' },
  { icon: 'plane',      titleKey: 'features.flightTitle',   descKey: 'features.flightDesc',   color: 'indigo' },
  { icon: 'clock',      titleKey: 'features.noFeesTitle',   descKey: 'features.noFeesDesc',   color: 'amber'  },
  { icon: 'credit-card',titleKey: 'features.paymentTitle',  descKey: 'features.paymentDesc',  color: 'teal'   },
];

export function FeaturesSection({ settings }: FeaturesSectionProps) {
  const t = useWT();

  if (!settings.featuresEnabled) return null;

  const hasCmsFeatures =
    settings.featuresJson && Array.isArray(settings.featuresJson) && settings.featuresJson.length > 0;

  const features: FeatureItem[] = hasCmsFeatures
    ? settings.featuresJson!
    : DEFAULT_FEATURE_KEYS.map((f) => ({
        icon: f.icon,
        title: t(f.titleKey),
        description: t(f.descKey),
        color: f.color,
      }));

  return (
    <section className="bg-gray-50/60 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
            {settings.featuresTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">
            {t('features.subtitle')}
          </p>
        </div>

        {/* Grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, idx) => {
            const IconComponent = ICON_MAP[feature.icon] ?? Shield;
            const grad = GRADIENT_MAP[feature.color ?? 'blue'] ?? GRADIENT_MAP.blue;

            return (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                {/* subtle gradient bleed on hover */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${grad.from}60, transparent 70%)`,
                  }}
                />

                <div
                  className="relative flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                  }}
                >
                  <IconComponent className="h-6 w-6" style={{ color: grad.text }} />
                </div>
                <h3 className="relative mt-4 text-base font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-gray-500">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
