// Where each role lives in the app. Only staff roles may enter /dashboard;
// portal roles (REP/DRIVER/SUPPLIER) are confined to their own portal, and
// any other role (e.g. B2C_CLIENT) has no home here at all.

export const STAFF_ROLES = ["ADMIN", "DISPATCHER", "ACCOUNTANT", "AGENT_MANAGER", "VIEWER"] as const;

export function isStaffRole(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Home route for a role, or null when the role may not use this app. */
export function homeForRole(role?: string | null): string | null {
  if (role === "REP") return "/rep";
  if (role === "DRIVER") return "/driver";
  if (role === "SUPPLIER") return "/supplier";
  if (isStaffRole(role)) return "/dashboard";
  return null;
}
