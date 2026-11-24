import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived signed download links (6.2.1) — for files an app opens in the phone's browser, where
 * the login token can't go along. token = base64url(JSON payload with exp) + '.' + HMAC-SHA256.
 */
const secret = () => process.env.JWT_SECRET || 'itour-signed-link';

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sig = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

export function signLink(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${sig(body)}`;
}

/** The payload, or null when the token is malformed, tampered with or expired. */
export function verifyLink<T extends Record<string, unknown>>(token: string): T | null {
  const [body, mac] = (token || '').split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sig(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp: number };
    return p.exp >= Math.floor(Date.now() / 1000) ? p : null;
  } catch {
    return null;
  }
}
