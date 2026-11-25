import { Platform } from 'react-native';
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
import { getCurrentPosition } from './location';

/**
 * Job alarms for the rep / driver apps — same rules as the web portals
 * (frontend/src/components/job-alarms.tsx); the server decides which jobs
 * qualify (GET /{portal}-portal/alerts):
 *
 * - START_<minutes> — the start alarms set in Company › Alerts (built-in 90 / 60 / 30 min before
 *   each job not started yet), sent with GET /alerts (apps 1.7.0). The earlier ones are answered
 *   "Seen", the last one "On the way" (UI review 2a). Scheduled as exact-while-idle local notifications, so they
 *   ring even with the app closed, and answered with "On the way" (in the app or on the
 *   notification, which opens the app). The answer sends the phone's location; the office
 *   gets an alert with it, and is alerted when an alarm goes unanswered.
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
export type AlarmKind = string; // START_<minutes> | DROPOFF_ARRIVED | DROPOFF_LEFT
export const isStartAlarm = (k: AlarmKind) => /^START_\d+$/.test(k);
const isStart = isStartAlarm;

export interface StartAlarm {
  kind: string;
  minutes: number;
  /** This alarm's own sound in Company › Alerts (apps 1.8.0), or null = built-in. */
  soundUrl?: string | null;
  /** The alarm nearest the job: answered "On the way"; the earlier ones "Seen". */
  last: boolean;
}
const DEFAULT_ALARMS: StartAlarm[] = [
  { kind: 'START_90', minutes: 90, last: false },
  { kind: 'START_60', minutes: 60, last: false },
  { kind: 'START_30', minutes: 30, last: true },
];
let alarms: StartAlarm[] = DEFAULT_ALARMS;

/** True when this start alarm is answered "Seen" (not the last one). */
export function isSeenAlarm(kind: AlarmKind): boolean {
  const a = alarms.find((x) => x.kind === kind);
  return !!a && !a.last;
}

function minutesText(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return t('alarm.min').replace('{n}', String(r));
  if (!r) return t('alarm.hours').replace('{n}', String(h));
  return t('alarm.hoursMin').replace('{h}', String(h)).replace('{m}', String(r));
}

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

// v3 (apps 1.6.0): the owner's alarm sound "two-tone" (res/raw/job_alarm.wav), alarm-clock channel
// (bypasses Do Not Disturb). Android freezes a channel's sound / importance, so each change needs a new
// id; the older channels are deleted.
export const CHANNEL_ALARMS = 'itour_job_alarms_v3';
const OLD_CHANNEL_ALARMS = ['itour_job_alarms', 'itour_job_alarms_v2'];
/** res/raw/job_alarm.wav in both apps — same sound as the web (frontend/public/sounds/job-alarm.wav). */
export const ALARM_SOUND = 'job_alarm';
const ALARM_KEY_STORE = 'jobAlarmKey';

/** Every alarm channel in use (the built-in one + one per uploaded alarm sound). */
export function alarmChannelIds(): string[] {
  return [CHANNEL_ALARMS, ...new Set(Object.values(soundMap))];
}

// ── Alarm sounds from Company › Alerts (apps 1.8.0) ─────────────────────────
// Each uploaded sound is downloaded once into the app's files and played by its own alarm channel
// (native AlarmSounds module). A sound changed while the app runs shows "Reload app"; the download
// happens on the next start, in the background.
const SOUND_STORE = 'jobAlarmSounds';
const CUSTOM_PREFIX = 'itour_alarm_s_';
let soundMap: Record<string, string> = {}; // alarm kind → channel id
let soundVersion: string | null = null;
let soundsLoaded = false;
let firstRefresh = true;
let soundUpdatePending = false;
let syncingSounds = false;

async function loadSoundState() {
  if (soundsLoaded) return;
  soundsLoaded = true;
  try {
    const raw = await EncryptedStorage.getItem(SOUND_STORE);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') {
      soundMap = v.map ?? {};
      soundVersion = v.version ?? null;
    }
  } catch {
    /* start with built-in */
  }
}

