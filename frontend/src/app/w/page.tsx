import { fetchSiteSettings, DEFAULT_SITE_SETTINGS } from '@/lib/site-settings';
import { WebsiteLandingClient } from './landing-client';

export default async function WebsiteLandingPage() {
  let settings = DEFAULT_SITE_SETTINGS;
  try {
    settings = await fetchSiteSettings();
  } catch {
    // Use defaults
  }

  return <WebsiteLandingClient settings={settings} />;
}
