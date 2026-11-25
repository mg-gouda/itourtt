import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Offline actions (6.9.0): a rep / driver action done without signal carries the time it was
 * really done (`occurredAt`). The job services read "now" from here, so time windows, status
 * logs and evidence rows use that original time; a normal request just gets the real clock.
 */
interface ClockCtx {
  at: Date;
  /** The action was queued on the phone while offline. */
  offline: boolean;
}

const store = new AsyncLocalStorage<ClockCtx>();

/** The action's time: the original offline time inside runAt(), else the real clock. */
export function clockNow(): Date {
  const c = store.getStore();
  return c ? new Date(c.at.getTime()) : new Date();
}

export function clockIsOffline(): boolean {
  return store.getStore()?.offline === true;
}

export function runAt<T>(at: Date, offline: boolean, fn: () => Promise<T>): Promise<T> {
  return store.run({ at, offline }, fn);
}

/** Offline actions older than this are not applied by themselves — the office approves them. */
export const OFFLINE_AUTO_ACCEPT_MS = 2 * 60 * 60 * 1000;

/**
 * Read `occurredAt` from a request: null = a normal live action. Future times (clock drift)
 * are clamped to now; anything older than 2 h is reported as `late`.
 */
export function parseOccurredAt(raw: unknown): { at: Date; late: boolean } | null {
  if (raw == null || raw === '') return null;
  const t = new Date(String(raw));
  if (Number.isNaN(t.getTime())) return null;
  const now = Date.now();
  const at = t.getTime() > now ? new Date(now) : t;
  return { at, late: now - at.getTime() > OFFLINE_AUTO_ACCEPT_MS };
}
