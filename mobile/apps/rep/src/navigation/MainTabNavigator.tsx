import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useChatMe } from '@itour/shared';
import { FieldTabBar, ReviewComingSoonScreen } from '@itour/ui';
import { JobsListScreen } from '../screens/JobsListScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { ChatTabScreen } from '../screens/ChatScreens';
import { useNotificationsStore } from '../lib/notifications-store';

/**
 * Five tabs, the same as the web portals (apps 1.8.0): History · Chat · [Jobs] · Complaints ·
 * Review. Jobs is the raised centre button. Profile / settings is the gear next to the bell
 * on the Jobs header (a stack screen); Notifications is the bell.
 */
export type MainTabParamList = {
  History: undefined;
  Chat: undefined;
  Jobs: undefined;
  /** `complaintId` opens that complaint (notification tap). */
  Complaints: { complaintId?: string; at?: number } | undefined;
  Review: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  // Chat unread (incl. announcements). This poll also marks waiting messages delivered.
  const { me: chat } = useChatMe();
  const chatUnread = chat?.unreadTotal ?? 0;
  const refreshNotifications = useNotificationsStore((s) => s.refresh);

  useEffect(() => {
    refreshNotifications();
    const id = setInterval(refreshNotifications, 30000);
    return () => clearInterval(id);
  }, [refreshNotifications]);

  return (
    <Tab.Navigator
      initialRouteName="Jobs"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FieldTabBar {...props} badges={{ Chat: chatUnread }} />}
    >
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Chat" component={ChatTabScreen} />
      <Tab.Screen name="Jobs" component={JobsListScreen} />
      <Tab.Screen name="Complaints" component={ComplaintsScreen} />
      <Tab.Screen name="Review" component={ReviewComingSoonScreen} />
    </Tab.Navigator>
  );
}
