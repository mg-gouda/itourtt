'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Phone, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SiteSettings } from '@/lib/site-settings';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/w-api`;

interface LoginClientProps { settings: SiteSettings; }

export function LoginClient({ settings }: LoginClientProps) {
  const router = useRouter();
  const pc = settings.primaryColor;
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Login failed');
      const token = json.data?.token ?? json.token;
      if (!token) throw new Error('No token received');
      localStorage.setItem('b2c_token', token);
      localStorage.setItem('b2c_user', JSON.stringify(json.data?.user ?? json.user));
      router.push('/w/account');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-20 flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {settings.logoUrl && (
            <img src={settings.logoUrl} alt={settings.siteName} className="h-10 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to manage your bookings</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> Email Address
            </Label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Mobile Number (password)
            </Label>
            <Input
              type="tel"
              placeholder="+20 123 456 789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="border-gray-200 bg-gray-50 focus-visible:ring-1"
              style={{ '--tw-ring-color': pc } as React.CSSProperties}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !phone}
            className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-md transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: pc }}
          >
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</> : 'Sign In'}
          </button>

          <p className="text-center text-xs text-gray-400">
            Your password is your mobile number as entered at booking.
          </p>
        </form>

        <div className="mt-4 text-center">
          <a href="/w" className="text-xs text-gray-400 hover:text-gray-700 transition">← Back to Home</a>
        </div>
      </div>
    </div>
  );
}
