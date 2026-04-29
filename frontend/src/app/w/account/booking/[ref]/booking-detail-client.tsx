'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, ArrowLeft, Plane, Car, Calendar, Clock, Users,
  Phone, User, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/w-api`;

interface BookingDetail {
  id: string;
  bookingRef: string;
  bookingStatus: string;
  serviceType: string;
  jobDate: string;
  pickupTime: string | null;
  paxCount: number;
  total: string;
  currency: string;
  flightNo: string | null;
  carrier: string | null;
  terminal: string | null;
  notes: string | null;
  amendedAt: string | null;
  fromZone: { name: string } | null;
  toZone: { name: string } | null;
  originAirport: { name: string } | null;
  destinationAirport: { name: string } | null;
  hotel: { name: string } | null;
  vehicleType: { name: string } | null;
  trafficJob: {
    internalRef: string;
    status: string;
    assignment: {
      vehicle: { plateNumber: string; carBrand: string | null; carModel: string | null } | null;
      driver: { name: string; mobileNumber: string } | null;
      rep: { name: string; mobileNumber: string } | null;
    } | null;
    flight: { flightNo: string; carrier: string | null; terminal: string | null } | null;
  } | null;
}

interface Props { settings: SiteSettings; bookingRef: string; }

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export function BookingDetailClient({ settings, bookingRef }: Props) {
  const router = useRouter();
  const pc = settings.primaryColor;
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('b2c_token');
    if (!token) { router.replace('/w/login'); return; }

    fetch(`${API}/bookings/${bookingRef}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace('/w/login'); return null; }
        return r.json();
      })
      .then((json) => {
        if (!json) return;
        setBooking(json.data ?? json);
      })
      .catch(() => setError('Failed to load booking'))
      .finally(() => setLoading(false));
  }, [bookingRef, router]);

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setActionLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('b2c_token') ?? '';
      const res = await fetch(`${API}/bookings/${bookingRef}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Cancellation failed');
      setSuccess('Your booking has been cancelled.');
      setBooking((prev) => prev ? { ...prev, bookingStatus: 'CANCELLED' } : prev);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Booking not found</p>
          <button onClick={() => router.push('/w/account')} className="text-sm font-medium" style={{ color: pc }}>← Back to My Account</button>
        </div>
      </div>
    );
  }

  const jobDate = booking.jobDate
    ? new Date(booking.jobDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const pickupTime = booking.pickupTime
    ? new Date(booking.pickupTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const origin = booking.originAirport?.name ?? booking.fromZone?.name ?? '—';
  const dest = booking.destinationAirport?.name ?? booking.toZone?.name ?? '—';

  const isCancelled = booking.bookingStatus === 'CANCELLED';
  const isActive = ['CONFIRMED', 'CONVERTED'].includes(booking.bookingStatus);

  // Compute hours until job for window checks
  const jobDt = new Date(booking.jobDate);
  if (booking.pickupTime) {
    const pt = new Date(booking.pickupTime);
    jobDt.setHours(pt.getHours(), pt.getMinutes(), 0, 0);
  }
  const hoursUntilJob = (jobDt.getTime() - Date.now()) / 3_600_000;
  const canAmend = isActive && hoursUntilJob >= 24;
  const canCancel = isActive && hoursUntilJob >= 48;

  const assigned = booking.trafficJob?.assignment?.driver || booking.trafficJob?.assignment?.vehicle;

  return (
    <div className="min-h-screen pt-20 bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/w/account')} className="text-gray-400 hover:text-gray-700 transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-mono">{booking.bookingRef}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {booking.serviceType === 'ARR' ? 'Arrival Transfer' : booking.serviceType === 'DEP' ? 'Departure Transfer' : 'City Transfer'}
            </p>
          </div>
          <span className={`ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            isCancelled ? 'bg-red-100 text-red-600' :
            booking.bookingStatus === 'CONVERTED' ? 'bg-blue-100 text-blue-700' :
            'bg-emerald-100 text-emerald-700'
          }`}>
            {booking.bookingStatus}
          </span>
        </div>

        {success && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Trip details */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
            {booking.serviceType === 'ARR' ? <Plane className="h-4 w-4" style={{ color: pc }} /> : <Car className="h-4 w-4" style={{ color: pc }} />}
            Trip Details
          </h2>
          <InfoRow label="From" value={origin} />
          <InfoRow label="To" value={dest} />
          {booking.hotel && <InfoRow label="Hotel" value={booking.hotel.name} />}
          <InfoRow label="Date" value={<span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-gray-400" />{jobDate}</span>} />
          {pickupTime && <InfoRow label="Pickup" value={<span className="flex items-center gap-1"><Clock className="h-3 w-3 text-gray-400" />{pickupTime}</span>} />}
          <InfoRow label="Passengers" value={<span className="flex items-center gap-1"><Users className="h-3 w-3 text-gray-400" />{booking.paxCount}</span>} />
          {booking.vehicleType && <InfoRow label="Vehicle" value={booking.vehicleType.name} />}
          <InfoRow label="Total" value={<span className="font-bold" style={{ color: pc }}>{booking.currency} {Number(booking.total).toFixed(2)}</span>} />
        </div>

        {/* Flight info */}
        {(booking.flightNo || booking.trafficJob?.flight) && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
              <Plane className="h-4 w-4" style={{ color: pc }} /> Flight Information
            </h2>
            <InfoRow label="Flight No." value={booking.flightNo ?? booking.trafficJob?.flight?.flightNo ?? '—'} />
            {(booking.carrier ?? booking.trafficJob?.flight?.carrier) && (
              <InfoRow label="Airline / Route" value={booking.carrier ?? booking.trafficJob?.flight?.carrier ?? '—'} />
            )}
            {(booking.terminal ?? booking.trafficJob?.flight?.terminal) && (
              <InfoRow label="Terminal" value={booking.terminal ?? booking.trafficJob?.flight?.terminal ?? '—'} />
            )}
          </div>
        )}

        {/* Assignment card — shows after dispatch assigns */}
        {assigned && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${pc}40` }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
              <CheckCircle2 className="h-4 w-4" style={{ color: pc }} /> Your Transfer Team
            </h2>
            {booking.trafficJob?.assignment?.vehicle && (
              <InfoRow label="Vehicle" value={<span className="font-mono">{booking.trafficJob.assignment.vehicle.plateNumber}{booking.trafficJob.assignment.vehicle.carBrand ? ` — ${[booking.trafficJob.assignment.vehicle.carBrand, booking.trafficJob.assignment.vehicle.carModel].filter(Boolean).join(' ')}` : ''}</span>} />
            )}
            {booking.trafficJob?.assignment?.driver && (
              <InfoRow label="Driver" value={
                <span className="flex items-center gap-2">
                  <User className="h-3 w-3 text-gray-400" /> {booking.trafficJob.assignment.driver.name}
                  <a href={`tel:${booking.trafficJob.assignment.driver.mobileNumber}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: pc }}>
                    <Phone className="h-3 w-3" /> {booking.trafficJob.assignment.driver.mobileNumber}
                  </a>
                </span>
              } />
            )}
            {booking.trafficJob?.assignment?.rep && (
              <InfoRow label="Rep" value={
                <span className="flex items-center gap-2">
                  <User className="h-3 w-3 text-gray-400" /> {booking.trafficJob.assignment.rep.name}
                  <a href={`tel:${booking.trafficJob.assignment.rep.mobileNumber}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: pc }}>
                    <Phone className="h-3 w-3" /> {booking.trafficJob.assignment.rep.mobileNumber}
                  </a>
                </span>
              } />
            )}
          </div>
        )}

        {/* Amendment / cancellation windows */}
        {isActive && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Manage Booking</h2>
            {!canAmend && !canCancel && (
              <p className="text-xs text-gray-400">
                The amendment and cancellation windows have closed (24h and 48h before departure respectively).
              </p>
            )}
            {canAmend && (
              <button
                onClick={() => router.push(`/w/account/booking/${bookingRef}/amend`)}
                className="w-full rounded-xl py-2.5 text-sm font-semibold border-2 transition"
                style={{ borderColor: pc, color: pc }}>
                Request Amendment
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="w-full rounded-xl py-2.5 text-sm font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel Booking
              </button>
            )}
          </div>
        )}

        <button onClick={() => router.push('/w/account')}
          className="w-full text-sm text-gray-400 hover:text-gray-700 transition py-2">
          ← Back to All Bookings
        </button>
      </div>
    </div>
  );
}
