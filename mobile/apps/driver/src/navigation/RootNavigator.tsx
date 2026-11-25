import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useAuthStore } from '@itour/shared';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabNavigator, type MainTabParamList } from './MainTabNavigator';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { EvidenceScreen, type EvidenceKind } from '../screens/EvidenceScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { AnnouncementsRoute, ChatThreadRoute } from '../screens/ChatScreens';
import { ProfileScreen } from '../screens/ProfileScreen';

export type RootStackParamList = {
  /** Profile + settings (gear on the Jobs header, apps 1.8.0). */
  Profile: undefined;
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /** `date` (YYYY-MM-DD) lets the screen read the job from that day's list. */
  JobDetail: { jobId: string; date?: string };
  Evidence: { jobId: string; jobRef: string; kind: EvidenceKind };
  Notifications: undefined;
  ChatThread: { conversationId: string; title?: string };
  Announcements: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/** Every screen draws its own gradient header (@itour/ui kit). */
export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen name="JobDetail" component={JobDetailScreen} />
          <Stack.Screen name="Evidence" component={EvidenceScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="ChatThread" component={ChatThreadRoute} />
          <Stack.Screen name="Announcements" component={AnnouncementsRoute} />
        </>
      )}
    </Stack.Navigator>
  );
}
