import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  apiErrorMessage,
  formatDayLabel,
  repPortalApi,
  t,
  todayCairo,
  unwrapList,
  useAuthStore,
  useColors,
  type RepPortalJob,
} from '@itour/shared';
import { EmptyState, Icon, SkeletonList } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { RepJobCard } from '../components/RepJobCard';
import { ActionButton, GradientHeader, HeaderIconButton, HeaderStat } from '../ui/kit';
import { WeekStrip } from '../ui/WeekStrip';
import { useNotificationsStore } from '../lib/notifications-store';
import { jobDay } from '../lib/job-rules';

type Nav = StackNavigationProp<RootStackParamList>;

function greeting(): string {
  const h = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false }));
  if (h < 12) return t('repApp.goodMorning');
  if (h < 17) return t('repApp.goodAfternoon');
  return t('repApp.goodEvening');
}

/** Home tab: greeting, week strip, the day's counters and the job cards. */
export function JobsListScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const user = useAuthStore((s) => s.user);
  const unread = useNotificationsStore((s) => s.unread);
  const [date, setDate] = useState(todayCairo());
  const [jobs, setJobs] = useState<RepPortalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await repPortalApi.getJobs(date);
      setJobs(unwrapList<RepPortalJob>(data, 'jobs'));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('repApp.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    setJobs([]);
    fetchJobs();
  }, [fetchJobs]);

  // Back from an evidence / detail screen → reflect the new status; light poll while visible.
  useFocusEffect(
    useCallback(() => {
      fetchJobs();
      const id = setInterval(fetchJobs, 60000);
      return () => clearInterval(id);
    }, [fetchJobs]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  const stats = useMemo(
    () => ({
      total: jobs.length,
      todo: jobs.filter((j) => j.repStatus === 'PENDING').length,
      inPlace: jobs.filter((j) => j.repStatus === 'IN_PLACE').length,
      done: jobs.filter((j) => ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(j.repStatus)).length,
    }),
    [jobs],
  );

  const firstName = (user?.name ?? '').split(' ')[0];
  const open = (job: RepPortalJob) => navigation.navigate('JobDetail', { jobId: job.id, date: jobDay(job) });

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading ? [] : jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} progressViewOffset={40} />
        }
        ListHeaderComponent={
          <>
            <GradientHeader
              eyebrow={greeting()}
              title={firstName || t('jobs.myJobs')}
              subtitle={formatDayLabel(date)}
              right={
                <HeaderIconButton
                  icon="notifications-outline"
                  badge={unread}
                  label={t('repApp.notificationsTitle')}
                  onPress={() => navigation.navigate('Notifications')}
                />
              }
            >
              <WeekStrip date={date} onChange={setDate} />
              <View style={styles.stats}>
                <HeaderStat value={stats.total} label={t('repApp.statTotal')} />
                <HeaderStat value={stats.todo} label={t('repApp.statPending')} accent="#FBBF5B" />
                <HeaderStat value={stats.inPlace} label={t('repApp.statInPlace')} accent="#7CC4F2" />
                <HeaderStat value={stats.done} label={t('repApp.statDone')} accent="#86EFAC" />
              </View>
            </GradientHeader>
            {error ? (
              <View style={[styles.error, { backgroundColor: colors.destructiveSoft }]}>
                <Icon name="cloud-offline-outline" size={18} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>
                  {error}
                </Text>
                <Text onPress={fetchJobs} style={[styles.errorRetry, { color: colors.destructive }]}>
                  {t('common.retry')}
                </Text>
              </View>
            ) : null}
            {!loading && jobs.length > 0 ? (
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {jobs.length} {t('repApp.jobsToday')}
              </Text>
            ) : null}
            {loading ? (
              <View style={styles.skeleton}>
                <SkeletonList />
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <RepJobCard
            job={item}
            onOpen={() => open(item)}
            onInPlace={() => navigation.navigate('Evidence', { jobId: item.id, jobRef: item.internalRef, kind: 'IN_PLACE' })}
            onComplete={() => navigation.navigate('Evidence', { jobId: item.id, jobRef: item.internalRef, kind: 'COMPLETED' })}
          />
        )}
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyState
              icon="sunny-outline"
              tint={colors.brandAccent}
              title={t('repApp.noJobsTitle')}
              message={t('repApp.noJobsBody')}
              action={
                date !== todayCairo() ? (
                  <ActionButton
                    label={t('repApp.goToday')}
                    icon="today-outline"
                    variant="soft"
                    onPress={() => setDate(todayCairo())}
                  />
                ) : undefined
              }
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24, flexGrow: 1 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  count: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginHorizontal: 20, marginTop: 18, marginBottom: 10 },
  skeleton: { marginTop: 16 },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
  errorRetry: { fontSize: 13, fontWeight: '800' },
});
