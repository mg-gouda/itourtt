import * as crypto from 'crypto';

const LICENSE_SECRET = 'iTourTT_LK_9f3a7c2e1b8d4056_MG2026';

interface LicensePayload {
  iss: string;
  sub: string;
  iat: string; // YYYY-MM-DD
  exp: string; // YYYY-MM-DD
}

export interface LicenseStatus {
  valid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  message: string;
}

export function validateLicenseKey(key: string | null | undefined): LicenseStatus {
  if (!key || !key.trim()) {
    return { valid: false, expiresAt: null, daysRemaining: null, message: 'No license key configured' };
  }

  const parts = key.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, expiresAt: null, daysRemaining: null, message: 'Invalid license key format' };
  }

  const [payloadB64, signatureB64] = parts;

  // Verify signature
  const expectedSig = crypto.createHmac('sha256', LICENSE_SECRET).update(payloadB64).digest('base64url');
  if (expectedSig !== signatureB64) {
    return { valid: false, expiresAt: null, daysRemaining: null, message: 'Invalid license key' };
  }

  // Decode payload
  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return { valid: false, expiresAt: null, daysRemaining: null, message: 'Corrupted license key' };
  }

  if (payload.iss !== 'iTourTT' || payload.sub !== 'license') {
    return { valid: false, expiresAt: null, daysRemaining: null, message: 'Invalid license key' };
  }

  // Check expiry
  const now = new Date();
  const expDate = new Date(payload.exp + 'T23:59:59Z');
  const startDate = new Date(payload.iat + 'T00:00:00Z');

  if (now < startDate) {
    return { valid: false, expiresAt: payload.exp, daysRemaining: null, message: 'License not yet active' };
  }

  if (now > expDate) {
    return { valid: false, expiresAt: payload.exp, daysRemaining: 0, message: 'License has expired' };
  }

  const daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return { valid: true, expiresAt: payload.exp, daysRemaining, message: 'License active' };
}
