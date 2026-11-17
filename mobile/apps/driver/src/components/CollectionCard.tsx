import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatCurrency, t, useColors, type Currency } from '@itour/shared';
import { ActionButton, Icon } from '@itour/ui';

/**
 * Cash to collect from the guest, with Mark as collected — the gate that
 * unblocks Complete (server: driver-portal.service › submitCompleted, gate 4).
 */
export function CollectionCard({
  amount,
  currency,
  collected,
  onMarkCollected,
  busy,
  compact,
}: {
  amount: number;
  currency: Currency | null;
  collected: boolean;
  onMarkCollected?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const colors = useColors();
  const fg = collected ? colors.success : colors.warning;
  const bg = collected ? colors.successSoft : colors.warningSoft;
  return (
    <View style={[styles.box, { backgroundColor: bg, borderColor: `${fg}55` }, compact && styles.compact]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${fg}22` }]}>
          <Icon name={collected ? 'checkmark-circle' : 'cash'} size={compact ? 18 : 22} color={fg} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.label, { color: fg }]}>
            {collected ? t('driverApp.collected') : t('driverApp.toCollect')}
          </Text>
          <Text style={[styles.amount, { color: colors.foreground }, compact && { fontSize: 17 }]}>
            {formatCurrency(amount, currency || 'EGP')}
          </Text>
        </View>
      </View>
      {!collected && onMarkCollected ? (
        <ActionButton
          label={t('driverApp.markCollected')}
          icon="checkmark-done"
          tone="warning"
          size={compact ? 'sm' : 'md'}
          loading={busy}
          onPress={onMarkCollected}
          style={styles.btn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { borderWidth: 1, borderRadius: 16, padding: 14 },
  compact: { padding: 10, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  amount: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  btn: { marginTop: 12 },
});
