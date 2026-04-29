import { fetchSiteSettings, DEFAULT_SITE_SETTINGS } from '@/lib/site-settings';
import { BookingDetailClient } from './booking-detail-client';

interface Props { params: Promise<{ ref: string }>; }

export default async function B2CBookingDetailPage({ params }: Props) {
  const { ref } = await params;
  let settings = DEFAULT_SITE_SETTINGS;
  try { settings = await fetchSiteSettings(); } catch { /* use defaults */ }
  return <BookingDetailClient settings={settings} bookingRef={ref} />;
}
