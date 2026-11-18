import { AppState, Platform } from 'react-native';
import notifee, {
  AlarmType,
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  TriggerType,
} from '@notifee/react-native';
import api from '../api/client';
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

export const CHANNEL_ALARMS = 'itour_job_alarms';

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
  });
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
      autoCancel: false,
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
        alarmManager: { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE },
      })
      .catch(() => scheduled.delete(id));
  }
}

/** Fetch the user's alarm jobs, (re)schedule reminders and raise anything due. */
export async function refreshJobAlerts(p: AlarmPortal, background = false): Promise<void> {
  portal = p;
  try {
    const res = await api.get(`/${p}-portal/alerts`, { headers: { 'X-Background-Poll': '1' } });
    const data = unwrapData<{ reminders?: AlarmJob[]; dropoffs?: AlarmJob[] }>(res.data);
    reminders = data?.reminders ?? [];
    dropoffs = data?.dropoffs ?? [];
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
  if (!portal) return;
  await api
    .post(`/${portal}-portal/jobs/${alarm.job.jobId}/alerts/ack`, {
      kind: alarm.kind,
      shownAt: alarm.shownAt,
      ...(lastPosition ? { latitude: lastPosition.lat, longitude: lastPosition.lng } : {}),
    })
    .catch(() => {
      /* acknowledged on screen; the server keeps offering it until the next ack */
    });
}

/** Sign-out: forget everything and cancel scheduled alarms. */
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
