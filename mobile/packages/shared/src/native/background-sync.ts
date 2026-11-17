import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { unwrapList } from '../utils/response';
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
  EventType,
  type Event,
} from '@notifee/react-native';
import Geolocation from '@react-native-community/geolocation';
import api from '../api/client';
import { CHAT_ANNOUNCEMENTS_ID, chatApi } from '../api/endpoints/chat';
import { secureStorage } from '../auth/secure-storage';

/**
 * Keeps a rep / driver app in touch with the iTour server without Firebase:
 * an Android foreground service (persistent "connected" notification) polls
 * the same API the web portals use and raises local notifications for new
 * job notifications and chat messages, and sends the location heartbeat for
 * the tracking maps. Everything stays on our own backend and database.
 *
 * iOS does not allow background polling; there the poller only runs while
 * the app is open.
 */

export type Portal = 'driver' | 'rep';

const CHANNEL_ALERTS = 'itour_alerts';
const CHANNEL_SERVICE = 'itour_service';
const SERVICE_NOTIFICATION_ID = 'itour-connection';

const POLL_MS = 30_000;
const HEARTBEAT_MS = 60_000;

/** What a tapped notification should open. */
export type NotificationTarget =
  | { kind: 'job'; jobId: string }
  | { kind: 'chat'; conversationId: string }
  | { kind: 'notifications' };

let portal: Portal | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastHeartbeat = 0;
let lastNotificationAt: string | null = null;
let lastChatAt: string | null = null;
const shownNotificationIds = new Set<string>();

const bg = { headers: { 'X-Background-Poll': '1' } };

async function ensureChannels() {
  await notifee.createChannel({
    id: CHANNEL_ALERTS,
    name: 'Jobs & messages',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });
  await notifee.createChannel({
    id: CHANNEL_SERVICE,
    name: 'Connection status',
    importance: AndroidImportance.MIN,
  });
}

/** Ask for notification permission (Android 13+ / iOS) and create channels. */
export async function setupNotifications() {
  await notifee.requestPermission().catch(() => {});
  if (Platform.OS === 'android') await ensureChannels();
}

async function showAlert(id: string, title: string, body: string, data: Record<string, string>) {
  await notifee.displayNotification({
    id,
    title,
    body,
    data,
    android: { channelId: CHANNEL_ALERTS, pressAction: { id: 'default' }, smallIcon: 'ic_notification' },
    ios: { sound: 'default' },
  });
}

async function locationAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
}

