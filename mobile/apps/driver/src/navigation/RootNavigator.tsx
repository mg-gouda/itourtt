import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '@itour/shared';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { JobDetailScreen } from '../screens/JobDetailScreen';
import { NoShowScreen } from '../screens/NoShowScreen';
import { AnnouncementsRoute, ChatThreadRoute } from '../screens/ChatScreens';
import { t } from '@itour/shared';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  JobDetail: { jobId: string };
  NoShow: { jobId: string };
  ChatThread: { conversationId: string; title?: string };
  Announcements: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen
            name="JobDetail"
            component={JobDetailScreen}
            options={{ headerShown: true, title: 'Job Details' }}
          />
          <Stack.Screen
            name="NoShow"
            component={NoShowScreen}
            options={{ headerShown: true, title: 'No Show Evidence' }}
          />
          <Stack.Screen
            name="ChatThread"
            component={ChatThreadRoute}
            options={{ headerShown: true, title: t('chat.title') }}
          />
          <Stack.Screen
            name="Announcements"
            component={AnnouncementsRoute}
            options={{ headerShown: true, title: t('chat.announcements') }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
