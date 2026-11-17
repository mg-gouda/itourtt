/**
 * The iTour API wraps every body as `{ success, data }`, and the portal list
 * endpoints put the rows one level deeper (`{ jobs: [...] }`,
 * `{ notifications: [...], unreadCount }`). Reading `data.data` as an array
 * is what crashed the History and Notifications tabs — always unwrap here.
 */
export function unwrapData<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** The row array from a portal list response, whatever the envelope. */
export function unwrapList<T>(body: unknown, key?: string): T[] {
  const inner = unwrapData<unknown>(body);
  if (Array.isArray(inner)) return inner as T[];
  if (inner && typeof inner === 'object') {
    const obj = inner as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    for (const k of ['jobs', 'notifications', 'items', 'rows', 'data']) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
  }
  return [];
}

/** The server's message from an axios error, else the fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join('\n');
  if (typeof m === 'string' && m) return m;
  return e?.message || fallback;
}
