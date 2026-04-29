'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight, Loader2, LogOut, Plane, Car } from 'lucide-react';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/w-api`;

interface AccountClientProps { settings: SiteSettings; }

interface Booking {
  id: string;
  bookingRef: string;
  bookingStatus: string;
  serviceType: string;
  jobDate: string;
  pickupTime: string | null;
  paxCount: number;
  total: string;
  currency: string;
  fromZone: { name: string } | null;
  toZone: { name: string } | null;
  originAirport: { name: string } | null;
  destinationAirport: { name: string } | null;
  vehicleType: { name: string } | null;
  trafficJob: {
    status: string;
    assignment: {
      vehicle: { plateNumber: string } | null;
      driver: { name: string; mobileNumber: string } | null;
      rep: { name: string; mobileNumber: string } | null;
    } | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  CONVERTED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-600',
  AMENDED: 'bg-yellow-100 text-yellow-700',
};

export function AccountClient({ settings }: AccountClientProps) {
  const router = useRouter();
  const pc = settings.primaryColor;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('b2c_token');
    const userStr = localStorage.getItem('b2c_user');
    if (!token) { router.replace('/w/login'); return; }
    if (userStr) { try { setUser(JSON.parse(userStr)); } catch {} }

    fetch(`${API}/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace('/w/login'); return null; }
        return r.json();
      })
      .then((json) => {
        if (!json) return;
        setBookings(json.data ?? json ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('b2c_token');
    localStorage.removeItem('b2c_user');
    router.push('/w/login');
  };

  return (
    <div className="min-h-screen pt-20 bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
            {user && <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>}
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No bookings found</p>
          </div>
        )}

        <div className="space-y-3">
          {bookings.map((b) => {
            const origin = b.originAirport?.name ?? b.fromZone?.name ?? '—';
            const dest = b.destinationAirport?.name ?? b.toZone?.name ?? '—';
            const statusClass = STATUS_COLORS[b.bookingStatus] ?? 'bg-gray-100 text-gray-600';
            const jobDate = b.jobDate ? new Date(b.jobDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

            return (
              <button key={b.id}
                onClick={() => router.push(`/w/account/booking/${b.bookingRef}`)}
                className="w-full text-left rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-900">{b.bookingRef}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                        {b.bookingStatus}
                      </span>
                      {b.trafficJob?.status && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                          {b.trafficJob.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
                      {b.serviceType === 'ARR' ? <Plane className="h-3.5 w-3.5 text-gray-400 rotate-[135deg]" /> : <Car className="h-3.5 w-3.5 text-gray-400" />}
                      <span className="truncate">{origin}</span>
                      <span className="text-gray-300">→</span>
                      <span className="truncate">{dest}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span>{jobDate}</span>
                      {b.pickupTime && <span>{new Date(b.pickupTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                      <span>{b.paxCount} pax</span>
                      <span className="font-semibold text-gray-700">{b.currency} {Number(b.total).toFixed(2)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                </div>

                {b.trafficJob?.assignment?.driver && (
                  <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-medium text-emerald-600">Driver assigned:</span>
                    <span>{b.trafficJob.assignment.driver.name}</span>
                    {b.trafficJob.assignment.vehicle && <span className="ml-auto font-mono text-gray-400">{b.trafficJob.assignment.vehicle.plateNumber}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
