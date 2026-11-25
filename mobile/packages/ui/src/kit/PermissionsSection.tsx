import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  appAlert,
  fixPermission,
  getPermissionHealth,
  onPermissionHealthChange,
  refreshPermissionHealth,
  t,
  useColors,
  type PermissionItem,
} from '@itour/shared';
import { Icon } from '../Icon';
import { Surface, SectionTitle } from './kit';

/** Live list of the app's needed settings + how many are off. Re-checks when the app returns to the front. */
export function usePermissionHealth(): { items: PermissionItem[]; missing: number; refresh: () => void } {
  const [items, setItems] = useState<PermissionItem[]>(getPermissionHealth());
  useEffect(() => onPermissionHealthChange(() => setItems(getPermissionHealth())), []);
  useEffect(() => {
    void refreshPermissionHealth();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refreshPermissionHealth());
    return () => sub.remove();
  }, []);
  const refresh = useCallback(() => void refreshPermissionHealth(), []);
  return { items, missing: items.filter((i) => !i.on).length, refresh };
}

let warnedThisLaunch = false;

/**
 * Once per app launch: if anything the alarms need is off, say so and offer to open
 * Settings › Notifications & alerts. Mount on the Jobs screen.
 */
export function usePermissionWarning(openSettings: () => void) {
  const { items, missing } = usePermissionHealth();
  const open = useRef(openSettings);
  open.current = openSettings;
  useEffect(() => {
    if (warnedThisLaunch || !items.length || missing === 0) return;
    warnedThisLaunch = true;
    appAlert(
      t('repApp.permMissingTitle'),
      t('repApp.permMissingBody').replace('{n}', String(missing)),
      [
        { text: t('repApp.later'), style: 'cancel' },
        { text: t('repApp.permOpenSettings'), onPress: () => open.current() },
      ],
      { tone: 'warning', icon: 'notifications-off' },
    );
  }, [items, missing]);
}

/** Settings › Notifications & alerts: one row per needed setting with its state and a Turn on button. */
export function PermissionsSection() {
  const colors = useColors();
  const { items, missing } = usePermissionHealth();
  return (
    <Surface padded={false}>
      <View style={styles.head}>
        <SectionTitle title={t('repApp.permTitle')} icon="notifications" />
        <Text style={[styles.desc, { color: colors.mutedForeground }]}>{t('repApp.permDesc')}</Text>
        {items.length > 0 && missing === 0 ? (
          <Text style={[styles.allOn, { color: colors.success }]}>{t('repApp.permAllOn')}</Text>
        ) : null}
      </View>
      {items.map((it, i) => (
        <View
          key={it.key}
          style={[styles.row, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
        >
          <View style={[styles.icon, { backgroundColor: it.on ? colors.successSoft : colors.destructiveSoft }]}>
            <Icon name={it.icon} size={18} color={it.on ? colors.success : colors.destructive} />
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>{t(`repApp.${it.label}`)}</Text>
          {it.on ? (
            <Text style={[styles.state, { color: colors.success }]}>{t('repApp.permOn')}</Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('repApp.permTurnOn')} — ${t(`repApp.${it.label}`)}`}
              onPress={() => void fixPermission(it.key)}
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{t('repApp.permTurnOn')}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, gap: 4 },
  desc: { fontSize: 13, lineHeight: 19 },
  allOn: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  state: { fontSize: 14, fontWeight: '800' },
  btn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '800' },
});