/** POST /tracking/ping with one fix — same heartbeat the web portals send. */
async function heartbeat() {
  if (Date.now() - lastHeartbeat < HEARTBEAT_MS) return;
  if (!(await locationAllowed())) return;
  lastHeartbeat = Date.now();
  await new Promise<void>((resolve) => {
    Geolocation.getCurrentPosition(
      (pos) => {
        api
          .post('/tracking/ping', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
            recordedAt: new Date(pos.timestamp).toISOString(),
          })
          .catch(() => {})
          .finally(resolve);
      },
      () => resolve(),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}

interface PortalNotificationRow {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  trafficJobId?: string | null;
}

/** New portal notifications (job assigned / changed / cancelled …) → local notifications. */
async function pollNotifications() {
  if (!portal) return;
  const { data } = await api.get(`/${portal}-portal/notifications`, bg);
  // `{ success, data: { notifications, unreadCount } }` — see utils/response.
  const rows = unwrapList<PortalNotificationRow>(data, 'notifications');
  const fresh = rows
    .filter((n) => !n.isRead && !shownNotificationIds.has(n.id))
    .filter((n) => lastNotificationAt === null || n.createdAt > lastNotificationAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const newest = rows.reduce<string | null>((m, n) => (!m || n.createdAt > m ? n.createdAt : m), lastNotificationAt);
  // First poll after start: remember where we are, don't replay the backlog.
  if (lastNotificationAt === null) {
    rows.forEach((n) => shownNotificationIds.add(n.id));
    lastNotificationAt = newest ?? new Date().toISOString();
    return;
  }
  for (const n of fresh.slice(-5)) {
    shownNotificationIds.add(n.id);
    await showAlert(`n-${n.id}`, n.title, n.message, {
      type: n.trafficJobId ? 'JOB' : 'NOTIFICATION',
      ...(n.trafficJobId ? { jobId: n.trafficJobId } : {}),
    });
  }
  if (newest) lastNotificationAt = newest;
}

/** New chat messages / announcements → one notification per thread (replaced, not stacked). */
async function pollChat() {
  const me = await chatApi.me();
  const latest = me.latestUnread;
  if (!latest) return;
  if (lastChatAt === null) {
    lastChatAt = latest.at;
    return;
  }
  if (latest.at <= lastChatAt) return;
  lastChatAt = latest.at;
  // Reading the thread on screen is enough — no banner while the app is open.
  if (AppState.currentState === 'active') return;
  let title = '💬 New message';
  let body = '';
  if (latest.conversationId === CHAT_ANNOUNCEMENTS_ID) {
    const s = await chatApi.announcementsSummary().catch(() => null);
    title = `📢 ${s?.last.senderName ?? 'Announcement'}`;
    body = s?.last.body ?? '';
  } else {
    const list = await chatApi.conversations().catch(() => []);
    const c = list.find((x) => x.id === latest.conversationId);
    if (c) {
      title = `💬 ${c.other.name}`;
      const k = c.lastMessage?.kind;
      body =
        k === 'IMAGE' ? '📷 Photo' : k === 'VOICE' ? '🎤 Voice note' : k === 'LOCATION' ? '📍 Location' : (c.lastMessage?.body ?? '');
    }
  }
  await showAlert(`chat-${latest.conversationId}`, title, body.slice(0, 180), {
    type: 'CHAT',
    conversationId: latest.conversationId,
  });
}

async function tick() {
  if (!running) return;
  // Signed out (or token gone): stop quietly.
  if (!(await secureStorage.getAccessToken())) {
    await stopBackgroundSync();
    return;
  }
  await Promise.allSettled([pollNotifications(), pollChat(), heartbeat()]);
  if (running) timer = setTimeout(tick, POLL_MS);
}

/**
 * Must be called once at startup from index.js (outside React): the task
 * notifee runs for the foreground service. It never resolves while syncing.
 */
export function registerBackgroundSync() {
  if (Platform.OS !== 'android') return;
  notifee.registerForegroundService(
    () =>
      new Promise<void>(() => {
        /* the poll loop runs on timers; stopForegroundService() ends the service */
      }),
  );
  notifee.onBackgroundEvent(async () => {
    /* taps are routed by onNotificationOpen when the app comes up */
  });
}

/** Start syncing after sign-in. Safe to call more than once. */
export async function startBackgroundSync(p: Portal, labels: { title: string; body: string }) {
  portal = p;
  if (running) return;
  running = true;
  lastNotificationAt = null;
  lastChatAt = null;
  shownNotificationIds.clear();
  if (Platform.OS === 'android') {
    await ensureChannels();
    const withLocation = await locationAllowed();
    await notifee
      .displayNotification({
        id: SERVICE_NOTIFICATION_ID,
        title: labels.title,
        body: labels.body,
        android: {
          channelId: CHANNEL_SERVICE,
          asForegroundService: true,
          ongoing: true,
          smallIcon: 'ic_notification',
          pressAction: { id: 'default' },
          // Location type keeps the tracking heartbeat alive; it may only be
          // used once location permission is granted (else Android 14 throws).
          foregroundServiceTypes: withLocation
            ? [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION]
            : [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
        },
      })
      .catch(() => {
        /* service could not start — the in-app poll below still works */
      });
  }
  tick();
}

/** Stop on sign-out. */
export async function stopBackgroundSync() {
  running = false;
  portal = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (Platform.OS === 'android') {
    await notifee.stopForegroundService().catch(() => {});
    await notifee.cancelNotification(SERVICE_NOTIFICATION_ID).catch(() => {});
  }
}

function targetOf(data?: Record<string, unknown>): NotificationTarget | null {
  if (!data) return null;
  if (data.type === 'CHAT' && typeof data.conversationId === 'string') {
    return { kind: 'chat', conversationId: data.conversationId };
  }
  if (typeof data.jobId === 'string') return { kind: 'job', jobId: data.jobId };
  if (data.type === 'NOTIFICATION') return { kind: 'notifications' };
  return null;
}

/**
 * Route taps on our notifications (app open, in background, or launched
 * from a tap). Returns an unsubscribe function.
 */
export function onNotificationOpen(handler: (t: NotificationTarget) => void): () => void {
  notifee
    .getInitialNotification()
    .then((initial) => {
      const t = targetOf(initial?.notification.data);
      if (t) handler(t);
    })
    .catch(() => {});
  return notifee.onForegroundEvent(({ type, detail }: Event) => {
    if (type !== EventType.PRESS) return;
    const t = targetOf(detail.notification?.data);
    if (t) handler(t);
  });
}
