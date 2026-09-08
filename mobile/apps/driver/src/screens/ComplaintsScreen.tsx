import React, { useState, useCallback, useEffect } from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import {
  driverPortalApi,
  getColors,
  spacing,
  typography,
  formatCurrency,
  useRefresh,
  useT,
  type PortalComplaint,
} from '@itour/shared';
import { Badge, Card, EmptyState, SkeletonList } from '@itour/ui';

/**
 * Read-only. Only complaints that have been settled against — or in favour of —
 * this person ever reach the portal; an open dispute is internal, and the
 * amounts argued over are never sent to the app.
 */
export function ComplaintsScreen() {
  const colors = getColors();
  const t = useT();
  const [complaints, setComplaints] = useState<PortalComplaint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await driverPortalApi.getComplaints();
      const list = Array.isArray(data) ? data : (data as any)?.data ?? [];
      setComplaints(list);
    } catch {
      // handled silently, matching the other portal screens
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const { refreshing, handleRefresh } = useRefresh(fetchComplaints);

  const statusStyle = (status: PortalComplaint['status']) => {
    if (status === 'WON') {
      return { bg: colors.card, fg: colors.mutedForeground, label: 'Resolved in our favour' };
    }
    if (status === 'PARTIALLY_LOST') {
      return { bg: colors.card, fg: colors.destructive, label: 'Partially upheld' };
    }
    return { bg: colors.card, fg: colors.destructive, label: 'Upheld' };
  };

  const renderItem = useCallback(
    ({ item }: { item: PortalComplaint }) => {
      const s = statusStyle(item.status);
      return (
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={[typography.bodySmMedium, { color: colors.foreground }]}>
              {item.jobRef}
            </Text>
            <Badge
              label={s.label}
              backgroundColor={s.bg}
              textColor={s.fg}
              borderColor={s.fg}
            />
          </View>

          <Text style={[typography.caption, { color: colors.mutedForeground }]}>
            {item.categoryEn} · {new Date(item.jobDate).toLocaleDateString('en-GB')}
          </Text>

          <Text style={[typography.bodySm, { color: colors.foreground, marginTop: spacing[1] }]}>
            {item.subject}
          </Text>

          {(item.scorePenalty > 0 || item.chargedAmount) && (
            <View style={[styles.impact, { borderTopColor: colors.border }]}>
              {item.scorePenalty > 0 && (
                <Text style={[typography.caption, { color: colors.destructive }]}>
                  −{item.scorePenalty} score points
                </Text>
              )}
              {item.chargedAmount ? (
                <Text style={[typography.caption, { color: colors.destructive }]}>
                  {formatCurrency(item.chargedAmount, item.chargedCurrency || 'EGP')} deducted
                </Text>
              ) : null}
            </View>
          )}
        </Card>
      );
    },
    [colors],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading && !refreshing ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={complaints.length === 0 ? styles.empty : styles.list}
          ListEmptyComponent={<EmptyState title="No complaints" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    padding: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  impact: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
  },
  list: {
    paddingBottom: spacing[4],
  },
  empty: {
    flex: 1,
  },
});
