import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, todayCairo, useColors } from '@itour/shared';
import { Icon } from '@itour/ui';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse YYYY-MM-DD as a calendar date (no timezone drift). */
function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d));
  return { day: d, dow: DOW[js.getUTCDay()], month: MON[m - 1], year: y };
}

/**
 * A week of tappable days on the gradient header, with chevrons to move by a
 * week and a "Today" chip when you've wandered off. Dates are YYYY-MM-DD.
 */
export function WeekStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const colors = useColors();
  const today = todayCairo();
  // Centre the selected day: three before, three after.
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)), [date]);
  const sel = parts(date);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => onChange(addDays(date, -7))} hitSlop={10} style={styles.chev}>
          <Icon name="chevron-back" size={18} color="#fff" />
        </Pressable>
        <Text style={styles.month}>
          {sel.month} {sel.year}
        </Text>
        <Pressable onPress={() => onChange(addDays(date, 7))} hitSlop={10} style={styles.chev}>
          <Icon name="chevron-forward" size={18} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        {date !== today ? (
          <Pressable onPress={() => onChange(today)} style={styles.todayChip}>
            <Icon name="today-outline" size={13} color={colors.brand} />
            <Text style={[styles.todayText, { color: colors.brand }]}>Today</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        {days.map((d) => {
          const p = parts(d);
          const active = d === date;
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              onPress={() => onChange(d)}
              style={[styles.day, active && styles.dayActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.dow, active && { color: colors.brand }]}>{p.dow}</Text>
              <Text style={[styles.num, active && { color: colors.brand }]}>{p.day}</Text>
              <View style={[styles.dot, isToday && { backgroundColor: active ? colors.brandAccent : '#fff' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  chev: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  month: { color: '#fff', fontSize: 15, fontWeight: '700', marginHorizontal: 4 },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  todayText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dayActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  dow: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  num: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },
});
