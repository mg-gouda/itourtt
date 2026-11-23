import { installedVersion } from '@itour/shared';

/** The installed APK's versionName (native BuildConfig); the fallback only for builds without AppUpdate. */
export const APP_VERSION = installedVersion()?.versionName ?? '1.4.0';
