'use client';

import Link from 'next/link';
import {
  Mail,
  Phone,
  MessageCircle,
  Facebook,
  Instagram,
  Twitter,
} from 'lucide-react';
import type { SiteSettings } from '@/lib/site-settings';
import { useWT } from '@/lib/website-i18n';

interface SiteFooterProps {
  settings: SiteSettings;
}

// ── Shared sub-components ──

function SocialLinks({ settings }: { settings: SiteSettings }) {
  const socials = [
    { url: settings.socialFacebook, Icon: Facebook, label: 'Facebook' },
    { url: settings.socialInstagram, Icon: Instagram, label: 'Instagram' },
    { url: settings.socialTwitter, Icon: Twitter, label: 'Twitter' },
  ].filter((s) => s.url);

  if (socials.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {socials.map(({ url, Icon, label }) => (
        <a
          key={label}
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function ContactList({ settings }: { settings: SiteSettings }) {
  const items = [
    {
      value: settings.contactEmail,
      Icon: Mail,
      href: `mailto:${settings.contactEmail}`,
      color: 'text-blue-400',
    },
    {
      value: settings.contactPhone,
      Icon: Phone,
      href: `tel:${settings.contactPhone?.replace(/\s/g, '')}`,
      color: 'text-green-400',
    },
    {
      value: settings.contactWhatsapp,
      Icon: MessageCircle,
      href: `https://wa.me/${settings.contactWhatsapp?.replace(/[^0-9]/g, '')}`,
      color: 'text-emerald-400',
    },
  ].filter((c) => c.value);

  return (
    <ul className="space-y-3 text-sm">
      {items.map(({ value, Icon, href, color }) => (
        <li key={value} className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${color}`} />
          <a
            href={href}
            className="text-white/70 transition-colors hover:text-white"
          >
            {value}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Copyright({ siteName }: { siteName: string }) {
  const t = useWT();
  return (
    <div className="border-t border-white/10 pt-6 text-center text-xs text-white/40">
      &copy; {new Date().getFullYear()} {siteName}. {t('footer.rights')}
    </div>
  );
}

function useQuickLinks() {
  const t = useWT();
  return [
    { label: t('nav.home'), href: '/w' },
    { label: t('nav.bookNow'), href: '/w/book' },
    { label: t('nav.trackBooking'), href: '/w/booking/lookup' },
    { label: t('nav.myAccount'), href: '/w/account' },
  ];
}

// ── Preset: Default ──
// 3-column layout: about, links, contact
function DefaultFooter({ settings }: SiteFooterProps) {
  const t = useWT();
  const quickLinks = useQuickLinks();
  return (
    <footer className="text-white/70" style={{ backgroundColor: settings.footerBgColor }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Column 1: About */}
          <div>
            <h3 className="text-lg font-semibold text-white">{settings.siteName}</h3>
            <p className="mt-3 text-sm leading-relaxed">
              {t('footer.about')}
            </p>
            <div className="mt-4">
              <SocialLinks settings={settings} />
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-white">{t('footer.quickLinks')}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h3 className="text-lg font-semibold text-white">{t('footer.contactUs')}</h3>
            <div className="mt-3">
              <ContactList settings={settings} />
            </div>
          </div>
        </div>

        <div className="mt-10">
          <Copyright siteName={settings.siteName} />
        </div>
      </div>
    </footer>
  );
}

// ── Preset: Minimal ──
// Single line copyright
function MinimalFooter({ settings }: SiteFooterProps) {
  const t = useWT();
  const quickLinks = useQuickLinks();
  return (
    <footer className="text-white/70" style={{ backgroundColor: settings.footerBgColor }}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-white/40">
            &copy; {new Date().getFullYear()} {settings.siteName}. {t('footer.rights')}
          </p>
          <div className="flex items-center gap-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Preset: Expanded ──
// 4-column with social + newsletter placeholder
function ExpandedFooter({ settings }: SiteFooterProps) {
  const t = useWT();
  const quickLinks = useQuickLinks();
  return (
    <footer className="text-white/70" style={{ backgroundColor: settings.footerBgColor }}>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: About */}
          <div>
            <h3 className="text-lg font-semibold text-white">{settings.siteName}</h3>
            <p className="mt-3 text-sm leading-relaxed">
              {t('footer.about')}
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              {t('footer.quickLinks')}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              {t('footer.contactUs')}
            </h3>
            <div className="mt-4">
              <ContactList settings={settings} />
            </div>
          </div>

          {/* Column 4: Stay Connected */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              {t('footer.stayConnected')}
            </h3>
            <p className="mt-4 text-sm leading-relaxed">
              {t('footer.followUs')}
            </p>
            <div className="mt-4">
              <SocialLinks settings={settings} />
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Copyright siteName={settings.siteName} />
        </div>
      </div>
    </footer>
  );
}

// ── Preset: Centered ──
// Centered stack
function CenteredFooter({ settings }: SiteFooterProps) {
  const t = useWT();
  const quickLinks = useQuickLinks();
  return (
    <footer className="text-white/70" style={{ backgroundColor: settings.footerBgColor }}>
      <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6">
        <h3 className="text-lg font-semibold text-white">{settings.siteName}</h3>
        <p className="mt-3 text-sm leading-relaxed">
          {t('footer.about')}
        </p>

        <div className="mt-6 flex items-center justify-center gap-5">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {(settings.contactEmail || settings.contactPhone) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
            {settings.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="flex items-center gap-1.5 transition-colors hover:text-white"
              >
                <Mail className="h-4 w-4 text-blue-400" />
                {settings.contactEmail}
              </a>
            )}
            {settings.contactPhone && (
              <a
                href={`tel:${settings.contactPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-1.5 transition-colors hover:text-white"
              >
                <Phone className="h-4 w-4 text-green-400" />
                {settings.contactPhone}
              </a>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <SocialLinks settings={settings} />
        </div>

        <div className="mt-8">
          <Copyright siteName={settings.siteName} />
        </div>
      </div>
    </footer>
  );
}

// ── Export ──

export function SiteFooter({ settings }: SiteFooterProps) {
  switch (settings.footerPreset) {
    case 'minimal':
      return <MinimalFooter settings={settings} />;
    case 'expanded':
      return <ExpandedFooter settings={settings} />;
    case 'centered':
      return <CenteredFooter settings={settings} />;
    default:
      return <DefaultFooter settings={settings} />;
  }
}
