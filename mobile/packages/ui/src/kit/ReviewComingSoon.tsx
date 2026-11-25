import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, useColors } from '@itour/shared';
import { Icon } from '../Icon';

/** Review tab (apps 1.8.0): placeholder until the review feature is built. */
export function ReviewComingSoonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.disc, { backgroundColor: colors.primarySoft }]}>
        <Icon name="star" size={40} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{t('repApp.reviewTitle')}</Text>
      <View style={[styles.pill, { backgroundColor: colors.muted }]}>
        <Text style={[styles.pillText, { color: colors.mutedForeground }]}>{t('repApp.comingSoon')}</Text>
      </View>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>{t('repApp.reviewSoonBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  disc: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginTop: 18 },
  pill: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 14 },
});
