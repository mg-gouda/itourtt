import { AppState, Platform } from 'react-native';
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidNotificationSetting,
  AndroidVisibility,
  EventType,
  TriggerType,
  type Notification,
} from '@notifee/react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import { NativeModules } from 'react-native';
import api from '../api/client';
import { secureStorage } from '../auth/secure-storage';
import { unwrapData } from '../utils/response';
import { t } from '../i18n';
import { formatTimeCairo } from '../utils/date';

/**
 * Job alarms for the rep / driver apps — same rules as the web portals
 * (frontend/src/components/job-alarms.tsx); the server decides which jobs
 * qualify (GET /{portal}-portal/alerts):
 *
 * - START_60 / START_30 — 1 hour and 30 minutes before each job not started
 *   yet. Scheduled as exact-while-idle local notifications, so they ring even
 *   with the app closed, and shown as a modal that must be acknowledged; the
 *   acknowledgement is saved and lands in the Activity Log against the job.
 * - DROPOFF_ARRIVED / DROPOFF_LEFT — a driver on a started trip, or a rep who
 *   escorts the transfer: GPS inside the drop-off geofence asks them to
 *   complete before leaving; leaving it without completing raises an alarm.
 *
 * The background sync service calls `refreshJobAlerts` and
 * `checkDropoffs` on its poll; the app's JobAlarmHost shows the modal queue.
 *
 * Alarm-clock behaviour (owner, 2026-11-20 — must ring with the screen off, in standby and after
 * sign-out): start reminders are EXACT alarms (USE_EXACT_ALARM), shown full-screen over the lock
 * screen, ringing in a loop (up to 15 min) until "I've seen it". At sign-in the phone gets an alarm
 * key (POST /{portal}-portal/alarm-device); after sign-out the alarms stay scheduled and keep
 * syncing with that key (GET /public/alarms) until "Turn off alarms on this phone".
 */

export type AlarmPortal = 'rep' | 'driver';
export type AlarmKind = 'START_60' | 'START_30' | 'DROPOFF_ARRIVED' | 'DROPOFF_LEFT';

export interface AlarmJob {
  jobId: string;
  internalRef: string;
  serviceType: string;
  startsAt: string | null;
  flightNo: string | null;
  paxCount: number;
  clientName: string | null;
  from: string | null;
  to: string | null;
  acked: string[];
  target?: { lat: number; lng: number; label: string; precise: boolean; radiusMeters: number };
}

export interface PendingAlarm {
  kind: AlarmKind;
  job: AlarmJob;
  shownAt: string;
}

// v2: alarm-clock channel (bypasses Do Not Disturb). Android freezes a channel's sound / importance,
// so the change needs a new id; the old channel is deleted.
export const CHANNEL_ALARMS = 'itour_job_alarms_v2';
const OLD_CHANNEL_ALARMS = 'itour_job_alarms';
const ALARM_KEY_STORE = 'jobAlarmKey';
const ACK_ACTION = 'alarm-ack';

/** This phone's alarm key (issued at sign-in; survives sign-out). */
export interface AlarmKeyInfo {
  key: string;
  portal: AlarmPortal;
  userId: string;
  name: string;
}
let keyInfo: AlarmKeyInfo | null | undefined; // undefined = not read yet
let keyMode = false; // last refresh used the alarm key (signed out)

let portal: AlarmPortal | null = null;
let reminders: AlarmJob[] = [];
let dropoffs: AlarmJob[] = [];
let pending: PendingAlarm[] = [];
const raised = new Set<string>();
const inside: Record<string, boolean> = {};
const scheduled = new Map<string, number>(); // notification id → timestamp
let lastPosition: { lat: number; lng: number } | null = null;
const listeners = new Set<() => void>();

const keyOf = (jobId: string, kind: AlarmKind) => `alarm-${jobId}-${kind}`;
const emit = () => listeners.forEach((l) => l());

/** Subscribe to queue changes (the modal host). Returns an unsubscribe function. */
export function onAlarmsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingAlarms(): PendingAlarm[] {
  return pending;
}

/** Whether any drop-off alarm is armed (the sync service only reads GPS then). */
export function hasActiveDropoffs(): boolean {
  return dropoffs.some((d) => d.target?.precise);
}

export function alarmTitle(kind: AlarmKind): string {
  switch (kind) {
    case 'START_60':
      return t('alarm.startsIn60');
    case 'START_30':
      return t('alarm.startsIn30');
    case 'DROPOFF_ARRIVED':
      return t('alarm.dropoffArrivedTitle');
    default:
      return t('alarm.dropoffLeftTitle');
  }
}

