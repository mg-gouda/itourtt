import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useNetwork, t, type ThemeColors } from '@itour/shared';
import { Icon } from '../Icon';

/**
 * The rep app's design kit. Everything visual that repeats across screens
 * lives here so the screens stay about data and flow.
 */

export const radius = { sm: 10, md: 14, lg: 18, xl: 24 } as const;

export function brandGradient(colors: ThemeColors): string[] {
  return [colors.brandDeep, colors.brand, colors.brandGradientEnd];
}

// ─── Headers ────────────────────────────────────────────────────

/** Gradient page header used by every tab. Children render under the title row. */
export function GradientHeader({
  title,
  subtitle,
  eyebrow,
  right,
  children,
  onBack,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  onBack?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={brandGradient(colors)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 12 }]}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {/* soft decorative rings */}
      <View pointerEvents="none" style={styles.ringA} />
      <View pointerEvents="none" style={styles.ringB} />
      <View style={styles.headerRow}>
        {onBack ? (
          <HeaderIconButton icon="arrow-back" onPress={onBack} />
        ) : null}
        <View style={styles.headerTitles}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      {children}
    </LinearGradient>
  );
}

/** Round translucent button for the gradient header (bell, actions). */
export function HeaderIconButton({
  icon,
  onPress,
  badge,
  label,
}: {
  icon: string;
  onPress: () => void;
  badge?: number;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={21} color="#fff" />
      {badge && badge > 0 ? (
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────

export function Surface({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const colors = useColors();
  const base = [
    styles.surface,
    { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow },
    padded && styles.surfacePadded,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, icon, right }: { title: string; icon?: string; right?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.sectionRow}>
      {icon ? <Icon name={icon} size={16} color={colors.brandAccent} /> : null}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

// ─── Pills ──────────────────────────────────────────────────────

export function Pill({
  label,
  color,
  bg,
  icon,
  style,
}: {
  label: string;
  color: string;
  bg: string;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={12} color={color} /> : null}
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function statusTone(status: string, colors: ThemeColors): { fg: string; bg: string; icon: string } {
  switch (status) {
    case 'IN_PLACE':
    case 'IN_PROGRESS':
      return { fg: colors.info, bg: colors.infoSoft, icon: 'location' };
    case 'COMPLETED':
      return { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' };
    case 'NO_SHOW':
      return { fg: colors.destructive, bg: colors.destructiveSoft, icon: 'person-remove' };
    case 'CANCELLED':
      return { fg: colors.mutedForeground, bg: colors.muted, icon: 'close-circle' };
    default:
      return { fg: colors.warning, bg: colors.warningSoft, icon: 'time' };
  }
}

export function StatusPill({ status }: { status: string }) {
  const colors = useColors();
  const tone = statusTone(status, colors);
  return <Pill label={t(`status.${status}`)} color={tone.fg} bg={tone.bg} icon={tone.icon} />;
}

const SERVICE_ICON: Record<string, string> = {
  ARR: 'mc:airplane-landing',
  DEP: 'mc:airplane-takeoff',
  DAY_TOUR: 'mc:map-marker-path',
  ONE_WAY_TRANSFER: 'mc:arrow-right-bold-circle-outline',
  RETURN: 'mc:swap-horizontal',
  TWO_WAY_TRANSFER: 'mc:swap-horizontal',
  CITY_TO_CITY: 'mc:city-variant-outline',
};

export function serviceTone(serviceType: string, colors: ThemeColors): { fg: string; bg: string; icon: string } {
  const icon = SERVICE_ICON[serviceType] ?? 'mc:car';
  switch (serviceType) {
    case 'ARR':
      return { fg: colors.info, bg: colors.infoSoft, icon };
    case 'DEP':
      return { fg: colors.warning, bg: colors.warningSoft, icon };
    case 'DAY_TOUR':
      return { fg: colors.success, bg: colors.successSoft, icon };
    case 'TWO_WAY_TRANSFER':
      return { fg: colors.violet, bg: colors.violetSoft, icon };
    default:
      return { fg: colors.primary, bg: colors.primarySoft, icon };
  }
}

export function ServicePill({ serviceType }: { serviceType: string }) {
  const colors = useColors();
  const tone = serviceTone(serviceType, colors);
  return <Pill label={t(`serviceType.${serviceType}`)} color={tone.fg} bg={tone.bg} icon={tone.icon} />;
}

/**
 * Job type badge (TrafficJob.bookingChannel): ONLINE (tour operator) navy, B2B orange, B2C (public
 * site) green — theme tokens so it reads in light (owner palette) and dark mode.
 */
export function ChannelPill({ channel }: { channel?: string | null }) {
  const colors = useColors();
  if (channel !== 'ONLINE' && channel !== 'B2B' && channel !== 'B2C') return null;
  const tone =
    channel === 'ONLINE'
      ? { fg: colors.primary, bg: colors.primarySoft, icon: 'globe-outline' }
      : channel === 'B2B'
        ? { fg: colors.warning, bg: colors.warningSoft, icon: 'business-outline' }
        : { fg: colors.success, bg: colors.successSoft, icon: 'person-outline' };
  return <Pill label={t(`bookingChannel.${channel}`)} color={tone.fg} bg={tone.bg} icon={tone.icon} />;
}

// ─── Buttons ────────────────────────────────────────────────────

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function toneColors(tone: Tone, colors: ThemeColors) {
  switch (tone) {
    case 'success':
      return { solid: colors.success, soft: colors.successSoft };
    case 'warning':
      return { solid: colors.warning, soft: colors.warningSoft };
    case 'danger':
      return { solid: colors.destructive, soft: colors.destructiveSoft };
    case 'info':
      return { solid: colors.info, soft: colors.infoSoft };
    case 'neutral':
      return { solid: colors.mutedForeground, soft: colors.muted };
    default:
      return { solid: colors.primary, soft: colors.primarySoft };
  }
}

export function ActionButton({
  label,
  icon,
  onPress,
  tone = 'primary',
  variant = 'solid',
  disabled,
  loading,
  hint,
  size = 'md',
  style,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  tone?: Tone;
  variant?: 'solid' | 'soft' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  /** Small second line, e.g. "Opens 14:20 – 15:50". */
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const c = toneColors(tone, colors);
  const solid = variant === 'solid';
  const fg = solid ? (tone === 'primary' ? colors.primaryForeground : '#FFFFFF') : c.solid;
  const height = size === 'lg' ? 56 : size === 'sm' ? 40 : 48;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        {
          minHeight: height,
          backgroundColor: solid ? c.solid : variant === 'soft' ? c.soft : 'transparent',
          borderColor: variant === 'outline' ? c.solid : 'transparent',
          borderWidth: variant === 'outline' ? 1.5 : 0,
          opacity: disabled ? 0.45 : 1,
        },
        solid && !disabled && { shadowColor: c.solid, ...styles.btnShadow },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <View style={styles.btnRow}>
            {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
            <Text style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? 13 : 15 }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {hint ? (
            <Text style={[styles.btnHint, { color: fg }]} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** Square tile action (icon over label) for secondary job actions. */
export function TileAction({
  label,
  icon,
  onPress,
  tone = 'primary',
  disabled,
  done,
  hint,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  done?: boolean;
  hint?: string;
}) {
  const colors = useColors();
  const c = toneColors(tone, colors);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: disabled ? 0.45 : 1 },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: c.soft }]}>
        <Icon name={icon} size={20} color={c.solid} />
        {done ? (
          <View style={[styles.tileDone, { backgroundColor: colors.success, borderColor: colors.card }]}>
            <Icon name="checkmark" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileLabel, { color: colors.foreground }]} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text style={[styles.tileHint, { color: colors.mutedForeground }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── Rows ───────────────────────────────────────────────────────

export function InfoLine({
  icon,
  label,
  value,
  onPress,
  actionIcon,
}: {
  icon: string;
  label: string;
  value?: string | null;
  onPress?: () => void;
  actionIcon?: string;
}) {
  const colors = useColors();
  if (!value) return null;
  const body = (
    <View style={styles.infoLine}>
      <View style={[styles.infoIcon, { backgroundColor: colors.muted }]}>
        <Icon name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
      </View>
      {onPress ? <Icon name={actionIcon ?? 'chevron-forward'} size={18} color={colors.brandAccent} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Segmented control (period pickers, theme). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onDark,
  compact,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  onDark?: boolean;
  /** Smaller text and padding, for four or more options on a phone. */
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.segment,
        { backgroundColor: onDark ? 'rgba(255,255,255,0.14)' : colors.muted },
      ]}
    >
      {options.map((o) => {
        const active = o.value === value;
        const fg = active ? (onDark ? colors.brand : colors.primary) : onDark ? 'rgba(255,255,255,0.85)' : colors.mutedForeground;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segmentItem,
              compact && styles.segmentItemCompact,
              active && [styles.segmentActive, { backgroundColor: onDark ? '#fff' : colors.card }],
            ]}
          >
            {o.icon ? <Icon name={o.icon} size={14} color={fg} /> : null}
            <Text
              style={[styles.segmentText, compact && styles.segmentTextCompact, { color: fg }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small translucent stat on the gradient header. */
export function HeaderStat({
  value,
  label,
  accent,
  onPress,
  active,
  loading,
}: {
  value: string | number;
  label: string;
  accent?: string;
  /** Makes the tile a button (e.g. filter the list below to this status). */
  onPress?: () => void;
  /** Highlights the tile as the current filter. */
  active?: boolean;
  /** Shows a shimmer bar in place of the number. */
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
      style={({ pressed }) => [styles.hStat, active && styles.hStatActive, pressed && { opacity: 0.75 }]}
    >
      {loading ? (
        <View style={styles.hStatSkel} />
      ) : (
        <Text style={[styles.hStatValue, accent ? { color: accent } : null]}>{value}</Text>
      )}
      <Text style={styles.hStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  ringA: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 28,
    borderColor: 'rgba(255,255,255,0.05)',
    top: -90,
    right: -60,
  },
  ringB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(39,138,204,0.18)',
    bottom: -70,
    left: -30,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitles: { flex: 1, minWidth: 0 },
  eyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '500', marginBottom: 2 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  headerSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#E89638',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A2368',
  },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  surface: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  surfacePadded: { padding: 16 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
  btn: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnShadow: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontWeight: '700', letterSpacing: 0.2 },
  btnHint: { fontSize: 11, opacity: 0.85, marginTop: 1 },
  tile: {
    flex: 1,
    // Two per row: 40% + gap leaves no room for a third.
    minWidth: '40%',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tileDone: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 12.5, fontWeight: '600' },
  tileHint: { fontSize: 10.5, marginTop: -4 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11.5, fontWeight: '500' },
  infoValue: { fontSize: 15, fontWeight: '600', marginTop: 1 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '700' },
  segmentItemCompact: { paddingVertical: 7, paddingHorizontal: 2, gap: 3 },
  segmentTextCompact: { fontSize: 11, fontWeight: '700' },
  hStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  hStatActive: { backgroundColor: 'rgba(255,255,255,0.26)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  hStatSkel: { width: 26, height: 20, marginVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.22)' },
  hStatValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  hStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 1 },
});

/** Floating "offline" pill under the status bar (the bar is translucent in this app). */
export function OfflinePill() {
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  if (isConnected) return null;
  return (
    <View pointerEvents="none" style={[offline.wrap, { top: insets.top + 6 }]}>
      <View style={offline.pill}>
        <Icon name="cloud-offline" size={14} color="#fff" />
        <Text style={offline.text}>{t('common.offline')}</Text>
      </View>
    </View>
  );
}

const offline = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100, elevation: 100 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5484D',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  text: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