/** A sound changed on the server since this app started — offer "Reload app". */
export function soundUpdateAvailable(): boolean {
  return soundUpdatePending;
}

/** Restart the app; the new sounds download in the background as it starts. */
export function reloadForNewSounds() {
  NativeModules.AppRestart?.restart?.();
}

async function applySounds(version: string, list: StartAlarm[]) {
  const native = NativeModules.AlarmSounds;
  if (Platform.OS !== 'android' || !native || syncingSounds) return;
  syncingSounds = true;
  try {
    const token = await secureStorage.getAccessToken().catch(() => null);
    const origin = String(api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');
    const next: Record<string, string> = {};
    const files: string[] = [];
    let failed = false;
    for (const a of list) {
      if (!a.soundUrl) continue;
      const fileName = a.soundUrl.split('/').pop()!.replace(/[^A-Za-z0-9._-]/g, '_');
      const channelId = CUSTOM_PREFIX + fileName.replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
      try {
        await native.download(a.soundUrl.startsWith('http') ? a.soundUrl : origin + a.soundUrl, token, fileName);
        await native.ensureChannel(channelId, `Job alarm (${a.minutes} min)`, fileName);
        next[a.kind] = channelId;
        files.push(fileName);
      } catch {
        failed = true; // this alarm keeps the built-in sound; retried at the next start
      }
    }
    await native.cleanup(CUSTOM_PREFIX, Object.values(next), files).catch(() => {});
    soundMap = next;
    soundVersion = failed ? null : version;
    soundUpdatePending = false;
    await EncryptedStorage.setItem(SOUND_STORE, JSON.stringify({ version: soundVersion, map: soundMap })).catch(() => {});
    // Re-create the scheduled alarms on their new channels.
    for (const [id] of scheduled) await notifee.cancelTriggerNotification(id).catch(() => {});
    scheduled.clear();
    await scheduleReminders().catch(() => {});
    emit();
  } finally {
    syncingSounds = false;
  }
}

/** Called after each alarm refresh with the server's sounds. */
async function syncSounds(version: string | undefined) {
  if (!version) return;
  await loadSoundState();
  const launch = firstRefresh;
  firstRefresh = false;
  if (version === soundVersion) return;
  if (launch) {
    void applySounds(version, alarms); // app just started: fetch quietly
  } else if (!soundUpdatePending) {
    soundUpdatePending = true; // changed while running: offer "Reload app"
    emit();
  }
}
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
  if (isStart(kind)) return t('alarm.startsInX').replace('{time}', minutesText(Number(kind.slice(6))));
  return kind === 'DROPOFF_ARRIVED' ? t('alarm.dropoffArrivedTitle') : t('alarm.dropoffLeftTitle');
}

/** Minutes left until the job (for the big countdown), or null. */
export function minutesLeftText(startsAt: string | null): string | null {
  if (!startsAt) return null;
  return minutesText(Math.max(0, Math.round((new Date(startsAt).getTime() - Date.now()) / 60_000)));
}

export function alarmBody(kind: AlarmKind, job: AlarmJob): string {
  if (isStart(kind)) {
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
    sound: ALARM_SOUND,
    vibration: true,
    vibrationPattern: [300, 400, 300, 400, 300, 400],
    lights: true,
    bypassDnd: true,
  });
  for (const old of OLD_CHANNEL_ALARMS) await notifee.deleteChannel(old).catch(() => {});
}