export function alarmBody(kind: AlarmKind, job: AlarmJob): string {
  if (kind === 'START_60' || kind === 'START_30') {
    const route = [job.from, job.to].filter(Boolean).join(' → ');
    const time = job.startsAt ? formatTimeCairo(job.startsAt) : '';
    return [job.flightNo, time, route].filter(Boolean).join(' · ');
  }
  return (kind === 'DROPOFF_ARRIVED' ? t('alarm.dropoffArrivedDesc') : t('alarm.dropoffLeftDesc')).replace(
    '{ref}',
    job.internalRef,
  );
}

async function ensureAlarmChannel() {
  if (Platform.OS !== 'android') return;
  await notifee.createChannel({
    id: CHANNEL_ALARMS,
    name: 'Job alarms',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 400, 300, 400, 300, 400],
    lights: true,
    bypassDnd: true,
  });
  await notifee.deleteChannel(OLD_CHANNEL_ALARMS).catch(() => {});
}

function notificationFor(kind: AlarmKind, job: AlarmJob) {
  return {
    id: keyOf(job.jobId, kind),
    title: `⏰ ${alarmTitle(kind)} · ${job.internalRef}`,
    body: alarmBody(kind, job),
    data: { type: 'ALARM', jobId: job.jobId, kind },
    android: {
      channelId: CHANNEL_ALARMS,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.ALARM,
      sound: 'default',
      smallIcon: 'ic_notification',
      pressAction: { id: 'default' },
      // Alarm clock: wake the screen over the lock screen and keep ringing until acknowledged.
      fullScreenAction: { id: 'default' },
      lightUpScreen: true,
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: 15 * 60_000,
      actions: [{ title: t('alarm.acknowledge'), pressAction: { id: ACK_ACTION } }],
    },
    ios: { sound: 'default' },
  };
}

/** Queue the modal (and ring now if the app is not on screen). */
function raise(kind: AlarmKind, job: AlarmJob) {
  const key = keyOf(job.jobId, kind);
  if (raised.has(key) || job.acked.includes(kind)) return;
  raised.add(key);
  pending = [...pending, { kind, job, shownAt: new Date().toISOString() }];
  emit();
  if (AppState.currentState !== 'active') {
    notifee.displayNotification(notificationFor(kind, job)).catch(() => {});
  }
}

/** The start reminder due now; the 30-minute one supersedes the 1-hour one. */
export function dueStartKind(startsAt: string | null, now = Date.now()): AlarmKind | null {
  if (!startsAt) return null;
  const mins = (new Date(startsAt).getTime() - now) / 60_000;
  if (mins <= 0) return null;
  if (mins <= 30) return 'START_30';
  if (mins <= 60) return 'START_60';
  return null;
}

/** Raise any start reminder that is due now. Cheap — call it on every tick. */
export function evaluateDueAlarms() {
  for (const job of reminders) {
    const kind = dueStartKind(job.startsAt);
    if (kind) raise(kind, job);
  }
}

/** Schedule the 60/30-minute notifications ahead of time so they ring with the app closed. */
let adoptedExisting = false;
async function scheduleReminders() {
  if (Platform.OS !== 'android') return;
  await ensureAlarmChannel().catch(() => {});
  // After an app restart the system still holds earlier triggers: adopt them
  // so stale ones (job moved / reassigned) get cancelled below.
  if (!adoptedExisting) {
    adoptedExisting = true;
    const ids = await notifee.getTriggerNotificationIds().catch(() => [] as string[]);
    ids.filter((id) => id.startsWith('alarm-')).forEach((id) => scheduled.set(id, -1));
  }
  const wanted = new Map<string, { at: number; kind: AlarmKind; job: AlarmJob }>();
  for (const job of reminders) {
    if (!job.startsAt) continue;
    const start = new Date(job.startsAt).getTime();
    for (const [kind, mins] of [
      ['START_60', 60],
      ['START_30', 30],
    ] as const) {
      const at = start - mins * 60_000;
      if (at > Date.now() + 5_000 && !job.acked.includes(kind)) {
        wanted.set(keyOf(job.jobId, kind), { at, kind, job });
      }
    }
  }
  // Drop reminders for jobs that moved, started or were reassigned.
  for (const [id] of scheduled) {
    if (!wanted.has(id)) {
      scheduled.delete(id);
      await notifee.cancelTriggerNotification(id).catch(() => {});
    }
  }
  for (const [id, { at, kind, job }] of wanted) {
    if (scheduled.get(id) === at) continue;
    scheduled.set(id, at);
    await notifee
      .createTriggerNotification(notificationFor(kind, job), {
        type: TriggerType.TIMESTAMP,
        timestamp: at,
        // Exact even in Doze / standby (USE_EXACT_ALARM in the manifest).
        alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
      })
      .catch(() => scheduled.delete(id));
  }
}

