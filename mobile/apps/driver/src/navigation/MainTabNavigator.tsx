import React, { useEffect, useState, useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useChatMe, getColors, driverPortalApi, useT, unwrapList } from '@itour/shared';
import { JobsListScreen } from '../screens/JobsListScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ChatTabScreen } from '../screens/ChatScreens';
import { Icon } from '@itour/ui';

// Without an icon per tab React Navigation draws an empty placeholder box.
const TAB_ICONS: Record<string, [string, string]> = {
  Jobs: ['car-outline', 'car'],
  History: ['time-outline', 'time'],
  Complaints: ['shield-outline', 'shield'],
  Chat: ['chatbubbles-outline', 'chatbubbles'],
  Notifications: ['notifications-outline', 'notifications'],
  Profile: ['person-circle-outline', 'person-circle'],
};

export type MainTabParamList = {
  Jobs: undefined;
  History: undefined;
  Complaints: undefined;
  Chat: undefined;
  Notifications: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator() {
  const colors = getColors();
  const t = useT();
  const [unreadCount, setUnreadCount] = useState(0);
  // Chat unread (incl. announcements). This poll also marks waiting messages delivered.
  const { me: chat } = useChatMe();
  const chatUnread = chat?.unreadTotal ?? 0;

  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await driverPortalApi.getNotifications();
      const notifications = unwrapList<any>(data);
      setUnreadCount(notifications.filter((n: any) => !n.isRead).length);
    } catch {
      // Ignore errors for badge count
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <Icon name={TAB_ICONS[route.name]?.[focused ? 1 : 0] ?? 'ellipse-outline'} size={size} color={color} />
        ),
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.foreground,
      })}
    >
      <Tab.Screen
        name="Jobs"
        component={JobsListScreen}
        options={{
          title: t('jobs.todayJobs'),
          tabBarLabel: t('tabs.jobs'),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: t('jobs.history'),
          tabBarLabel: t('tabs.history'),
        }}
      />
      <Tab.Screen
        name="Complaints"
        component={ComplaintsScreen}
        options={{
          title: 'Complaints',
          tabBarLabel: 'Complaints',
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatTabScreen}
        options={{
          title: t('chat.title'),
          tabBarLabel: t('tabs.chat'),
          tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: t('notifications.title'),
          tabBarLabel: t('tabs.notifications'),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('profile.title'),
          tabBarLabel: t('tabs.profile'),
        }}
      />
    </Tab.Navigator>
  );
}