function notificationFor(kind: AlarmKind, job: AlarmJob) {
  const custom = soundMap[kind];
  return {
    id: keyOf(job.jobId, kind),
    title: `⏰ ${alarmTitle(kind)} · ${job.internalRef}`,
    body: alarmBody(kind, job),
    data: { type: 'ALARM', jobId: job.jobId, kind },
    android: {
      // This alarm's own sound (Company › Alerts) plays through its channel; else the built-in one.
      channelId: custom ?? CHANNEL_ALARMS,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.ALARM,
      ...(custom ? {} : { sound: ALARM_SOUND }),
      smallIcon: 'ic_notification',
      pressAction: { id: 'default' },
      // Alarm clock: wake the screen over the lock screen and keep ringing until acknowledged.
      fullScreenAction: { id: 'default' },
      lightUpScreen: true,
      loopSound: true,
      ongoing: true,
      autoCancel: false,
      timeoutAfter: 15 * 60_000,
      // "On the way" on a start alarm also opens the app (owner, 5.10).
      actions: [
        isStart(kind)
          ? { title: isSeenAlarm(kind) ? t('alarm.seen') : t('alarm.onTheWay'), pressAction: { id: ACK_ACTION, launchActivity: 'default' } }
          : { title: t('alarm.acknowledge'), pressAction: { id: ACK_ACTION } },
      ],
    },
    ios: { sound: 'default' },
  };
}

/**
 * Queue the modal and ring. The notification is shown even with the app open (6.1.0): its channel
 * plays the alarm sound in a loop until the alarm is answered (acknowledgeAlarm cancels it).
 */
function raise(kind: AlarmKind, job: AlarmJob) {
  const key = keyOf(job.jobId, kind);
  if (raised.has(key) || job.acked.includes(kind)) return;
  raised.add(key);
  pending = [...pending, { kind, job, shownAt: new Date().toISOString() }];
  emit();
  ensureAlarmChannel()
    .catch(() => {})
    .then(() => notifee.displayNotification(notificationFor(kind, job)))
    .catch(() => {});
}

/** The start alarm due now: each alarm rings from its time until the next one's. */
export function dueStartKind(startsAt: string | null, now = Date.now()): AlarmKind | null {
  if (!startsAt) return null;
  const mins = (new Date(startsAt).getTime() - now) / 60_000;
  if (mins <= 0) return null;
  for (const a of [...alarms].sort((x, y) => x.minutes - y.minutes)) if (mins <= a.minutes) return a.kind;
  return null;
}

/** Raise any start reminder that is due now. Cheap — call it on every tick. */
export function evaluateDueAlarms() {
  for (const job of reminders) {
    const kind = dueStartKind(job.startsAt);
    if (kind) raise(kind, job);
  }
}

