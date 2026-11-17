import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAuthStore,
  useThemeStore,
  useTheme,
  setOnAuthFailure,
  useColors,
  requestLocationPermission,
  setupNotifications,
  startBackgroundSync,
  stopBackgroundSync,
  onNotificationOpen,
  refreshChat,
  t,
  CHAT_ANNOUNCEMENTS_ID,
} from '@itour/shared';
import { RootNavigator } from './navigation/RootNavigator';
import { Splash } from '@itour/ui';
import { OfflinePill } from '@itour/ui';

/**
 * Rep app root. No Firebase: while signed in, a background sync service
 * talks to the iTour server directly for new jobs, chat messages and the
 * tracking heartbeat (see @itour/shared › background-sync).
 */
export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const hideSplash = useCallback(() => setSplashGone(true), []);
  const { isDark } = useTheme();
  const colors = useColors();
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
        nav.navigate('Notifications');
      }
    });
  }, [isAuthenticated]);

  return (
    <SafeAreaProvider>
      {/* Every screen starts with a navy gradient header, so the status bar is translucent + light. */}
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {ready ? (
        <NavigationContainer
          ref={navigationRef}
          theme={{
            ...(isDark ? DarkTheme : DefaultTheme),
            colors: {
              ...(isDark ? DarkTheme : DefaultTheme).colors,
              background: colors.background,
              card: colors.card,
              primary: colors.primary,
              text: colors.foreground,
              border: colors.border,
            },
          }}
        >
          <RootNavigator />
        </NavigationContainer>
      ) : null}
      {ready ? <OfflinePill /> : null}
      {!splashGone ? <Splash done={ready} onHidden={hideSplash} appName="Rep" tagline={t('repApp.appTagline')} /> : null}
    </SafeAreaProvider>
  );
}
