import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  apiErrorMessage,
  formatCurrency,
  formatDayLabel,
  driverPortalApi,
  t,
  tf,
  unwrapList,
  useColors,
  type Currency,
  type PortalComplaint,
} from '@itour/shared';
import { EmptyState, Icon, SkeletonList } from '@itour/ui';
import { GradientHeader, HeaderStat, Pill, ServicePill, Surface } from '@itour/ui';

/**
 * Read-only. Only complaints that have been settled against — or in favour of —
 * this person ever reach the portal; an open dispute is internal, and the
 * amounts argued over are never sent to the app.
 */
export function ComplaintsScreen() {
  const colors = useColors();
  const [items, setItems] = useState<PortalComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await driverPortalApi.getComplaints();
      setItems(unwrapList<PortalComplaint>(data));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const totals = useMemo(() => {
    const upheld = items.filter((c) => c.status !== 'WON');
    const points = items.reduce((s, c) => s + (c.scorePenalty || 0), 0);
    const charged = items.reduce((s, c) => s + (Number(c.chargedAmount) || 0), 0);
    return { upheld: upheld.length, points, charged };
  }, [items]);

  const tone = (s: PortalComplaint['status']) =>
    s === 'WON'
      ? { label: t('repApp.inYourFavour'), fg: colors.success, bg: colors.successSoft, icon: 'shield-checkmark' }
      : s === 'PARTIALLY_LOST'
        ? { label: t('repApp.partial'), fg: colors.warning, bg: colors.warningSoft, icon: 'alert-circle' }
        : { label: t('repApp.upheld'), fg: colors.destructive, bg: colors.destructiveSoft, icon: 'warning' };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(c) => c.id}
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
        ListHeaderComponent={
          <>
            <GradientHeader title={t('repApp.complaintsTitle')} subtitle={t('repApp.complaintsIntro')}>
              <View style={styles.stats}>
                <HeaderStat value={items.length} label={t('repApp.total')} />
                <HeaderStat value={totals.upheld} label={t('repApp.upheld')} accent="#FCA5A5" />
                <HeaderStat value={totals.points ? `−${totals.points}` : '0'} label="Score" accent="#FBBF5B" />
              </View>
            </GradientHeader>
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            {loading ? (
              <View style={{ marginTop: 16 }}>
                <SkeletonList count={3} />
              </View>
            ) : null}
            {!loading && items.length ? <View style={{ height: 16 }} /> : null}
          </>
        }
        renderItem={({ item }) => {
          const s = tone(item.status);
          return (
            <Surface padded={false} style={styles.card}>
              <View style={[styles.strip, { backgroundColor: s.fg }]} />
              <View style={styles.body}>
                <View style={styles.top}>
                  <View style={[styles.icon, { backgroundColor: s.bg }]}>
                    <Icon name={s.icon} size={18} color={s.fg} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.subject, { color: colors.foreground }]} numberOfLines={2}>
                      {item.subject}
                    </Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      {item.complaintNo} · {item.categoryEn}
                    </Text>
                  </View>
                </View>
                <View style={styles.pills}>
                  <Pill label={s.label} color={s.fg} bg={s.bg} />
                  {item.serviceType ? <ServicePill serviceType={item.serviceType} /> : null}
                </View>
                <View style={[styles.jobRow, { backgroundColor: colors.muted }]}>
                  <Icon name="briefcase-outline" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.jobText, { color: colors.foreground }]}>{item.jobRef}</Text>
                  <Text style={[styles.jobDate, { color: colors.mutedForeground }]}>{formatDayLabel(item.jobDate)}</Text>
                </View>
                <View style={[styles.impact, { borderTopColor: colors.border }]}>
                  {item.scorePenalty > 0 ? (
                    <View style={styles.impactItem}>
                      <Icon name="trending-down" size={15} color={colors.warning} />
                      <Text style={[styles.impactText, { color: colors.warning }]}>{tf('repApp.scorePoints', { n: item.scorePenalty })}</Text>
                    </View>
                  ) : null}
                  {item.chargedAmount ? (
                    <View style={styles.impactItem}>
                      <Icon name="cash-outline" size={15} color={colors.destructive} />
                      <Text style={[styles.impactText, { color: colors.destructive }]}>
                        {tf('repApp.deducted', {
                          amount: formatCurrency(Number(item.chargedAmount), (item.chargedCurrency || 'EGP') as Currency),
                        })}
                      </Text>
                    </View>
                  ) : null}
                  {!item.scorePenalty && !item.chargedAmount ? (
                    <View style={styles.impactItem}>
                      <Icon name="checkmark-circle-outline" size={15} color={colors.success} />
                      <Text style={[styles.impactText, { color: colors.success }]}>{t('repApp.noImpact')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Surface>
          );
        }}
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyState
              icon="ribbon-outline"
              tint={colors.success}
              title={t('repApp.noComplaintsTitle')}
              message={t('repApp.noComplaintsBody')}
            />
          )
        }
        ListFooterComponent={
          totals.charged > 0 ? (
            <Text style={[styles.footer, { color: colors.mutedForeground }]}>
              {t('repApp.total')}: {formatCurrency(totals.charged, 'EGP')}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 24, flexGrow: 1 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  error: { marginHorizontal: 20, marginTop: 16, fontSize: 13 },
  card: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', overflow: 'hidden' },
  strip: { width: 4 },
  body: { flex: 1, padding: 14 },
  top: { flexDirection: 'row', gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  subject: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  pills: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  jobText: { fontSize: 13, fontWeight: '700' },
  jobDate: { fontSize: 12, marginLeft: 'auto' },
  impact: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  impactItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  impactText: { fontSize: 13, fontWeight: '700' },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
