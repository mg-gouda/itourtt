import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, useChatMe, useColors } from '@itour/shared';
import { Icon } from '@itour/ui';
import { JobsListScreen } from '../screens/JobsListScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ChatTabScreen } from '../screens/ChatScreens';
import { useNotificationsStore } from '../lib/notifications-store';

/**
 * Five tabs (Material guidance tops out at five). Notifications moved from a
 * tab to the bell on the Jobs header — and a row on Profile — so Complaints
 * keeps its own tab.
 */
export type MainTabParamList = {
  Jobs: undefined;
  History: undefined;
  Chat: undefined;
  /** `complaintId` opens that complaint (notification tap). */
  Complaints: { complaintId?: string; at?: number } | undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TABS: Record<keyof MainTabParamList, { icon: string; active: string; label: string }> = {
  Jobs: { icon: 'briefcase-outline', active: 'briefcase', label: 'repApp.tabJobs' },
  History: { icon: 'time-outline', active: 'time', label: 'repApp.tabHistory' },
  Chat: { icon: 'chatbubbles-outline', active: 'chatbubbles', label: 'repApp.tabChat' },
  Complaints: { icon: 'shield-outline', active: 'shield', label: 'repApp.tabComplaints' },
  Profile: { icon: 'person-circle-outline', active: 'person-circle', label: 'repApp.tabProfile' },
};

function RepTabBar({ state, navigation, badges }: BottomTabBarProps & { badges: Partial<Record<string, number>> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
          shadowColor: colors.shadow,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const cfg = TABS[route.name as keyof MainTabParamList];
        const badge = badges[route.name] ?? 0;
        const color = focused ? colors.primary : colors.mutedForeground;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(cfg.label)}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.item}
          >
            <View style={[styles.iconPill, focused && { backgroundColor: colors.primarySoft }]}>
              <Icon name={focused ? cfg.active : cfg.icon} size={22} color={color} />
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.tabBar }]}>
                  <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }, focused && styles.labelActive]} numberOfLines={1}>
              {t(cfg.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <RepTabBar {...props} badges={{ Chat: chatUnread }} />}
    >
      <Tab.Screen name="Jobs" component={JobsListScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Chat" component={ChatTabScreen} />
      <Tab.Screen name="Complaints" component={ComplaintsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  iconPill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '600' },
  labelActive: { fontWeight: '800' },
});
