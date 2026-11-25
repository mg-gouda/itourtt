import { Linking, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import notifee, { AndroidNotificationSetting, AuthorizationStatus } from '@notifee/react-native';
import { alarmChannelIds } from './job-alerts';

/**
 * Settings › Notifications & alerts (apps 1.8.0): every permission / setting the app needs to
 * ring job alarms on time and keep the office informed, whether each is on, and how to turn it
 * on. The Jobs header gear carries a badge and the app warns once per launch while any is off.
 */
export type PermissionKey =
  | 'notifications'
  | 'exactAlarms'
  | 'fullScreen'
  | 'alarmChannel'
  | 'chatChannel'
  | 'battery'
  | 'location'
  | 'camera'
  | 'microphone';

export interface PermissionItem {
  key: PermissionKey;
  /** i18n key under repApp */
  label: string;
  icon: string;
  on: boolean;
}

const CHAT_CHANNEL = 'itour_chat_v1';
const P = PermissionsAndroid.PERMISSIONS;

let items: PermissionItem[] = [];
let checking: Promise<PermissionItem[]> | null = null;
const listeners = new Set<() => void>();

export function onPermissionHealthChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getPermissionHealth(): PermissionItem[] {
  return items;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function check(): Promise<PermissionItem[]> {
  if (Platform.OS !== 'android') return [];
  const settings = await safe(() => notifee.getNotificationSettings(), null);
  const notifOn = !settings || settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  const exactOn = settings?.android?.alarm !== AndroidNotificationSetting.DISABLED;
  const native = NativeModules.AppUpdate;
  const fullOn = native?.canUseFullScreenIntent ? await safe<boolean>(() => native.canUseFullScreenIntent(), true) : true;
  let alarmBlocked = false;
  for (const id of alarmChannelIds()) {
    if (await safe(() => notifee.isChannelBlocked(id), false)) alarmBlocked = true;
  }
  const chatBlocked = await safe(() => notifee.isChannelBlocked(CHAT_CHANNEL), false);
  const batteryLimited = await safe(() => notifee.isBatteryOptimizationEnabled(), false);
  const has = (perm: string) => safe(() => PermissionsAndroid.check(perm as never), true);
  return [
    { key: 'notifications', label: 'permNotifications', icon: 'notifications-outline', on: notifOn },
    { key: 'exactAlarms', label: 'permExactAlarms', icon: 'alarm-outline', on: exactOn },
    { key: 'fullScreen', label: 'permFullScreen', icon: 'phone-portrait-outline', on: fullOn },
    { key: 'alarmChannel', label: 'permAlarmChannel', icon: 'volume-high-outline', on: !alarmBlocked },
    { key: 'chatChannel', label: 'permChatChannel', icon: 'chatbubble-ellipses-outline', on: !chatBlocked },
    { key: 'battery', label: 'permBattery', icon: 'battery-charging-outline', on: !batteryLimited },
    { key: 'location', label: 'permLocation', icon: 'location-outline', on: await has(P.ACCESS_FINE_LOCATION) },
    { key: 'camera', label: 'permCamera', icon: 'camera-outline', on: await has(P.CAMERA) },
    { key: 'microphone', label: 'permMicrophone', icon: 'mic-outline', on: await has(P.RECORD_AUDIO) },
  ];
}

/** Re-check everything (cheap; call on screen focus and when the app comes back to the front). */
export function refreshPermissionHealth(): Promise<PermissionItem[]> {
  checking ??= check()
    .then((r) => {
      items = r;
      listeners.forEach((l) => l());
      return r;
    })
    .finally(() => {
      checking = null;
    });
  return checking;
}

async function requestOrSettings(perm: string) {
  const r = await safe(() => PermissionsAndroid.request(perm as never), 'denied' as const);
  if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await Linking.openSettings().catch(() => {});
}

/** Open the right system screen / prompt to turn one item on. */
export async function fixPermission(key: PermissionKey): Promise<void> {
  switch (key) {
    case 'notifications': {
      const s = await safe(() => notifee.requestPermission(), null);
      if (!s || s.authorizationStatus < AuthorizationStatus.AUTHORIZED) await notifee.openNotificationSettings().catch(() => {});
      break;
    }
    case 'exactAlarms':
      await notifee.openAlarmPermissionSettings().catch(() => {});
      break;
    case 'fullScreen':
      NativeModules.AppUpdate?.openFullScreenIntentSettings?.();
      break;
    case 'alarmChannel':
      await notifee.openNotificationSettings(alarmChannelIds()[0]).catch(() => {});
      break;
    case 'chatChannel':
      await notifee.openNotificationSettings(CHAT_CHANNEL).catch(() => {});
      break;
    case 'battery':
      await notifee.openBatteryOptimizationSettings().catch(() => {});
      break;
    case 'location':
      await requestOrSettings(P.ACCESS_FINE_LOCATION);
      break;
    case 'camera':
      await requestOrSettings(P.CAMERA);
      break;
    case 'microphone':
      await requestOrSettings(P.RECORD_AUDIO);
      break;
  }
  await refreshPermissionHealth();
}
