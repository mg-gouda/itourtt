import { fetchSiteSettings, DEFAULT_SITE_SETTINGS } from '@/lib/site-settings';
import { AmendClient } from './amend-client';

interface Props { params: Promise<{ ref: string }>; }

export default async function AmendPage({ params }: Props) {
  const { ref } = await params;
  let settings = DEFAULT_SITE_SETTINGS;
  try { settings = await fetchSiteSettings(); } catch { /* use defaults */ }
  return <AmendClient settings={settings} bookingRef={ref} />;
}
