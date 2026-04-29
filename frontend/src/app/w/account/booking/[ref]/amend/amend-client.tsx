'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/w-api`;

interface Props { settings: SiteSettings; bookingRef: string; }

export function AmendClient({ settings, bookingRef }: Props) {
  const router = useRouter();
  const pc = settings.primaryColor;
  const [jobDate, setJobDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [paxCount, setPaxCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDate && !pickupTime && !paxCount) {
      setError('Please update at least one field.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const token = localStorage.getItem('b2c_token') ?? '';
      const body: Record<string, string | number> = {};
      if (jobDate) body.jobDate = jobDate;
      if (pickupTime) body.pickupTime = pickupTime;
      if (paxCount) body.paxCount = parseInt(paxCount, 10);

      const res = await fetch(`${API}/bookings/${bookingRef}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Amendment failed');
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Amendment failed');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${pc}15` }}>
            <CheckCircle2 className="h-7 w-7" style={{ color: pc }} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Amendment Submitted</h2>
          <p className="text-sm text-gray-400 mb-6">Your booking has been updated.</p>
          <button onClick={() => router.push(`/w/account/booking/${bookingRef}`)}
            className="rounded-xl px-6 py-2.5 text-sm font-bold text-white"
            style={{ backgroundColor: pc }}>
            Back to Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-gray-50">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Amend Booking</h1>
            <p className="text-xs text-gray-400 font-mono">{bookingRef}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-sm text-gray-500">Update any of the fields below. Leave blank to keep current values.</p>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Date</Label>
            <Input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)}
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New Pickup Time</Label>
            <Input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Passenger Count</Label>
            <Input type="number" min={1} max={20} placeholder="e.g. 3" value={paxCount}
              onChange={(e) => setPaxCount(e.target.value)}
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties} />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: pc }}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
