// API
export { configureApi, PRODUCTION_API_URL } from './config';
export { default as api } from './api/client';
export { setApiBaseUrl, setOnAuthFailure } from './api/client';
export { authApi, driverPortalApi, repPortalApi, supplierPortalApi, publicApi, chatApi, CHAT_ANNOUNCEMENTS_ID } from './api/endpoints';
export type * from './api/endpoints/chat';

// Auth
export { useAuthStore, validateRole } from './auth/auth-store';
export { secureStorage } from './auth/secure-storage';

// Types
export * from './types';

// Theme
export {
  getColors,
  useColors,
  getStatusColors,
  lightColors,
  darkColors,
  statusColors,
  statusColorsDark,
  serviceTypeColors,
  spacing,
  borderRadius,
  typography,
  useThemeStore,
  useTheme,
} from './theme';
export type { ThemeMode, ThemeColors } from './theme';

// Hooks
export { useNetwork } from './hooks/use-network';
export { useGPS } from './hooks/use-gps';
export { useRefresh } from './hooks/use-refresh';
export { useChatMe, refreshChat, onChatRefresh, CHAT_POLL_MS, CHAT_THREAD_POLL_MS } from './hooks/use-chat-unread';

// Utils
export { formatDate, toApiDate, formatTime, today, addDays, formatTimeCairo, formatDayLabel, todayCairo, timeAgo } from './utils/date';
export { unwrapData, unwrapList, apiErrorMessage } from './utils/response';
export { formatCurrency } from './utils/currency';
export { appAlert, showDialog, registerDialogHost, type DialogButton, type DialogOptions, type DialogTone } from './utils/dialog';
export { getOriginLabel, getDestinationLabel, getRouteLabel } from './utils/route';

// i18n
export { t, tf, useT, setLocale, getLocale, useLocaleStore, isRTL, type Locale } from './i18n';

// Native features
export {
  // Phone
  callPhone,
  openDialer,
  // WhatsApp
  openWhatsApp,
  sendJobWhatsApp,
  // Camera
  takePhoto,
  pickPhoto,
  captureOrPick,
  // Location
  getCurrentPosition,
  watchPosition,
  requestLocationPermission,
  getMapLink,
  // Push Notifications
  setFirebaseMessaging,
  requestNotificationPermission,
  registerDeviceToken,
  unregisterDeviceToken,
  onTokenRefresh,
  onForegroundMessage,
  onNotificationOpened,
  setBackgroundMessageHandler,
  // Google Maps navigation
  openJobNavigation,
  canNavigate,
  navTarget,
  googleMapsNavUrl,
} from './native';
export type { CapturedPhoto, GPSPosition, NavJob, RouteEnd } from './native';

// Voice notes + background sync (rep / driver apps; no Firebase)
export { useVoiceRecorder, useVoicePlayer, stopVoicePlayback, VOICE_MAX_SEC } from './native/voice';
export type { VoiceRecorderState } from './native/voice';
export {
  setupNotifications,
  registerBackgroundSync,
  startBackgroundSync,
  stopBackgroundSync,
  onNotificationOpen,
  clearChatNotifications,
  requestStartupPermissions,
} from './native/background-sync';
export type { NotificationTarget, Portal } from './native/background-sync';
export {
  refreshJobAlerts,
  evaluateDueAlarms,
  checkDropoffs,
  acknowledgeAlarm,
  getPendingAlarms,
  onAlarmsChange,
  alarmTitle,
  alarmBody,
  dueStartKind,
} from './native/job-alerts';
export type { AlarmKind, AlarmJob, AlarmPortal, PendingAlarm } from './native/job-alerts';
