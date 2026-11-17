import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAuthStore,
  useThemeStore,
  useTheme,
  setOnAuthFailure,
  getColors,
  requestLocationPermission,
  setupNotifications,
  startBackgroundSync,
  stopBackgroundSync,
  onNotificationOpen,
  refreshChat,
  t,
  CHAT_ANNOUNCEMENTS_ID,
} from '@itour/shared';
import { OfflineBar } from '@itour/ui';
import { RootNavigator } from './navigation/RootNavigator';

/**
 * Rep app root. No Firebase: while signed in, a background sync service
 * talks to the iTour server directly for new jobs, chat messages and the
 * tracking heartbeat (see @itour/shared › background-sync).
 */
export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);
  const { isDark } = useTheme();
  const colors = getColors();
  const navigationRef = React.useRef<any>(null);

  useEffect(() => {
    setOnAuthFailure(() => {
      stopBackgroundSync();
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    });

    Promise.all([hydrate(), useThemeStore.getState().hydrate()]).then(() => setReady(true));
  }, [hydrate]);

  // Signed in: permissions, then the sync service. Signed out: stop it.
  useEffect(() => {
    if (!isAuthenticated) {
      stopBackgroundSync();
      return;
    }
    let cancelled = false;
    (async () => {
      await setupNotifications();
      // Location first: it lets the service run as a location service, which
      // keeps the tracking-map heartbeat alive with the app in the background.
      await requestLocationPermission().catch(() => false);
      if (cancelled) return;
      await startBackgroundSync('rep', { title: t('chat.serviceTitle'), body: t('chat.serviceBody') });
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Taps on our notifications.
  useEffect(() => {
    if (!isAuthenticated) return;
    return onNotificationOpen((target) => {
      const nav = navigationRef.current;
      if (!nav) return;
      if (target.kind === 'chat') {
        refreshChat();
        if (target.conversationId === CHAT_ANNOUNCEMENTS_ID) nav.navigate('Announcements');
        else nav.navigate('ChatThread', { conversationId: target.conversationId });
      } else if (target.kind === 'job') {
        nav.navigate('JobDetail', { jobId: target.jobId });
      } else {
        nav.navigate('Main', { screen: 'Notifications' });
      }
    });
  }, [isAuthenticated]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <NavigationContainer ref={navigationRef}>
        <OfflineBar />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
