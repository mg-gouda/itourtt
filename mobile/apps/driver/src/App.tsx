import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAuthStore,
  useThemeStore,
  useLocaleStore,
  useTheme,
  setOnAuthFailure,
  useColors,
  requestStartupPermissions,
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
import { DialogHost, AppUpdateHost, JobAlarmHost, OfflinePill } from '@itour/ui';

/**
 * Driver app root. No Firebase: while signed in, a background sync service
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
  // `t()` is not reactive: a language change remounts the navigator (keyed on
  // locale) and hands it back the state it had, so the user stays on Profile.
  const locale = useLocaleStore((s) => s.locale);
  const navState = React.useRef<any>(undefined);

  useEffect(() => {
    setOnAuthFailure(() => {
      stopBackgroundSync();
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    });

    Promise.all([hydrate(), useThemeStore.getState().hydrate(), useLocaleStore.getState().hydrate()]).then(() => setReady(true));
  }, [hydrate]);

  // First thing on launch (signed in or not): ask for every permission the
  // app needs at once, rather than feature by feature.
  useEffect(() => {
    if (ready) requestStartupPermissions();
  }, [ready]);

  // Signed in: permissions, then the sync service. Signed out: stop it.
  useEffect(() => {
    if (!isAuthenticated) {
      stopBackgroundSync();
      return;
    }
    let cancelled = false;
    (async () => {
      // All permissions were asked up front at launch; wait for that to finish.
      // Location matters here: it lets the service run as a location service,
      // which keeps the tracking-map heartbeat alive in the background.
      await requestStartupPermissions();
      await setupNotifications();
      if (cancelled) return;
      await startBackgroundSync('driver', { title: t('chat.serviceTitle'), body: t('chat.serviceBody') });
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
      } else if (target.kind === 'complaint') {
        nav.navigate('Main', { screen: 'Complaints', params: { complaintId: target.complaintId, at: Date.now() } });
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
          key={locale}
          ref={navigationRef}
          initialState={navState.current}
          onStateChange={(st) => {
            navState.current = st;
          }}
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
      {/* 1 h / 30 min start reminders + drop-off alarms; must be acknowledged (activity-logged). */}
      {/* Newer APK published → offer the in-app download + install (not on Google Play). */}
      {ready ? <AppUpdateHost app="driver" /> : null}
      {ready && isAuthenticated ? (
        <JobAlarmHost portal="driver" onOpenJob={(jobId) => navigationRef.current?.navigate('JobDetail', { jobId })} />
      ) : null}
      {/* Every popup (appAlert) renders here in the app's own style. */}
      <DialogHost />
      {!splashGone ? <Splash done={ready} onHidden={hideSplash} appName="Driver" tagline={t('driverApp.appTagline')} /> : null}
    </SafeAreaProvider>
  );
}
