import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getLocale, t, todayCairo, useColors } from '@itour/shared';
import { Icon } from '../Icon';
import { AppModal } from './AppDialog';
import { ActionButton } from './kit';

const DOW = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  ar: ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'],
};
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Month calendar in the app's popup card. `value` / `onSelect` use YYYY-MM-DD
 * (Cairo service dates). Tapping a day picks it and closes.
 */
export function DatePickerModal({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const lang = getLocale() === 'ar' ? 'ar' : 'en';
  const today = todayCairo();
  const [y0, m0] = value.split('-').map(Number);
  const [view, setView] = useState({ y: y0, m: m0 - 1 });

  // Re-open on the selected day's month.
  useEffect(() => {
    if (visible) {
      const [y, m] = value.split('-').map(Number);
      setView({ y, m: m - 1 });
    }
  }, [visible, value]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    const count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= count; d++) out.push(iso(view.y, view.m, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const shift = (delta: number) =>
    setView(({ y, m }) => {
      const n = m + delta;
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
    });

  const pick = (d: string) => {
    onSelect(d);
    onClose();
  };

  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <AppModal visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={[styles.nav, { backgroundColor: colors.muted }]}>
          <Icon name="chevron-back" size={18} color={colors.foreground} />
        </Pressable>
        <View style={styles.headTitle}>
          <Text style={[styles.month, { color: colors.foreground }]}>{MONTHS[lang][view.m]}</Text>
          <Text style={[styles.year, { color: colors.mutedForeground }]}>{view.y}</Text>
        </View>
        <Pressable onPress={() => shift(1)} hitSlop={10} style={[styles.nav, { backgroundColor: colors.muted }]}>
          <Icon name="chevron-forward" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {DOW[lang].map((d) => (
          <Text key={d} style={[styles.dow, { color: colors.mutedForeground }]} numberOfLines={1}>
            {d}
          </Text>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((d, ci) => {
            if (!d) return <View key={ci} style={styles.cell} />;
            const selected = d === value;
            const isToday = d === today;
            return (
              <Pressable
                key={d}
                onPress={() => pick(d)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.cell,
                  styles.day,
                  selected && { backgroundColor: colors.brand },
                  !selected && isToday && { borderWidth: 1.5, borderColor: colors.brandAccent },
                  pressed && !selected && { backgroundColor: colors.muted },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: selected ? '#fff' : isToday ? colors.brandAccent : colors.foreground },
                    (selected || isToday) && styles.dayBold,
                  ]}
                >
                  {Number(d.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.actions}>
        <ActionButton label={t('common.cancel')} tone="neutral" variant="soft" onPress={onClose} style={styles.flex} />
        <ActionButton label={t('repApp.today')} icon="today-outline" onPress={() => pick(today)} style={styles.flex} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  headTitle: { flex: 1, alignItems: 'center' },
  month: { fontSize: 18, fontWeight: '800' },
  year: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  cell: { flex: 1, aspectRatio: 1, margin: 2 },
  day: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontWeight: '600' },
  dayBold: { fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  flex: { flex: 1 },
});
