import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import {
  apiErrorMessage,
  repPortalApi,
  t,
  timeAgo,
  todayCairo,
  addDays,
  unwrapList,
  useColors,
  type PortalNotification,
  type ThemeColors,
} from '@itour/shared';
import { EmptyState, Icon, SkeletonList } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { GradientHeader } from '@itour/ui';
import { useNotificationsStore } from '../lib/notifications-store';

type Props = StackScreenProps<RootStackParamList, 'Notifications'>;

const cairoDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

/** Icon + tint per notification, from its type and wording (cancel / delay / update). */
function look(n: PortalNotification, colors: ThemeColors): { icon: string; fg: string; bg: string } {
  const text = `${n.title} ${n.message}`.toLowerCase();
  if (text.includes('cancel')) return { icon: 'close-circle', fg: colors.destructive, bg: colors.destructiveSoft };
  if (text.includes('delay')) return { icon: 'time', fg: colors.warning, bg: colors.warningSoft };
  if (n.type === 'JOB_ASSIGNED') return { icon: 'briefcase', fg: colors.success, bg: colors.successSoft };
  if (n.type === 'JOB_UPDATED') return { icon: 'create', fg: colors.info, bg: colors.infoSoft };
  return { icon: 'megaphone', fg: colors.primary, bg: colors.primarySoft };
}

/** The rep's notification feed, grouped Today / Yesterday / Earlier. Tapping opens the job. */
export function NotificationsScreen({ navigation }: Props) {
  const colors = useColors();
  const setUnread = useNotificationsStore((s) => s.set);
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await repPortalApi.getNotifications();
      const list = unwrapList<PortalNotification>(data, 'notifications');
      setItems(list);
      setUnread(list.filter((n) => !n.isRead).length);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [setUnread]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const unread = items.filter((n) => !n.isRead).length;

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await repPortalApi.markAllNotificationsRead();
    } catch {
      fetchAll();
    }
  };

  const open = async (n: PortalNotification) => {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread(Math.max(0, unread - 1));
      repPortalApi.markNotificationRead(n.id).catch(() => {});
    }
    if (n.trafficJobId) {
      navigation.navigate('JobDetail', {
        jobId: n.trafficJobId,
        date: n.trafficJob?.jobDate ? n.trafficJob.jobDate.slice(0, 10) : undefined,
      });
    }
  };

  const sections = useMemo(() => {
    const today = todayCairo();
    const yesterday = addDays(today, -1);
    const groups: Record<string, PortalNotification[]> = { today: [], yesterday: [], earlier: [] };
    items.forEach((n) => {
      const d = cairoDay(n.createdAt);
      groups[d === today ? 'today' : d === yesterday ? 'yesterday' : 'earlier'].push(n);
    });
    return [
      { key: 'today', title: t('repApp.todayLabel'), data: groups.today },
      { key: 'yesterday', title: t('repApp.yesterday'), data: groups.yesterday },
      { key: 'earlier', title: t('repApp.earlier'), data: groups.earlier },
    ].filter((s) => s.data.length);
  }, [items]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <GradientHeader
        title={t('repApp.notificationsTitle')}
        subtitle={unread ? `${unread} unread` : undefined}
        onBack={() => navigation.goBack()}
        right={
          unread ? (
            <Pressable onPress={markAll} style={styles.markAll} hitSlop={6}>
              <Icon name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.markAllText}>{t('repApp.markAllRead')}</Text>
            </Pressable>
          ) : undefined
        }
      />
      {loading ? (
        <View style={{ marginTop: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              colors={[colors.primary]}
              onRefresh={async () => {
                setRefreshing(true);
                await fetchAll();
                setRefreshing(false);
              }}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={[styles.section, { color: colors.mutedForeground }]}>{section.title}</Text>
          )}
          renderItem={({ item: n }) => {
            const l = look(n, colors);
            return (
              <Pressable
                onPress={() => open(n)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: n.isRead ? colors.card : colors.accent,
                    borderColor: n.isRead ? colors.border : `${colors.brandAccent}55`,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: l.bg }]}>
                  <Icon name={l.icon} size={20} color={l.fg} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.foreground }, !n.isRead && styles.bold]} numberOfLines={2}>
                      {n.title}
                    </Text>
                    {!n.isRead ? <View style={[styles.dot, { backgroundColor: colors.brandAccent }]} /> : null}
                  </View>
                  <Text style={[styles.message, { color: colors.mutedForeground }]} numberOfLines={3}>
                    {n.message}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>{timeAgo(n.createdAt)}</Text>
                    {n.trafficJob?.internalRef ? (
                      <View style={[styles.refChip, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.refText, { color: colors.primary }]}>{n.trafficJob.internalRef}</Text>
                      </View>
                    ) : null}
                    {n.trafficJobId ? (
                      <>
                        <View style={styles.flex} />
                        <Text style={[styles.openText, { color: colors.brandAccent }]}>{t('repApp.openJob')}</Text>
                        <Icon name="chevron-forward" size={14} color={colors.brandAccent} />
                      </>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            error ? (
              <EmptyState icon="cloud-offline-outline" tint={colors.destructive} title={t('common.error')} message={error} />
            ) : (
              <EmptyState
                icon="notifications-off-outline"
                title={t('repApp.noNotificationsTitle')}
                message={t('repApp.noNotificationsBody')}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  markAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8, marginBottom: 10 },
  item: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  bold: { fontWeight: '800' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  message: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  meta: { fontSize: 12 },
  refChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  refText: { fontSize: 11, fontWeight: '800' },
  openText: { fontSize: 12, fontWeight: '700' },
});
