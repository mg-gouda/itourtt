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

// ── Default features ──

const DEFAULT_FEATURES: FeatureItem[] = [
  {
    icon: 'headphones',
    title: '24/7 Customer Support',
    description:
      'Our dedicated support team is available around the clock to assist you with any questions or changes to your booking.',
    color: 'blue',
  },
  {
    icon: 'star',
    title: 'Meet & Greet Service',
    description:
      'Your driver will meet you at arrivals with a name sign, help with luggage, and escort you to your vehicle.',
    color: 'green',
  },
  {
    icon: 'shield',
    title: 'Professional Drivers',
    description:
      'Licensed, experienced, and vetted drivers with modern, well-maintained vehicles for a safe and comfortable ride.',
    color: 'purple',
  },
  {
    icon: 'plane',
    title: 'Flight Monitoring',
    description:
      'We track your flight in real-time and adjust pickup times automatically for delays or early arrivals.',
    color: 'indigo',
  },
  {
    icon: 'clock',
    title: 'No Hidden Fees',
    description:
      'The price you see is the price you pay. No surge pricing, no unexpected charges, and free cancellation up to 24h before.',
    color: 'amber',
  },
  {
    icon: 'credit-card',
    title: 'Secure Payment',
    description:
      'Pay securely online or choose to pay your driver on arrival. All transactions are encrypted and protected.',
    color: 'teal',
  },
];

export function FeaturesSection({ settings }: FeaturesSectionProps) {
  if (!settings.featuresEnabled) return null;

  const features: FeatureItem[] =
    settings.featuresJson && Array.isArray(settings.featuresJson) && settings.featuresJson.length > 0
      ? settings.featuresJson
      : DEFAULT_FEATURES;

  return (
    <section className="bg-white px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
            {settings.featuresTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-500">
            Trusted by thousands of travelers every year for reliable, comfortable transfers
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
