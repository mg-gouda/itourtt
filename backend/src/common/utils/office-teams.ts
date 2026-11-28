/**
 * Office teams by role slug (6.9.2). Driver alerts go to the Dispatch team, rep alerts to the
 * Online team; admins see both. A flight delay still goes to every office user who handles jobs.
 */
export const DISPATCH_TEAM_SLUGS = ['dispatch-operator', 'dispatcher', 'dispatch-manager'];
export const ONLINE_TEAM_SLUGS = ['online-operator', 'online-manager'];

export type FieldRole = 'REP' | 'DRIVER';

export function teamSlugsFor(role: FieldRole): string[] {
  return role === 'DRIVER' ? DISPATCH_TEAM_SLUGS : ONLINE_TEAM_SLUGS;
}

/** Prisma user filter: the team for this field role, plus admins. */
export function teamUserFilter(role: FieldRole) {
  return {
    OR: [
      { roleRef: { slug: { in: [...teamSlugsFor(role), 'admin'] } } },
      { role: 'ADMIN' as const },
    ],
  };
}
