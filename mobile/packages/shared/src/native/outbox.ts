import NetInfo from '@react-native-community/netinfo';
import EncryptedStorage from 'react-native-encrypted-storage';
import type { AxiosResponse } from 'axios';
import api from '../api/client';
import { t } from '../i18n';
import { appAlert } from '../utils/dialog';

/**
 * Offline jobs (apps 1.9.0, owner 2026-11-25).
 *
 * 1. Saved jobs — every job list / job detail the app loads is kept on the phone; with no signal
 *    the app shows the saved copy (with the time it was saved) so times, notes, hotel, flight and
 *    phone numbers are still there.
 * 2. Outbox — an action (In Place, Start trip, Complete, No show, cash collected, a status) that
 *    cannot reach the server is saved on the phone with the time it was really done and the GPS
 *    and photos taken then. The job moves to its next step on the phone at once, marked "waiting to
 *    send". When the signal returns everything is sent in order: the status first (small), then
 *    the photos (POST …/evidence-photos), so a weak signal still gets the status through.
 *    The server applies actions up to 2 h late at their original time; older ones wait for
 *    the office to approve. The office is told in chat either way.
 * 3. A job the office changed meanwhile (cancelled, reassigned, …) refuses the action: the phone
 *    says so, and the item is kept in "Not sent" with the server's reason.
 */

type Portal = 'rep' | 'driver';
type Part = [string, string | { uri: string; name?: string; type?: string }];

export interface OutboxItem {
  id: string;
  portal: Portal;
  jobId: string;
  /** IN_PLACE | IN_PROGRESS | COMPLETED | NO_SHOW | STATUS | COLLECTED | ODOMETER */
  kind: string;
  method: 'post' | 'patch';
  path: string;
  /** Multipart form parts (photos as file URIs) or a JSON body. */
  parts?: Part[];
  json?: Record<string, unknown>;
  occurredAt: string;
  /** The status the job shows on the phone until this is sent. */
  optimistic?: string;
  /** Only the photos are left to send (the status already went). */
  photosOnly?: boolean;
  attempts: number;
  /** Refused by the server — shown in "Not sent" with this reason. */
  failed?: string;
}

const OUTBOX_KEY = 'jobOutbox';
const CACHE_PREFIX = 'jobCache:';
const listeners = new Set<() => void>();
let items: OutboxItem[] | null = null;
let flushing = false;

const emit = () => listeners.forEach((l) => l());

export function onOutboxChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

async function load(): Promise<OutboxItem[]> {
  if (items) return items;
  try {
    const raw = await EncryptedStorage.getItem(OUTBOX_KEY);
    items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    items = [];
  }
  return items;
}

async function save(next: OutboxItem[]) {
  items = next;
  emit();
  await EncryptedStorage.setItem(OUTBOX_KEY, JSON.stringify(next)).catch(() => {});
}

export function outboxItems(): OutboxItem[] {
  return items ?? [];
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  return load();
}

/** Send a refused item again (the office may have fixed the job meanwhile). */
export async function retryOutboxItem(id: string) {
  await save((await load()).map((i) => (i.id === id ? { ...i, failed: undefined, attempts: 0 } : i)));
  await flushOutbox();
}

/** Drop a refused item after the person has read why. */
export async function dismissOutboxItem(id: string) {
  await save((await load()).filter((i) => i.id !== id));
}

// ── Saved jobs ────────────────────────────────────────────────────────────

export async function cacheSet(key: string, data: unknown) {
  try {
    await EncryptedStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full — the live copy still works */
  }
}

export async function cacheGet<T>(key: string): Promise<{ at: number; data: T } | null> {
  try {
    const raw = await EncryptedStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { at: number; data: T }) : null;
  } catch {
    return null;
  }
}

/** True when the request never got an answer (no signal, data used up, timeout). */
export function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; code?: string; message?: string };
  if (e?.response) return false;
  return true; // axios network error / timeout / aborted
}

