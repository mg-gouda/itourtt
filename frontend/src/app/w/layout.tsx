import type { Metadata } from 'next';
import { fetchSiteSettings, DEFAULT_SITE_SETTINGS } from '@/lib/site-settings';
import { WebsiteShell } from './website-shell';

// ── Dynamic metadata from site settings ──

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchSiteSettings();

  return {
    title: settings.metaTitle ?? settings.siteName,
    description:
      settings.metaDescription ??
      'Professional airport transfer and transportation services across Egypt.',
    icons: {
      icon: settings.siteFaviconUrl ?? '/favicon.svg',
    },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// ── Google Font CSS URLs for dynamic loading ──

const FONT_CSS_MAP: Record<string, string> = {
  Inter:
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'Open Sans':
    'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap',
  Poppins:
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap',
  Roboto:
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap',
  Lato: 'https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap',
  Montserrat:
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap',
  'DM Sans':
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap',
  'Plus Jakarta Sans':
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
};

export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let settings = DEFAULT_SITE_SETTINGS;
  try {
    settings = await fetchSiteSettings();
  } catch {
    // Use defaults on failure
  }

  const fontUrl = FONT_CSS_MAP[settings.fontFamily];

  return (
    <>
      {/* Dynamic Google Font */}
      {fontUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={fontUrl} />
      )}

      {/* CSS custom properties for dynamic theming */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .website-root {
              --website-primary: ${settings.primaryColor};
              --website-accent: ${settings.accentColor};
              --website-nav-bg: ${settings.navBgColor};
              --website-footer-bg: ${settings.footerBgColor};
              --website-hero-from: ${settings.heroGradientFrom};
              --website-hero-to: ${settings.heroGradientTo};
              font-family: '${settings.fontFamily}', system-ui, -apple-system, sans-serif;
            }
          `,
        }}
      />

      <WebsiteShell settings={settings}>{children}</WebsiteShell>
    </>
  );
}