/** Schedule the 90/60/30-minute notifications ahead of time so they ring with the app closed. */
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
    for (const { kind, minutes: mins } of alarms) {
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
      const data = unwrapData<{ reminders?: AlarmJob[]; dropoffs?: AlarmJob[]; alarms?: StartAlarm[]; soundsVersion?: string }>(res.data);
      reminders = data?.reminders ?? [];
      dropoffs = data?.dropoffs ?? [];
      if (Array.isArray(data?.alarms) && data.alarms.length) alarms = data.alarms;
      await loadSoundState();
      void syncSounds(data?.soundsVersion);
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
      if (Array.isArray(body?.data?.alarms) && body.data.alarms.length) alarms = body.data.alarms as StartAlarm[];
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
  void flushUnsent();
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

/**
 * Answer an alarm (UI review 2a/2b): the screen closes at once and the sound stops; the answer is
 * saved on the phone and sent in the background — with the location for "On the way" — and
 * retried on every refresh until the office has it.
 */
export function acknowledgeAlarm(alarm: PendingAlarm): void {
  pending = pending.filter((a) => a !== alarm);
  emit();
  const id = keyOf(alarm.job.jobId, alarm.kind);
  notifee.cancelNotification(id).catch(() => {});
  alarm.job.acked = [...alarm.job.acked, alarm.kind];
  void sendAck(alarm.job.jobId, alarm.kind, alarm.shownAt);
}

// ── Answers not yet delivered (kept on the phone, retried) ──────────────────
interface UnsentAck {
  jobId: string;
  kind: AlarmKind;
  shownAt?: string;
  answer?: 'SEEN' | 'ON_THE_WAY';
  latitude?: number;
  longitude?: number;
}
const UNSENT_STORE = 'jobAlarmUnsent';
let unsent: UnsentAck[] | null = null;
let flushing = false;

async function loadUnsent(): Promise<UnsentAck[]> {
  if (unsent) return unsent;
  try {
    const raw = await EncryptedStorage.getItem(UNSENT_STORE);
    unsent = raw ? (JSON.parse(raw) as UnsentAck[]) : [];
  } catch {
    unsent = [];
  }
  return unsent;
}
async function saveUnsent(list: UnsentAck[]) {
  unsent = list;
  emit();
  await EncryptedStorage.setItem(UNSENT_STORE, JSON.stringify(list)).catch(() => {});
}

/** How many answers are waiting for signal (the alarm host shows a note). */
export function unsentAnswerCount(): number {
  return unsent?.length ?? 0;
}

/** true = delivered (or refused for good); false = keep and retry. */
async function deliver(a: UnsentAck): Promise<boolean> {
  const signedIn = !!(await secureStorage.getAccessToken().catch(() => null));
  const k = await getAlarmKeyInfo();
  const p = portal ?? k?.portal ?? null;
  const body = {
    kind: a.kind, shownAt: a.shownAt,
    ...(a.answer ? { answer: a.answer } : {}),
    ...(a.latitude != null && a.longitude != null ? { latitude: a.latitude, longitude: a.longitude } : {}),
  };
  try {
    if (signedIn && p && !keyMode) {
      await api.post(`/${p}-portal/jobs/${a.jobId}/alerts/ack`, body);
      return true;
    }
    if (k) {
      const res = await fetch(`${api.defaults.baseURL}/public/alarms/jobs/${a.jobId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Alarm-Key': k.key },
        body: JSON.stringify(body),
      });
      return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);
    }
    return true; // nobody to send it as: drop
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    // A 4xx (job gone / not ours) will never succeed; network errors and 5xx retry.
    return !!status && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
  }
}

/** Retry every saved answer. Called after each refresh and when an answer is given. */
export async function flushUnsent(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const list = await loadUnsent();
    if (!list.length) return;
    const left: UnsentAck[] = [];
    for (const a of list) if (!(await deliver(a))) left.push(a);
    await saveUnsent(left);
  } finally {
    flushing = false;
  }
}

/** Queue the answer (with the location for "On the way") and try to send it now. */
async function sendAck(jobId: string, kind: AlarmKind, shownAt?: string) {
  const answer = isStart(kind) ? (isSeenAlarm(kind) ? 'SEEN' : 'ON_THE_WAY') : undefined;
  if (answer === 'ON_THE_WAY') {
    // Where the phone is now (falls back to the last known fix). Runs after the screen closed.
    const fix = await getCurrentPosition(15_000).catch(() => null);
    if (fix) lastPosition = { lat: fix.lat, lng: fix.lng };
  }
  const loc = lastPosition ? { latitude: lastPosition.lat, longitude: lastPosition.lng } : {};
  const list = await loadUnsent();
  await saveUnsent([...list.filter((x) => !(x.jobId === jobId && x.kind === kind)), { jobId, kind, shownAt, answer, ...loc }]);
  await flushUnsent();
}

/** "On the way" / "I've seen it" pressed on the notification itself (app closed, locked, or open). */
export async function handleAlarmNotificationAction(type: EventType, notification?: Notification, actionId?: string) {
  if (type !== EventType.ACTION_PRESS || actionId !== ACK_ACTION) return;
  const jobId = notification?.data?.jobId as string | undefined;
  const kind = notification?.data?.kind as AlarmKind | undefined;
  if (!jobId || !kind) return;
  await notifee.cancelNotification(keyOf(jobId, kind)).catch(() => {});
  const queued = pending.find((a) => a.job.jobId === jobId && a.kind === kind);
  if (queued) {
    acknowledgeAlarm(queued);
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
