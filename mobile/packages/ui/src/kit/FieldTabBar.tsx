import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, useColors } from '@itour/shared';
import { Icon } from '../Icon';

/**
 * Rep / driver app tab bar (apps 1.8.0) — the same layout as the web portals:
 * History · Chat · [Jobs] · Complaints · Review. Jobs is the larger raised button in the
 * centre with the route icon (two stops joined by a path). Profile moved to the gear next
 * to the bell on the Jobs header.
 */
export const FIELD_TABS: Record<string, { icon: string; active: string; label: string }> = {
  History: { icon: 'time-outline', active: 'time', label: 'repApp.tabHistory' },
  Chat: { icon: 'chatbubbles-outline', active: 'chatbubbles', label: 'repApp.tabChat' },
  Jobs: { icon: 'mc:transit-connection-variant', active: 'mc:transit-connection-variant', label: 'repApp.tabJobs' },
  Complaints: { icon: 'shield-outline', active: 'shield', label: 'repApp.tabComplaints' },
  Review: { icon: 'star-outline', active: 'star', label: 'repApp.tabReview' },
};

export function FieldTabBar({ state, navigation, badges }: BottomTabBarProps & { badges: Partial<Record<string, number>> }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.tabBar, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8), shadowColor: colors.shadow },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const cfg = FIELD_TABS[route.name] ?? { icon: 'ellipse-outline', active: 'ellipse', label: route.name };
        const badge = badges[route.name] ?? 0;
        const press = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === 'Jobs') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(cfg.label)}
              onPress={press}
              style={styles.item}
            >
              <View
                style={[
                  styles.fab,
                  { backgroundColor: colors.primary, borderColor: colors.tabBar, shadowColor: colors.shadow, opacity: focused ? 1 : 0.92 },
                ]}
              >
                <Icon name={cfg.icon} size={30} color={colors.primaryForeground} />
              </View>
              <Text style={[styles.label, styles.labelActive, { color: focused ? colors.primary : colors.foreground }]} numberOfLines={1}>
                {t(cfg.label)}
              </Text>
            </Pressable>
          );
        }

        const color = focused ? colors.primary : colors.mutedForeground;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(cfg.label)}
            onPress={press}
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
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  iconPill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  // Raised centre button: sits ~26 dp above the bar.
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 4,
    marginTop: -34,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
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
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600' },
  labelActive: { fontWeight: '800' },
});
