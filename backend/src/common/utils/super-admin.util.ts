/**
 * The single super-admin account. Login / session alerts (blocked rep/driver
 * logins) go to this account only — no other admin, role or user receives them.
 */
export const SUPER_ADMIN_EMAIL = 'mggouda@gmail.com';

/** True when the given email belongs to the super-admin account. */
export function isSuperAdminEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}
