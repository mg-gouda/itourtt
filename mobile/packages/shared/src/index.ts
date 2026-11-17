// API
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
export type { ThemeMode } from './theme';

// Hooks
export { useNetwork } from './hooks/use-network';
export { useGPS } from './hooks/use-gps';
export { useRefresh } from './hooks/use-refresh';
export { useChatMe, refreshChat, onChatRefresh, CHAT_POLL_MS, CHAT_THREAD_POLL_MS } from './hooks/use-chat-unread';

// Utils
export { formatDate, toApiDate, formatTime, today, addDays } from './utils/date';
export { formatCurrency } from './utils/currency';
export { getOriginLabel, getDestinationLabel, getRouteLabel } from './utils/route';

// i18n
export { t, useT, setLocale, getLocale } from './i18n';

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
