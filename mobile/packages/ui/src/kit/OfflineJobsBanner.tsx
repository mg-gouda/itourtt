import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  dismissOutboxItem,
  flushOutbox,
  formatTimeCairo,
  loadOutbox,
  onOutboxChange,
  outboxItems,
  t,
  useColors,
  type OutboxItem,
} from '@itour/shared';
import { Icon } from '../Icon';

/**
 * Offline jobs (apps 1.9.0) on the Jobs screen:
 * - "Offline — jobs as of 14:05" while the list comes from the phone's saved copy;
 * - "N actions waiting to send" (+ Send now) while the outbox holds anything;
 * - one red line per action the server refused (the job changed meanwhile), with its reason.
 */
export function OfflineJobsBanner({ savedAt }: { savedAt: number | null }) {
  const colors = useColors();
  const [items, setItems] = useState<OutboxItem[]>(outboxItems());
  useEffect(() => {
    void loadOutbox().then(setItems);
    return onOutboxChange(() => setItems([...outboxItems()]));
  }, []);
  const waiting = items.filter((i) => !i.failed);
  const refused = items.filter((i) => i.failed);
  if (!savedAt && !waiting.length && !refused.length) return null;

  return (
    <View style={styles.wrap}>
      {savedAt ? (
        <View style={[styles.row, { backgroundColor: '#451A03', borderColor: '#F59E0B' }]}>
          <Icon name="cloud-offline" size={18} color="#FCD34D" />
          <Text style={[styles.text, { color: '#FEF3C7' }]}>
            {t('offline.showingSaved').replace('{time}', formatTimeCairo(new Date(savedAt).toISOString()))}
          </Text>
        </View>
      ) : null}
      {waiting.length ? (
        <View style={[styles.row, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Icon name="time-outline" size={18} color={colors.foreground} />
          <Text style={[styles.text, { color: colors.foreground }]}>
            {t('offline.waiting').replace('{n}', String(waiting.length))}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void flushOutbox()} style={[styles.btn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t('offline.sendNow')}</Text>
          </Pressable>
        </View>
      ) : null}
      {refused.map((i) => (
        <View key={i.id} style={[styles.row, { backgroundColor: colors.destructiveSoft, borderColor: colors.destructive }]}>
          <Icon name="alert-circle" size={18} color={colors.destructive} />
          <Text style={[styles.text, { color: colors.foreground }]}>
            {t('offline.notSent')} · {i.kind.replace(/_/g, ' ')} — {i.failed}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('offline.dismiss')} onPress={() => void dismissOutboxItem(i.id)} style={styles.close}>
            <Icon name="close" size={18} color={colors.foreground} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  text: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  btn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 13, fontWeight: '800' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
