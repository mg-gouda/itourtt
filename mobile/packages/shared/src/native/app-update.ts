import { NativeModules, Platform } from 'react-native';
import api from '../api/client';

/**
 * In-app updates for the sideloaded Android apps (they are not on Google Play).
 * The server lists the published version of each app at GET /api/public/apps/latest
 * (written by scripts/publish-apk.sh); the native AppUpdate module downloads the APK with
 * Android's DownloadManager and opens the system installer.
 */
export type UpdatableApp = 'rep' | 'driver';

export interface PublishedApp {
  versionName: string;
  versionCode: number;
  /** Below this the update is required (the banner cannot be dismissed). */
  minVersionCode?: number;
  notes?: string;
  publishedAt?: string;
  size?: number;
}

export interface AvailableUpdate extends PublishedApp {
  required: boolean;
  url: string;
}

export interface DownloadStatus {
  status: 'pending' | 'running' | 'paused' | 'done' | 'failed';
  downloaded: number;
  total: number;
}

interface AppUpdateNative {
  versionName: string;
  versionCode: number;
  download(url: string, title: string): Promise<string>;
  status(id: string): Promise<DownloadStatus>;
  canInstall(): Promise<boolean>;
  openInstallSettings(): void;
  install(id: string): Promise<boolean>;
  /** Builds from 1.3.1: a finished download kept across app restarts. */
  pendingDownload?(): Promise<{ id: string; versionCode: number } | null>;
  /** Builds from 1.3.1: versionCode inside the downloaded APK, -1 if unreadable. */
  downloadedVersionCode?(): Promise<number>;
}

const native: AppUpdateNative | undefined = Platform.OS === 'android' ? NativeModules.AppUpdate : undefined;

/** The installed app's version (from the APK itself), or null on a build without the module. */
export function installedVersion(): { versionName: string; versionCode: number } | null {
  return native ? { versionName: native.versionName, versionCode: Number(native.versionCode) } : null;
}

/** The newer published version for this app, or null when up to date / unknown. */
export async function checkForUpdate(app: UpdatableApp): Promise<AvailableUpdate | null> {
  const mine = installedVersion();
  if (!mine) return null;
  const { data } = await api.get('/public/apps/latest', { timeout: 15000 });
  const latest: PublishedApp | undefined = (data?.data ?? data)?.[app];
  if (!latest || !(Number(latest.versionCode) > mine.versionCode)) return null;
  return {
    ...latest,
    versionCode: Number(latest.versionCode),
    required: !!latest.minVersionCode && mine.versionCode < Number(latest.minVersionCode),
    url: `${api.defaults.baseURL}/public/apps/${app}.apk?v=${latest.versionCode}`,
  };
}

export const appUpdate = {
  available: !!native,
  download: (url: string, title: string) => native!.download(url, title),
  status: (id: string) => native!.status(id),
  canInstall: () => native!.canInstall(),
  openInstallSettings: () => native!.openInstallSettings(),
  install: (id: string) => native!.install(id),
  /** A finished download of at least `versionCode` that survived an app restart, or null. */
  async pendingDownload(versionCode: number): Promise<string | null> {
    const p = await native?.pendingDownload?.().catch(() => null);
    return p && Number(p.versionCode) >= versionCode ? p.id : null;
  },
  /** Is the downloaded APK really this version (or newer)? True on builds that cannot tell. */
  async downloadIsVersion(versionCode: number): Promise<boolean> {
    if (!native?.downloadedVersionCode) return true;
    return Number(await native.downloadedVersionCode().catch(() => -1)) >= versionCode;
  },
};
