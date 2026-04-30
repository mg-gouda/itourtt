'use client';

import { useState } from 'react';
import {
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  User,
  Plane,
  CreditCard,
  Car,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWT } from '@/lib/website-i18n';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api`;

const STATUS_STYLES: Record<string, { key: string; color: string; icon: React.ReactNode }> = {
  PENDING: { key: 'track.statusPending', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-4 w-4" /> },
  CONFIRMED: { key: 'track.statusConfirmed', color: 'bg-blue-100 text-blue-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  ASSIGNED: { key: 'track.statusAssigned', color: 'bg-purple-100 text-purple-700', icon: <Car className="h-4 w-4" /> },
  COMPLETED: { key: 'track.statusCompleted', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  CANCELLED: { key: 'track.statusCancelled', color: 'bg-red-100 text-red-700', icon: <XCircle className="h-4 w-4" /> },
  CONVERTED: { key: 'track.statusConverted', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> },
};

function useServiceLabels() {
  const t = useWT();
  return {
    ARR: t('booking.arrivalTransfer'),
    DEP: t('booking.departureTransfer'),
    DAY_TOUR: 'Day Tour',
    ONE_WAY_TRANSFER: 'One Way Transfer',
    TWO_WAY_TRANSFER: 'Two Way Transfer',
  } as Record<string, string>;
}

interface BookingData {
  id: string;
  bookingRef: string;
  bookingStatus: string;
  serviceType: string;
  jobDate: string;
  pickupTime: string;
  paxCount: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestCountry?: string;
  flightNo?: string;
  carrier?: string;
  terminal?: string;
  fromZone?: { name: string };
  toZone?: { name: string };
  hotel?: { name: string };
  vehicleType?: { name: string };
  paymentMethod: string;
  paymentStatus?: string;
  total?: number;
  currency?: string;
  notes?: string;
  createdAt: string;
}

interface TrackBookingClientProps {
  settings: SiteSettings;
}

export function TrackBookingClient({ settings }: TrackBookingClientProps) {
  const t = useWT();
  const serviceLabels = useServiceLabels();
  const [searchRef, setSearchRef] = useState('');
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchBooking = async (bookingRef: string) => {
    if (!bookingRef) return;
    setLoading(true);
    setError('');
    setBooking(null);

    try {
      const res = await fetch(`${API}/public/bookings/${encodeURIComponent(bookingRef)}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(t('track.notFound'));
        throw new Error(t('common.error'));
      }
      const json = await res.json();
      setBooking(json.data ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchRef.trim()) fetchBooking(searchRef.trim());
  };

  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API}/public/bookings/${encodeURIComponent(booking.bookingRef)}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error(t('common.error'));
      await fetchBooking(booking.bookingRef);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCancelling(false);
    }
  };

  const statusStyle = booking ? (STATUS_STYLES[booking.bookingStatus] || STATUS_STYLES.PENDING) : null;
  const pc = settings.primaryColor;

  return (
    <>
      {/* Hero banner */}
      <section
        className="relative overflow-hidden px-4 py-16 sm:py-20"
        style={{
          background: `linear-gradient(135deg, ${settings.heroGradientFrom} 0%, ${settings.heroGradientTo} 100%)`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12)_0%,transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.08)_0%,transparent_60%)]" />

        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {t('track.title')}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-white/70">
            {t('track.enterRef')}
          </p>

          {/* Search bar inside hero */}
          <div className="mx-auto mt-8 flex max-w-xl gap-2">
            <Input
              placeholder={t('track.placeholder')}
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/30"
            />
            <Button
              onClick={handleSearch}
              disabled={!searchRef.trim() || loading}
              className="gap-2 font-semibold text-white shadow-lg"
              style={{ backgroundColor: pc }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t('track.search')}
            </Button>
          </div>
        </div>
      </section>

      {/* Results area */}
      <section className="bg-gray-50 px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-3xl">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Booking Details */}
          {booking && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{t('track.bookingDetails')}</CardTitle>
                    <p className="mt-1 font-mono text-lg font-bold" style={{ color: pc }}>{booking.bookingRef}</p>
                  </div>
                  {statusStyle && (
                    <Badge className={`${statusStyle.color} gap-1 border-0 px-3 py-1`}>
                      {statusStyle.icon}
                      {t(statusStyle.key)}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Trip Info */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    <MapPin className="h-4 w-4" style={{ color: pc }} /> {t('track.tripInfo')}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                    <div><span className="text-gray-500">{t('track.service')}:</span> <span className="font-medium">{serviceLabels[booking.serviceType] || booking.serviceType}</span></div>
                    <div><span className="text-gray-500">{t('track.date')}:</span> <span className="font-medium">{booking.jobDate}</span></div>
                    <div><span className="text-gray-500">{t('track.pickupTime')}:</span> <span className="font-medium">{booking.pickupTime}</span></div>
                    <div><span className="text-gray-500">{t('track.passengers')}:</span> <span className="font-medium">{booking.paxCount}</span></div>
                    {booking.fromZone && <div><span className="text-gray-500">{t('track.from')}:</span> <span className="font-medium">{booking.fromZone.name}</span></div>}
                    {booking.toZone && <div><span className="text-gray-500">{t('track.to')}:</span> <span className="font-medium">{booking.toZone.name}</span></div>}
                    {booking.hotel && <div className="col-span-2"><span className="text-gray-500">{t('track.hotel')}:</span> <span className="font-medium">{booking.hotel.name}</span></div>}
                    {booking.vehicleType && <div><span className="text-gray-500">{t('track.vehicle')}:</span> <span className="font-medium">{booking.vehicleType.name}</span></div>}
                  </div>
                </div>

                {/* Guest Info */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    <User className="h-4 w-4" style={{ color: pc }} /> {t('track.guestInfo')}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                    <div><span className="text-gray-500">{t('track.name')}:</span> <span className="font-medium">{booking.guestName}</span></div>
                    <div><span className="text-gray-500">{t('track.email')}:</span> <span className="font-medium">{booking.guestEmail}</span></div>
                    <div><span className="text-gray-500">{t('track.phone')}:</span> <span className="font-medium">{booking.guestPhone}</span></div>
                    {booking.guestCountry && <div><span className="text-gray-500">{t('track.country')}:</span> <span className="font-medium">{booking.guestCountry}</span></div>}
                  </div>
                </div>

                {/* Flight Info */}
                {booking.flightNo && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                      <Plane className="h-4 w-4" style={{ color: pc }} /> {t('track.flightDetails')}
                    </h3>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                      <div><span className="text-gray-500">{t('track.flight')}:</span> <span className="font-medium">{booking.flightNo}</span></div>
                      {booking.carrier && <div><span className="text-gray-500">{t('track.airline')}:</span> <span className="font-medium">{booking.carrier}</span></div>}
                      {booking.terminal && <div><span className="text-gray-500">{t('track.terminal')}:</span> <span className="font-medium">{booking.terminal}</span></div>}
                    </div>
                  </div>
                )}

                {/* Payment */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                    <CreditCard className="h-4 w-4" style={{ color: pc }} /> {t('track.payment')}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                    <div><span className="text-gray-500">{t('track.method')}:</span> <span className="font-medium">{booking.paymentMethod === 'PAY_ON_ARRIVAL' ? t('track.payOnArrival') : t('track.onlinePayment')}</span></div>
                    {booking.paymentStatus && <div><span className="text-gray-500">{t('track.status')}:</span> <span className="font-medium capitalize">{booking.paymentStatus}</span></div>}
                    {booking.total != null && <div><span className="text-gray-500">{t('track.total')}:</span> <span className="text-lg font-bold" style={{ color: pc }}>{booking.currency || 'USD'} {Number(booking.total).toFixed(2)}</span></div>}
                  </div>
                </div>

                {booking.notes && (
                  <div className="rounded-lg bg-gray-50 p-4 text-sm">
                    <span className="text-gray-500">{t('track.notes')}:</span> <span className="text-gray-700">{booking.notes}</span>
                  </div>
                )}

                {booking.bookingStatus === 'CONVERTED' && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm text-green-700">
                    {t('track.bookingConfirmed')}
                  </div>
                )}

                {booking.bookingStatus === 'CANCELLED' && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
                    {t('track.bookingCancelled')}
                  </div>
                )}

                {booking.bookingStatus === 'CONFIRMED' && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" onClick={handleCancel} disabled={cancelling} className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                      {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      {t('track.cancelBooking')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!booking && !loading && !error && (
            <div className="text-center text-sm text-gray-500">
              {t('track.enterRefAbove')}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
