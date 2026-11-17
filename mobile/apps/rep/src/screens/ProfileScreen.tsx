import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatCurrency,
  repPortalApi,
  t,
  unwrapData,
  useAuthStore,
  useColors,
  useLocaleStore,
  useTheme,
  type RepProfile,
  type Locale,
  type ThemeMode,
} from '@itour/shared';
import { Icon } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Segmented, SectionTitle, Surface, brandGradient } from '@itour/ui';
import { useNotificationsStore } from '../lib/notifications-store';
import { APP_VERSION } from '../lib/version';

type Nav = StackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useTheme();
  const locale = useLocaleStore((s) => s.locale);
  const setAppLocale = useLocaleStore((s) => s.setLocale);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const unread = useNotificationsStore((s) => s.unread);
  const [profile, setProfile] = useState<RepProfile | null>(null);

  useEffect(() => {
    repPortalApi
      .getProfile()
      .then(({ data }) => setProfile(unwrapData<RepProfile>(data)))
      .catch(() => {});
  }, []);

  const name = profile?.name ?? user?.name ?? '';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const signOut = () =>
    Alert.alert(t('repApp.signOut'), t('repApp.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('repApp.signOut'), style: 'destructive', onPress: () => logout() },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 32 }}>
      <LinearGradient
        colors={brandGradient(colors)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 24 }]}
      >
        <View style={styles.avatarRing}>
          <View style={[styles.avatar, { backgroundColor: colors.brandAccent }]}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>{t('repApp.repRole')}</Text>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <View style={[styles.liveDot, { backgroundColor: profile?.isActive === false ? '#FCA5A5' : '#4ADE80' }]} />
            <Text style={styles.badgeText}>{t('repApp.active')}</Text>
          </View>
          {profile?.mobileNumber ? (
            <View style={styles.badge}>
              <Icon name="call" size={12} color="#fff" />
              <Text style={styles.badgeText}>{profile.mobileNumber}</Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.stats}>
          <Surface style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: colors.successSoft }]}>
              <Icon name="cash-outline" size={18} color={colors.success} />
            </View>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {profile ? formatCurrency(Number(profile.feePerFlight) || 0, 'EGP') : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('repApp.feePerFlight')}</Text>
          </Surface>
        </View>

        <Surface>
          <SectionTitle title={t('repApp.appearance')} icon="color-palette" />
          <Segmented<ThemeMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'light', label: t('repApp.light'), icon: 'sunny-outline' },
              { value: 'dark', label: t('repApp.dark'), icon: 'moon-outline' },
              { value: 'system', label: t('repApp.system'), icon: 'phone-portrait-outline' },
            ]}
          />
        </Surface>

        <Surface>
          <SectionTitle title={t('repApp.language')} icon="language" />
          <Segmented<Locale>
            value={locale}
            onChange={setAppLocale}
            options={[
              { value: 'en', label: t('repApp.english') },
              { value: 'ar', label: t('repApp.arabic') },
            ]}
          />
        </Surface>

        <Surface padded={false}>
          <View style={styles.menuHead}>
            <SectionTitle title={t('repApp.account')} icon="person" />
          </View>
          <MenuRow
            icon="notifications-outline"
            label={t('repApp.notificationsTitle')}
            badge={unread}
            onPress={() => navigation.navigate('Notifications')}
          />
          <MenuRow icon="log-out-outline" label={t('repApp.signOut')} danger onPress={signOut} last />
        </Surface>

        <Text style={[styles.version, { color: colors.mutedForeground }]}>
          iTour Rep · {t('repApp.version')} {APP_VERSION}
        </Text>
      </View>
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  danger,
  badge,
  last,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  badge?: number;
  last?: boolean;
}) {
  const colors = useColors();
  const fg = danger ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.muted },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: danger ? colors.destructiveSoft : colors.muted }]}>
        <Icon name={icon} size={18} color={danger ? colors.destructive : colors.primary} />
      </View>
      <Text style={[styles.menuLabel, { color: fg }]}>{label}</Text>
      {badge ? (
        <View style={[styles.menuBadge, { backgroundColor: colors.brandAccent }]}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {!danger ? <Icon name="chevron-forward" size={18} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingBottom: 30,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  avatarRing: { padding: 4, borderRadius: 52, backgroundColor: 'rgba(255,255,255,0.18)' },
  avatar: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 34, fontWeight: '800' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 14 },
  role: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 14 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  body: { padding: 16, gap: 14 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1 },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 10 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  menuHead: { paddingHorizontal: 16, paddingTop: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  menuBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  menuBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 6 },
});
