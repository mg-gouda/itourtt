import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { addDays, getLocale, isRTL, t, todayCairo, useColors } from '@itour/shared';
import { Icon } from '../Icon';
import { DatePickerModal } from './DatePickerModal';

const DOW = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ar: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
};
const MON = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

/** Days either side of the anchor. Two years each way scrolls as "endless" in practice. */
const SPAN = 730;
const ITEM_W = 44;
const GAP = 6;
const STRIDE = ITEM_W + GAP;

/** Parse YYYY-MM-DD as a calendar date (no timezone drift). */
function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d));
  const lang = getLocale() === 'ar' ? 'ar' : 'en';
  return { day: d, dow: DOW[lang][js.getUTCDay()], month: MON[lang][m - 1], year: y };
}

/**
 * A horizontally scrolling strip of days (mirrored in Arabic) on the gradient header: swipe left or
 * right through as many days as you like, tap one to select it. The chevrons
 * jump a week and a "Today" chip appears once you've wandered off. The month
 * label follows whatever is in the middle of the strip. Dates are YYYY-MM-DD.
 */
export function WeekStrip({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const colors = useColors();
  const today = todayCairo();
  const listRef = useRef<FlatList<string>>(null);
  const [width, setWidth] = useState(0);
  // The list is built around an anchor; re-anchor only if the date leaves the range.
  const [anchor, setAnchor] = useState(date);
  // In Arabic (RTL) time runs right-to-left: earlier days sit on the right. The
  // list itself is pinned LTR (horizontal-list offsets are unreliable under RTL
  // on Android) and simply holds the days in reverse.
  const rtl = isRTL();
  const days = useMemo(() => {
    const list = Array.from({ length: SPAN * 2 + 1 }, (_, i) => addDays(anchor, i - SPAN));
    return rtl ? list.reverse() : list;
  }, [anchor, rtl]);
  const indexOf = useCallback((d: string) => days.indexOf(d), [days]);
  const [visible, setVisible] = useState(date);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (indexOf(date) < 0) setAnchor(date);
  }, [date, indexOf]);

  const offsetFor = useCallback(
    (idx: number) => Math.max(0, idx * STRIDE - (width - ITEM_W) / 2),
    [width],
  );

  // Keep the selected day centred whenever it changes (tap, chevrons, Today).
  const firstScroll = useRef(true);
  useEffect(() => {
    if (!width) return;
    const idx = indexOf(date);
    if (idx < 0) return;
    listRef.current?.scrollToOffset({ offset: offsetFor(idx), animated: !firstScroll.current });
    firstScroll.current = false;
    setVisible(date);
  }, [date, width, indexOf, offsetFor]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const centre = e.nativeEvent.contentOffset.x + width / 2;
    const idx = Math.min(days.length - 1, Math.max(0, Math.floor(centre / STRIDE)));
    setVisible(days[idx]);
  };

  const shown = parts(visible);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => onChange(addDays(date, -7))} hitSlop={10} style={styles.chev}>
          <Icon name="chevron-back" size={16} color="#fff" />
        </Pressable>
        {/* Tap the month to jump straight to any date. */}
        <Pressable
          onPress={() => setPicking(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('repApp.pickDate')}
          style={({ pressed }) => [styles.monthBtn, pressed && { opacity: 0.7 }]}
        >
          <Icon name="calendar-outline" size={14} color="#fff" />
          <Text style={styles.month}>
            {shown.month} {shown.year}
          </Text>
          <Icon name="chevron-down" size={13} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <Pressable onPress={() => onChange(addDays(date, 7))} hitSlop={10} style={styles.chev}>
          <Icon name="chevron-forward" size={16} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        {date !== today ? (
          <Pressable onPress={() => onChange(today)} style={styles.todayChip}>
            <Icon name="today-outline" size={12} color={colors.brand} />
            <Text style={[styles.todayText, { color: colors.brand }]}>{t('repApp.today')}</Text>
          </Pressable>
        ) : null}
      </View>
      <DatePickerModal visible={picking} value={date} onSelect={onChange} onClose={() => setPicking(false)} />
      <View style={styles.ltr} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          <FlatList
            ref={listRef}
            horizontal
            data={days}
            keyExtractor={(d) => d}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: STRIDE, offset: STRIDE * index, index })}
            // Start roughly centred on the selected day; the effect above fine-tunes it.
            initialScrollIndex={Math.max(0, indexOf(date) - Math.floor(width / STRIDE / 2))}
            initialNumToRender={14}
            windowSize={7}
            decelerationRate="fast"
            snapToInterval={STRIDE}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            extraData={`${date}|${today}`}
            renderItem={({ item: d }) => {
              const p = parts(d);
              const active = d === date;
              const isToday = d === today;
              return (
                <Pressable
                  onPress={() => onChange(d)}
                  style={[styles.day, active && styles.dayActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.dow, active && { color: colors.brand }]} numberOfLines={1}>
                    {p.dow}
                  </Text>
                  <Text style={[styles.num, active && { color: colors.brand }]}>{p.day}</Text>
                  <View style={[styles.dot, isToday && { backgroundColor: active ? colors.brandAccent : '#fff' }]} />
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  chev: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  month: { color: '#fff', fontSize: 14, fontWeight: '700' },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  todayText: { fontSize: 11, fontWeight: '700' },
  day: {
    width: ITEM_W,
    marginRight: GAP,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dayActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  dow: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600' },
  num: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  placeholder: { height: 54 },
  ltr: { direction: 'ltr' },
});