/** Fetch the user's alarm jobs, (re)schedule reminders and raise anything due. */
export async function refreshJobAlerts(p: AlarmPortal, background = false): Promise<void> {
  const signedIn = !!(await secureStorage.getAccessToken().catch(() => null));
  try {
    if (signedIn) {
      portal = p;
      keyMode = false;
      const res = await api.get(`/${p}-portal/alerts`, { headers: { 'X-Background-Poll': '1' } });
      const data = unwrapData<{ reminders?: AlarmJob[]; dropoffs?: AlarmJob[] }>(res.data);
      reminders = data?.reminders ?? [];
      dropoffs = data?.dropoffs ?? [];
    } else {
      // Signed out: this phone's alarm key keeps the start reminders in sync.
      const k = await getAlarmKeyInfo();
      if (!k) return;
      const res = await fetch(`${api.defaults.baseURL}/public/alarms`, { headers: { 'X-Alarm-Key': k.key } });
      if (res.status === 403) {
        // Revoked on the server (turned off elsewhere, account deactivated): stop ringing.
        await turnOffAlarmsOnPhone(false);
        return;
      }
      if (!res.ok) return;
      const body = await res.json();
      portal = k.portal;
      keyMode = true;
      reminders = (body?.data?.reminders ?? []) as AlarmJob[];
      dropoffs = []; // drop-off alarms need GPS + a session
    }
  } catch {
    return; // keep the last known lists
  }
  // Jobs that finished or were reassigned drop out of the drop-off watch.
  const live = new Set(dropoffs.map((d) => d.jobId));
  Object.keys(inside).forEach((id) => !live.has(id) && delete inside[id]);
  await scheduleReminders().catch(() => {});
  evaluateDueAlarms();
  if (!background && lastPosition) checkDropoffs(lastPosition);
}

const toRad = (d: number) => (d * Math.PI) / 180;
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Compare a GPS fix with every armed drop-off geofence. */
export function checkDropoffs(pos: { lat: number; lng: number }) {
  lastPosition = pos;
  for (const job of dropoffs) {
    const target = job.target;
    if (!target?.precise) continue; // a zone centroid is too coarse to alarm on
    const isInside = distanceMeters(pos, target) <= target.radiusMeters;
    if (isInside) {
      inside[job.jobId] = true;
      raise('DROPOFF_ARRIVED', job);
    } else if (inside[job.jobId]) {
      raise('DROPOFF_LEFT', job);
    }
  }
}

/** Save the acknowledgement (activity-logged server-side) and close the modal. */
export async function acknowledgeAlarm(alarm: PendingAlarm): Promise<void> {
  pending = pending.filter((a) => a !== alarm);
  emit();
  const id = keyOf(alarm.job.jobId, alarm.kind);
  notifee.cancelNotification(id).catch(() => {});
  // A 30-minute ack settles a 1-hour reminder that never rang.
  if (alarm.kind === 'START_30') {
    notifee.cancelNotification(keyOf(alarm.job.jobId, 'START_60')).catch(() => {});
  }
  alarm.job.acked = [...alarm.job.acked, alarm.kind];
  await sendAck(alarm.job.jobId, alarm.kind, alarm.shownAt);
}

