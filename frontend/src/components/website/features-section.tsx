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

// ── Icon lookup ──

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

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-600' },
};

// ── Default feature keys (translated via i18n) ──

const DEFAULT_FEATURE_KEYS = [
  { icon: 'headphones', titleKey: 'features.supportTitle', descKey: 'features.supportDesc', color: 'blue' },
  { icon: 'star', titleKey: 'features.meetGreetTitle', descKey: 'features.meetGreetDesc', color: 'green' },
  { icon: 'shield', titleKey: 'features.driversTitle', descKey: 'features.driversDesc', color: 'purple' },
  { icon: 'plane', titleKey: 'features.flightTitle', descKey: 'features.flightDesc', color: 'indigo' },
  { icon: 'clock', titleKey: 'features.noFeesTitle', descKey: 'features.noFeesDesc', color: 'amber' },
  { icon: 'credit-card', titleKey: 'features.paymentTitle', descKey: 'features.paymentDesc', color: 'teal' },
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
    <section className="bg-white px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
            {settings.featuresTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">
            {t('features.subtitle')}
          </p>
        </div>

        {/* Feature Grid */}
        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, idx) => {
            const IconComponent = ICON_MAP[feature.icon] ?? Shield;
            const colorSet = COLOR_MAP[feature.color ?? 'blue'] ?? COLOR_MAP.blue;

            return (
              <div
                key={idx}
                className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorSet.bg} ${colorSet.text} transition-transform duration-200 group-hover:scale-110`}
                >
                  <IconComponent className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
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