async function online(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    return s.isConnected !== false && s.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/** A response shaped like the server's, for a request served from the phone. */
function fakeResponse<T>(data: T, extra: Record<string, unknown> = {}): AxiosResponse {
  return { data: { success: true, data, ...extra }, status: 200, statusText: 'OK', headers: {}, config: {} as never } as AxiosResponse;
}

/** Saved-jobs read: live when possible, the saved copy when not (`fromCache`, `savedAt`). */
export async function cachedGet(key: string, fetcher: () => Promise<AxiosResponse>, overlay?: (data: unknown) => unknown): Promise<AxiosResponse> {
  try {
    const res = await fetcher();
    const body = res.data as { data?: unknown };
    await cacheSet(key, body?.data ?? body);
    if (overlay) (res.data as { data?: unknown }).data = overlay(body?.data ?? body);
    return res;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const c = await cacheGet<unknown>(key);
    if (!c) throw err;
    return fakeResponse(overlay ? overlay(c.data) : c.data, { fromCache: true, savedAt: c.at });
  }
}

export function isQueued(res: unknown): boolean {
  return !!(res as { data?: { queued?: boolean } })?.data?.queued;
}

function formParts(form: FormData): Part[] {
  const parts = (form as unknown as { _parts?: Part[]; getParts?: () => { fieldName: string; string?: string; uri?: string; name?: string; type?: string }[] });
  if (Array.isArray(parts._parts)) return parts._parts.map(([k, v]) => [k, v] as Part);
  return (parts.getParts?.() ?? []).map((p) => [p.fieldName, p.uri ? { uri: p.uri, name: p.name, type: p.type } : String(p.string ?? '')] as Part);
}

function buildForm(parts: Part[]): FormData {
  const f = new FormData();
  for (const [k, v] of parts) f.append(k, v as unknown as Blob);
  return f;
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Send an action now; if the network fails (or there is none), keep it in the outbox and answer
 * like the server would, with `queued: true`. Server refusals (4xx) are thrown as usual.
 */
export async function sendOrQueue(
  base: Omit<OutboxItem, 'id' | 'attempts' | 'occurredAt'>,
  live: () => Promise<AxiosResponse>,
): Promise<AxiosResponse> {
  if (await online()) {
    try {
      return await live();
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const item: OutboxItem = { ...base, id: newId(), attempts: 0, occurredAt: new Date().toISOString() };
  await save([...(await load()), item]);
  appAlert(t('offline.savedTitle'), t('offline.savedBody'), undefined, { tone: 'warning', icon: 'cloud-offline' });
  return fakeResponse({ queued: true, id: item.id }, { queued: true });
}

/** Multipart actions keep their form (photos are file URIs on the phone). */
export function queueForm(portal: Portal, jobId: string, kind: string, path: string, form: FormData, optimistic?: string, timeout = 120000) {
  const parts = formParts(form);
  return sendOrQueue({ portal, jobId, kind, method: 'post', path, parts, optimistic }, () =>
    api.post(path, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout }),
  );
}

export function queueJson(portal: Portal, jobId: string, kind: string, method: 'post' | 'patch', path: string, json: Record<string, unknown>, optimistic?: string) {
  return sendOrQueue({ portal, jobId, kind, method, path, json, optimistic }, () => api.request({ method, url: path, data: json }));
}

/** Jobs in a list show the status their queued action gives them, flagged `pendingSync`. */
export function overlayJobs<T extends { id: string }>(statusField: 'repStatus' | 'driverStatus') {
  return (data: unknown) => {
    const d = data as { jobs?: T[] } | T[];
    const list = (Array.isArray(d) ? d : d?.jobs) as (T & Record<string, unknown>)[] | undefined;
    if (!list) return data;
    const pending = outboxItems().filter((i) => !i.failed);
    for (const j of list) {
      const mine = pending.filter((i) => i.jobId === j.id);
      if (!mine.length) continue;
      (j as Record<string, unknown>).pendingSync = true;
      const last = [...mine].reverse().find((i) => i.optimistic);
      if (last?.optimistic) (j as Record<string, unknown>)[statusField] = last.optimistic;
    }
    return data;
  };
}

// ── Sending what waited ──────────────────────────────────────────────────

const EVIDENCE_KINDS = new Set(['IN_PLACE', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']);

async function deliver(i: OutboxItem): Promise<OutboxItem | null> {
  const prefix = `/${i.portal}-portal/jobs/${i.jobId}`;
  if (i.parts) {
    const photos = i.parts.filter(([k, v]) => k === 'images' && typeof v !== 'string');
    const fields = i.parts.filter(([k]) => k !== 'images');
    const gps = Object.fromEntries(fields.filter(([k]) => k === 'latitude' || k === 'longitude')) as Record<string, string>;
    if (!i.photosOnly) {
      // Status first: small, gets through on a weak signal. Photos follow below.
      const evidence = EVIDENCE_KINDS.has(i.kind) && photos.length > 0;
      const first: Part[] = [...fields, ['occurredAt', i.occurredAt]];
      if (evidence) first.push(['photosLater', String(photos.length)]);
      else first.push(...photos);
      await api.post(i.path, buildForm(first), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000 });
      if (!evidence) return null;
      return { ...i, photosOnly: true, attempts: 0 }; // photos still to go
    }
    const form = buildForm([['kind', i.kind], ...(gps.latitude ? [['latitude', gps.latitude] as Part] : []), ...(gps.longitude ? [['longitude', gps.longitude] as Part] : []), ...photos]);
    await api.post(`${prefix}/evidence-photos`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180000 });
    return null;
  }
  await api.request({ method: i.method, url: i.path, data: { ...(i.json ?? {}), occurredAt: i.occurredAt }, timeout: 30000 });
  return null;
}

/**
 * Send everything that waited, oldest first. A network failure stops the run (order matters);
 * a refusal marks that item "Not sent" and tells the person once.
 */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let list = await load();
    if (!list.some((i) => !i.failed) || !(await online())) return;
    const refused: string[] = [];
    for (const item of [...list]) {
      if (item.failed) continue;
      try {
        let next: OutboxItem | null = item;
        // Status then photos, in the same run when the signal holds.
        while (next) {
          const after: OutboxItem | null = await deliver(next);
          list = list.map((x) => (x.id === item.id ? (after ?? x) : x)).filter((x) => x.id !== item.id || after);
          await save(list);
          next = after;
        }
      } catch (err) {
        if (isNetworkError(err)) {
          list = list.map((x) => (x.id === item.id ? { ...x, attempts: x.attempts + 1 } : x));
          await save(list);
          break; // keep the order; try again later
        }
        const e = err as { response?: { status?: number; data?: { message?: unknown } }; config?: { url?: string } };
        // Signed out (or the sign-in could not be renewed): keep everything, try after sign-in.
        // Servers before 6.9.1 answered a revoked sign-in with 403 (FT-5537 / FT-5541, 2026-11-27).
        if (e.response?.status === 401 || e.config?.url?.includes('/auth/refresh')) break;
        const m = e.response?.data?.message;
        const reason = Array.isArray(m) ? m.join(' ') : typeof m === 'string' ? m : t('offline.refused');
        list = list.map((x) => (x.id === item.id ? { ...x, failed: reason } : x));
        await save(list);
        refused.push(reason);
      }
    }
    if (refused.length) {
      appAlert(t('offline.changedTitle'), `${t('offline.changedBody')}\n\n${refused.join('\n')}`, undefined, { tone: 'danger', icon: 'alert-circle' });
    }
  } finally {
    flushing = false;
  }
}

let started = false;
/** Start sending the outbox when the signal returns, and every 30 s while anything waits. */
export function startOutbox() {
  if (started) return;
  started = true;
  void load().then(() => flushOutbox());
  NetInfo.addEventListener((s) => {
    if (s.isConnected) void flushOutbox();
  });
  setInterval(() => {
    if ((items ?? []).some((i) => !i.failed)) void flushOutbox();
  }, 30_000);
}