/** POST the acknowledgement — with the session when signed in, else with the alarm key. */
async function sendAck(jobId: string, kind: AlarmKind, shownAt?: string) {
  const signedIn = !!(await secureStorage.getAccessToken().catch(() => null));
  const k = await getAlarmKeyInfo();
  const p = portal ?? k?.portal ?? null;
  try {
    if (signedIn && p && !keyMode) {
      await api.post(`/${p}-portal/jobs/${jobId}/alerts/ack`, {
        kind,
        shownAt,
        ...(lastPosition ? { latitude: lastPosition.lat, longitude: lastPosition.lng } : {}),
      });
    } else if (k) {
      await fetch(`${api.defaults.baseURL}/public/alarms/jobs/${jobId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Alarm-Key': k.key },
        body: JSON.stringify({ kind, shownAt }),
      });
    }
  } catch {
    /* acknowledged on screen; the server keeps offering it until the next ack */
  }
}

/** "I've seen it" pressed on the notification itself (app closed, locked, or open). */
export async function handleAlarmNotificationAction(type: EventType, notification?: Notification, actionId?: string) {
  if (type !== EventType.ACTION_PRESS || actionId !== ACK_ACTION) return;
  const jobId = notification?.data?.jobId as string | undefined;
  const kind = notification?.data?.kind as AlarmKind | undefined;
  if (!jobId || !kind) return;
  await notifee.cancelNotification(keyOf(jobId, kind)).catch(() => {});
  if (kind === 'START_30') await notifee.cancelNotification(keyOf(jobId, 'START_60')).catch(() => {});
  const queued = pending.find((a) => a.job.jobId === jobId && a.kind === kind);
  if (queued) {
    await acknowledgeAlarm(queued);
    return;
  }
  const job = reminders.find((r) => r.jobId === jobId);
  if (job) job.acked = [...job.acked, kind];
  raised.add(keyOf(jobId, kind));
  await sendAck(jobId, kind, new Date().toISOString());
}

/** In-app listener for the notification's "I've seen it" button. Returns an unsubscribe function. */
export function watchAlarmActions(): () => void {
  if (Platform.OS !== 'android') return () => {};
  return notifee.onForegroundEvent(({ type, detail }) => {
    handleAlarmNotificationAction(type, detail.notification, detail.pressAction?.id).catch(() => {});
  });
}

// ── This phone's alarm key ──────────────────────────────────────────────────

export async function getAlarmKeyInfo(): Promise<AlarmKeyInfo | null> {
  if (keyInfo === undefined) {
    try {
      const raw = await EncryptedStorage.getItem(ALARM_KEY_STORE);
      keyInfo = raw ? (JSON.parse(raw) as AlarmKeyInfo) : null;
    } catch {
      keyInfo = null;
    }
  }
  return keyInfo;
}

/** After sign-in: make sure this phone holds an alarm key for the signed-in person. */
export async function ensureAlarmKey(p: AlarmPortal): Promise<void> {
  try {
    const raw = await secureStorage.getUser();
    const user = raw ? (JSON.parse(raw) as { id?: string; name?: string }) : null;
    if (!user?.id) return;
    const cur = await getAlarmKeyInfo();
    if (cur && cur.userId === user.id && cur.portal === p) return;
    if (cur) await revokeRemote(cur.key); // the phone changed hands
    const res = await api.post(`/${p}-portal/alarm-device`);
    const key = unwrapData<{ key?: string }>(res.data)?.key;
    if (!key) return;
    keyInfo = { key, portal: p, userId: user.id, name: user.name ?? '' };
    await EncryptedStorage.setItem(ALARM_KEY_STORE, JSON.stringify(keyInfo));
    emit();
  } catch {
    /* try again at the next sign-in / app start */
  }
}

async function revokeRemote(key: string) {
  await fetch(`${api.defaults.baseURL}/public/alarms/off`, { method: 'POST', headers: { 'X-Alarm-Key': key } }).catch(() => {});
}

/** "Turn off alarms on this phone" (login screen) — or the server revoked the key. */
export async function turnOffAlarmsOnPhone(tellServer = true): Promise<void> {
  const cur = await getAlarmKeyInfo();
  if (cur && tellServer) await revokeRemote(cur.key);
  keyInfo = null;
  await EncryptedStorage.removeItem(ALARM_KEY_STORE).catch(() => {});
  await resetJobAlerts();
}

/**
 * Can this phone ring on time with the screen off? Android 12+ "Alarms & reminders" (exact alarms)
 * and Android 14+ full-screen notifications. Returns the first missing one, or null.
 */
export async function missingAlarmPermission(): Promise<'exact' | 'fullScreen' | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.android?.alarm === AndroidNotificationSetting.DISABLED) return 'exact';
  } catch {
    /* older notifee / phone */
  }
  try {
    const native = NativeModules.AppUpdate;
    if (native?.canUseFullScreenIntent && !(await native.canUseFullScreenIntent())) return 'fullScreen';
  } catch {
    /* module missing */
  }
  return null;
}

export function openAlarmPermissionSettings(which: 'exact' | 'fullScreen') {
  if (which === 'exact') notifee.openAlarmPermissionSettings().catch(() => {});
  else NativeModules.AppUpdate?.openFullScreenIntentSettings?.();
}

/**
 * Sign-out with an alarm key: drop the session-only parts (drop-off watch) but keep the scheduled
 * start reminders — they keep ringing and syncing with the key.
 */
export function releaseSessionAlarms() {
  dropoffs = [];
  Object.keys(inside).forEach((k) => delete inside[k]);
  emit();
}

/** Alarms off on this phone: forget everything and cancel scheduled alarms. */
export async function resetJobAlerts() {
  portal = null;
  reminders = [];
  dropoffs = [];
  pending = [];
  raised.clear();
  Object.keys(inside).forEach((k) => delete inside[k]);
  for (const [id] of scheduled) await notifee.cancelTriggerNotification(id).catch(() => {});
  scheduled.clear();
  emit();
}
