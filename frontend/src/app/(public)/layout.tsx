import { fetchSiteSettings, DEFAULT_SITE_SETTINGS } from '@/lib/site-settings';
import { WebsiteShell } from '../w/website-shell';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let settings = DEFAULT_SITE_SETTINGS;
  try {
    settings = await fetchSiteSettings();
  } catch {
    // Use defaults
  }

  return <WebsiteShell settings={settings}>{children}</WebsiteShell>;
}
