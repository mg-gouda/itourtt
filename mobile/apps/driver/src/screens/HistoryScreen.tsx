import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  addDays,
  apiErrorMessage,
  formatCurrency,
  formatDayLabel,
  getLocale,
  driverPortalApi,
  t,
  tf,
  todayCairo,
  unwrapList,
  unwrapData,
  useColors,
  type PortalDeduction,
  type DriverPortalJob,
} from '@itour/shared';
import { EmptyState, Icon, SkeletonList } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { GradientHeader, Segmented, ServicePill, StatusPill, Surface } from '@itour/ui';
import { destinationLabel, jobDay, jobTimeLabel, originLabel } from '../lib/job-rules';

type Nav = StackNavigationProp<RootStackParamList>;
type Period = '7' | '30' | 'month' | 'last';

function range(period: Period): { from: string; to: string } {
  const today = todayCairo();
  if (period === '7') return { from: addDays(today, -6), to: today };
  if (period === '30') return { from: addDays(today, -29), to: today };
  const [y, m] = today.split('-').map(Number);
  if (period === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { from: `${py}-${String(pm).padStart(2, '0')}-01`, to: `${py}-${String(pm).padStart(2, '0')}-${last}` };
}

/** Closed rep legs over a period: earnings summary, then the jobs grouped by day. */
export function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const [period, setPeriod] = useState<Period>('30');
  const [jobs, setJobs] = useState<DriverPortalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = range(period);

  const [deductions, setDeductions] = useState<PortalDeduction[]>([]);
  const [showDeductions, setShowDeductions] = useState(false);

  const fetchHistory = useCallback(async () => {
    // Deductions are a side panel: if they fail the history still shows.
    driverPortalApi
      .getDeductions(from, to)
      .then(({ data }) => {
        const rows = unwrapData<PortalDeduction[]>(data);
        setDeductions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setDeductions([]));
    try {
      const { data } = await driverPortalApi.getJobHistory(from, to);
      setJobs(unwrapList<DriverPortalJob>(data, 'jobs'));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    setLoading(true);
    fetchHistory();
  }, [fetchHistory]);

  const summary = useMemo(() => {
    const completed = jobs.filter((j) => j.driverStatus === 'COMPLETED');
    return {
      earnings: completed.reduce((s, j) => s + (Number(j.feeEarned) || 0), 0),
      completed: completed.length,
      noShows: jobs.filter((j) => j.driverStatus === 'NO_SHOW').length,
      cancelled: jobs.filter((j) => j.driverStatus === 'CANCELLED').length,
    };
  }, [jobs]);

  const deductionTotals = useMemo(() => {
    const byCur = new Map<PortalDeduction['currency'], number>();
    deductions.forEach((d) => byCur.set(d.currency, (byCur.get(d.currency) ?? 0) + Math.abs(d.amount)));
    return [...byCur.entries()];
  }, [deductions]);
  const deductedJobs = useMemo(() => new Set(deductions.map((d) => d.job.id)).size, [deductions]);

  const sections = useMemo(() => {
    const byDay = new Map<string, DriverPortalJob[]>();
    [...jobs]
      .sort((a, b) => jobDay(b).localeCompare(jobDay(a)))
      .forEach((j) => {
        const d = jobDay(j);
        byDay.set(d, [...(byDay.get(d) ?? []), j]);
      });
    return [...byDay.entries()].map(([day, data]) => ({ title: day, data }));
  }, [jobs]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={(j) => j.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[colors.primary]}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchHistory();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <>
            <GradientHeader title={t('repApp.historyTitle')} subtitle={`${formatDayLabel(from)}  →  ${formatDayLabel(to)}`}>
              <View style={styles.segment}>
                <Segmented
                  onDark
                  compact
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: '7', label: t('repApp.last7') },
                    { value: '30', label: t('repApp.last30') },
                    { value: 'month', label: t('repApp.thisMonth') },
                    { value: 'last', label: t('repApp.lastMonth') },
                  ]}
                />
              </View>
            </GradientHeader>
            <Surface style={styles.summary}>
              <View style={styles.earnRow}>
                <View style={[styles.earnIcon, { backgroundColor: colors.successSoft }]}>
                  <Icon name="wallet" size={22} color={colors.success} />
                </View>
                <View>
                  <Text style={[styles.earnLabel, { color: colors.mutedForeground }]}>{t('repApp.earnings')}</Text>
                  <Text style={[styles.earnValue, { color: colors.foreground }]}>{formatCurrency(summary.earnings, 'EGP')}</Text>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.counts}>
                <Count value={summary.completed} label={t('repApp.completedJobs')} color={colors.success} />
                <Count value={summary.noShows} label={t('repApp.noShows')} color={colors.destructive} />
                <Count value={summary.cancelled} label={t('repApp.cancelledJobs')} color={colors.mutedForeground} />
              </View>
            </Surface>
            <Surface style={styles.deductCard} padded={false}>
              <Pressable
                onPress={() => setShowDeductions((v) => !v)}
                disabled={!deductions.length}
                style={({ pressed }) => [styles.deductHead, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityState={{ expanded: showDeductions }}
              >
                <View style={[styles.earnIcon, { backgroundColor: colors.destructiveSoft }]}>
                  <Icon name="remove-circle" size={22} color={colors.destructive} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.earnLabel, { color: colors.mutedForeground }]}>{t('repApp.deductions')}</Text>
                  <Text style={[styles.deductValue, { color: deductions.length ? colors.destructive : colors.foreground }]}>
                    {deductionTotals.length
                      ? deductionTotals.map(([cur, amt]) => `-${formatCurrency(amt, cur)}`).join('  ·  ')
                      : formatCurrency(0, 'EGP')}
                  </Text>
                  <Text style={[styles.deductSub, { color: colors.mutedForeground }]}>
                    {deductions.length ? tf('repApp.deductionsCount', { n: deductedJobs }) : t('repApp.noDeductions')}
                  </Text>
                </View>
                {deductions.length ? (
                  <Icon name={showDeductions ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                ) : null}
              </Pressable>
              {showDeductions
                ? deductions.map((d) => (
                    <Pressable
                      key={d.id}
                      onPress={() => navigation.navigate('JobDetail', { jobId: d.job.id, date: d.job.jobDate.slice(0, 10) })}
                      style={({ pressed }) => [
                        styles.deductRow,
                        { borderTopColor: colors.border },
                        pressed && { backgroundColor: colors.muted },
                      ]}
                    >
                      <View style={styles.rowTop}>
                        <Text style={[styles.ref, { color: colors.foreground }]}>{d.job.internalRef}</Text>
                        <Text style={[styles.time, { color: colors.mutedForeground }]}>
                          {formatDayLabel(d.job.jobDate.slice(0, 10))}
                        </Text>
                        <View style={styles.flex} />
                        <Text style={[styles.fee, { color: colors.destructive }]}>
                          -{formatCurrency(Math.abs(d.amount), d.currency)}
                        </Text>
                      </View>
                      {d.categoryEn ? (
                        <Text style={[styles.deductCat, { color: colors.mutedForeground }]}>
                          {(getLocale() === 'ar' ? d.categoryAr : d.categoryEn) ?? ''}
                          {d.complaintNo ? `  ·  ${d.complaintNo}` : ''}
                        </Text>
                      ) : null}
                      <Text style={[styles.deductReason, { color: colors.foreground }]}>
                        {d.reason?.trim() || d.complaintSubject || t('repApp.noReason')}
                      </Text>
                    </Pressable>
                  ))
                : null}
            </Surface>
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            {loading ? <SkeletonList count={3} /> : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.day, { color: colors.mutedForeground }]}>{formatDayLabel(section.title)}</Text>
        )}
        renderItem={({ item }) => (
          <Surface
            style={styles.row}
            onPress={() => navigation.navigate('JobDetail', { jobId: item.id, date: jobDay(item) })}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.ref, { color: colors.foreground }]}>{item.internalRef}</Text>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{jobTimeLabel(item)}</Text>
              <View style={{ flex: 1 }} />
              {item.driverStatus === 'COMPLETED' ? (
                item.feeEarned != null ? (
                  <Text style={[styles.fee, { color: colors.success }]}>+{formatCurrency(Number(item.feeEarned), 'EGP')}</Text>
                ) : (
                  <Text style={[styles.feePending, { color: colors.mutedForeground }]}>{t('driverApp.feePending')}</Text>
                )
              ) : null}
            </View>
            <Text style={[styles.route, { color: colors.foreground }]} numberOfLines={1}>
              {originLabel(item)}  →  {destinationLabel(item)}
            </Text>
            <View style={styles.pills}>
              <ServicePill serviceType={item.serviceType} />
              <StatusPill status={item.driverStatus} />
            </View>
          </Surface>
        )}
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyState icon="file-tray-outline" title={t('repApp.noHistoryTitle')} message={t('repApp.noHistoryBody')} />
          )
        }
      />
    </View>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24, flexGrow: 1 },
  segment: { marginTop: 16 },
  summary: { marginHorizontal: 16, marginTop: -2, marginBottom: 4, transform: [{ translateY: 14 }] },
  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  earnIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  earnLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  earnValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  counts: { flexDirection: 'row' },
  count: { flex: 1, alignItems: 'center' },
  countValue: { fontSize: 20, fontWeight: '800' },
  countLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  error: { marginHorizontal: 20, marginTop: 24, fontSize: 13 },
  deductCard: { marginHorizontal: 16, marginTop: 26, overflow: 'hidden' },
  deductHead: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  deductValue: { fontSize: 18, fontWeight: '800', marginTop: 1 },
  deductSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  deductRow: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  deductCat: { fontSize: 11.5, fontWeight: '600', marginTop: 4 },
  deductReason: { fontSize: 13.5, marginTop: 4, lineHeight: 19 },
  day: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginHorizontal: 20, marginTop: 26, marginBottom: 8 },
  row: { marginHorizontal: 16, marginBottom: 10, padding: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ref: { fontSize: 15, fontWeight: '800' },
  time: { fontSize: 13, fontWeight: '600' },
  fee: { fontSize: 14, fontWeight: '800' },
  feePending: { fontSize: 11, fontWeight: '600' },
  route: { fontSize: 13.5, fontWeight: '500', marginTop: 6 },
  pills: { flexDirection: 'row', gap: 6, marginTop: 10 },
});
