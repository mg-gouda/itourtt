'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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

const API = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api`;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-4 w-4" /> },
  CONFIRMED: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  ASSIGNED: { label: 'Driver Assigned', color: 'bg-purple-100 text-purple-700', icon: <Car className="h-4 w-4" /> },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: <XCircle className="h-4 w-4" /> },
  CONVERTED: { label: 'Converted to Job', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-4 w-4" /> },
};

const SERVICE_LABELS: Record<string, string> = {
  ARR: 'Arrival Transfer',
  DEP: 'Departure Transfer',
  EXCURSION: 'Excursion',
  CITY: 'City Transfer',
};

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

export default function BookingLookupPage() {
  const params = useParams();
  const router = useRouter();
  const ref = params.ref as string;

  const [searchRef, setSearchRef] = useState('');
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetchBooking = async (bookingRef: string) => {
    if (!bookingRef || bookingRef === 'lookup') return;

    setLoading(true);
    setError('');
    setBooking(null);

    try {
      const res = await fetch(`${API}/public/bookings/${encodeURIComponent(bookingRef)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Booking not found. Please check the reference and try again.');
        }
        throw new Error('Failed to fetch booking details');
      }
      const json = await res.json();
      setBooking(json.data ?? json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ref && ref !== 'lookup') {
      fetchBooking(ref);
    }
  }, [ref]);

  const handleSearch = () => {
    if (searchRef.trim()) {
      router.push(`/booking/${encodeURIComponent(searchRef.trim())}`);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    setCancelling(true);

    try {
      const res = await fetch(`${API}/public/bookings/${encodeURIComponent(booking.bookingRef)}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to cancel booking');
      }

      // Refresh booking data
      await fetchBooking(booking.bookingRef);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel';
      setError(message);
    } finally {
      setCancelling(false);
    }
  };

  const statusInfo = booking ? (STATUS_CONFIG[booking.bookingStatus] || STATUS_CONFIG.PENDING) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-blue-600" />
            Track Your Booking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter your booking reference (e.g. GB-240101-0001)"
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button
              onClick={handleSearch}
              disabled={!searchRef.trim()}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
            >
              <Search className="h-4 w-4" />
              Track
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Booking Details */}
      {booking && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">Booking Details</CardTitle>
                <p className="mt-1 font-mono text-lg font-bold text-blue-700">
                  {booking.bookingRef}
                </p>
              </div>
              {statusInfo && (
                <Badge className={`${statusInfo.color} gap-1 border-0 px-3 py-1`}>
                  {statusInfo.icon}
                  {statusInfo.label}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Trip Info */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <MapPin className="h-4 w-4 text-blue-600" />
                Trip Information
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                <div>
                  <span className="text-gray-500">Service:</span>{' '}
                  <span className="font-medium">{SERVICE_LABELS[booking.serviceType] || booking.serviceType}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>{' '}
                  <span className="font-medium">{booking.jobDate}</span>
                </div>
                <div>
                  <span className="text-gray-500">Pickup Time:</span>{' '}
                  <span className="font-medium">{booking.pickupTime}</span>
                </div>
                <div>
                  <span className="text-gray-500">Passengers:</span>{' '}
                  <span className="font-medium">{booking.paxCount}</span>
                </div>
                {booking.fromZone && (
                  <div>
                    <span className="text-gray-500">From:</span>{' '}
                    <span className="font-medium">{booking.fromZone.name}</span>
                  </div>
                )}
                {booking.toZone && (
                  <div>
                    <span className="text-gray-500">To:</span>{' '}
                    <span className="font-medium">{booking.toZone.name}</span>
                  </div>
                )}
                {booking.hotel && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Hotel:</span>{' '}
                    <span className="font-medium">{booking.hotel.name}</span>
                  </div>
                )}
                {booking.vehicleType && (
                  <div>
                    <span className="text-gray-500">Vehicle:</span>{' '}
                    <span className="font-medium">{booking.vehicleType.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Guest Info */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <User className="h-4 w-4 text-blue-600" />
                Guest Information
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                <div>
                  <span className="text-gray-500">Name:</span>{' '}
                  <span className="font-medium">{booking.guestName}</span>
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>{' '}
                  <span className="font-medium">{booking.guestEmail}</span>
                </div>
                <div>
                  <span className="text-gray-500">Phone:</span>{' '}
                  <span className="font-medium">{booking.guestPhone}</span>
                </div>
                {booking.guestCountry && (
                  <div>
                    <span className="text-gray-500">Country:</span>{' '}
                    <span className="font-medium">{booking.guestCountry}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Flight Info */}
            {booking.flightNo && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <Plane className="h-4 w-4 text-blue-600" />
                  Flight Details
                </h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                  <div>
                    <span className="text-gray-500">Flight:</span>{' '}
                    <span className="font-medium">{booking.flightNo}</span>
                  </div>
                  {booking.carrier && (
                    <div>
                      <span className="text-gray-500">Airline:</span>{' '}
                      <span className="font-medium">{booking.carrier}</span>
                    </div>
                  )}
                  {booking.terminal && (
                    <div>
                      <span className="text-gray-500">Terminal:</span>{' '}
                      <span className="font-medium">{booking.terminal}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Info */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <CreditCard className="h-4 w-4 text-blue-600" />
                Payment
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
                <div>
                  <span className="text-gray-500">Method:</span>{' '}
                  <span className="font-medium">
                    {booking.paymentMethod === 'PAY_ON_ARRIVAL' ? 'Pay on Arrival' : 'Online Payment'}
                  </span>
                </div>
                {booking.paymentStatus && (
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className="font-medium capitalize">{booking.paymentStatus}</span>
                  </div>
                )}
                {booking.total != null && (
                  <div>
                    <span className="text-gray-500">Total:</span>{' '}
                    <span className="text-lg font-bold text-green-700">
                      {booking.currency || 'USD'} {Number(booking.total).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {booking.notes && (
              <div className="rounded-lg bg-gray-50 p-4 text-sm">
                <span className="text-gray-500">Notes:</span>{' '}
                <span className="text-gray-700">{booking.notes}</span>
              </div>
            )}

            {/* Converted message */}
            {booking.bookingStatus === 'CONVERTED' && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm text-green-700">
                Your booking has been confirmed and a driver will be assigned.
                Driver details will be shared via email before your pickup time.
              </div>
            )}

            {/* Cancelled state */}
            {booking.bookingStatus === 'CANCELLED' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
                This booking has been cancelled.
              </div>
            )}

            {/* Cancel Button (only if CONFIRMED and not assigned) */}
            {booking.bookingStatus === 'CONFIRMED' && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancel Booking
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No ref and no booking — show prompt */}
      {(!ref || ref === 'lookup') && !booking && !loading && !error && (
        <div className="mt-8 text-center text-sm text-gray-500">
          Enter your booking reference above to view your booking details.
        </div>
      )}
    </div>
  );
}
