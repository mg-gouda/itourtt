// Phone
export { callPhone, openDialer } from './phone';

// WhatsApp
export { openWhatsApp, sendJobWhatsApp } from './whatsapp';

// In-app updates (sideloaded APKs)
export { appUpdate, checkForUpdate, installedVersion } from './app-update';
export type { AvailableUpdate, DownloadStatus, PublishedApp, UpdatableApp } from './app-update';

// Camera
export { takePhoto, pickPhoto, captureOrPick } from './camera';
export type { CapturedPhoto } from './camera';

// Google Maps navigation (tap a job's origin / destination)
export { openJobNavigation, canNavigate, navTarget, googleMapsNavUrl } from './navigation';
export type { NavJob, RouteEnd } from './navigation';

// Location
export { getCurrentPosition, watchPosition, requestLocationPermission, getMapLink } from './location';
export type { GPSPosition } from './location';

// Push Notifications
export {
  setFirebaseMessaging,
  requestNotificationPermission,
  registerDeviceToken,
  unregisterDeviceToken,
  onTokenRefresh,
  onForegroundMessage,
  onNotificationOpened,
  setBackgroundMessageHandler,
} from './push-notifications';
