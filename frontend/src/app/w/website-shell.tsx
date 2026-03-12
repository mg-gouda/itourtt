'use client';

import { SiteHeader } from '@/components/website/site-header';
import { SiteFooter } from '@/components/website/site-footer';
import type { SiteSettings } from '@/lib/site-settings';
import { useLocaleStore, LANGUAGES } from '@/lib/website-i18n';

interface WebsiteShellProps {
  settings: SiteSettings;
  children: React.ReactNode;
}

export function WebsiteShell({ settings, children }: WebsiteShellProps) {
  const { locale } = useLocaleStore();
  const lang = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  return (
    <div
      className="website-root flex min-h-screen flex-col bg-white"
      dir={lang.dir}
    >
      <SiteHeader settings={settings} />
      <main className="flex-1">{children}</main>
      <SiteFooter settings={settings} />
    </div>
  );
}
