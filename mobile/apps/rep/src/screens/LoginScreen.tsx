import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, useAuthStore, useColors, validateRole, appAlert } from '@itour/shared';
import { Icon, logoBadge } from '@itour/ui';
import { ActionButton } from '@itour/ui';
import { APP_VERSION } from '../lib/version';

/** Rep sign-in. A 409 from the server means another device holds the session. */
export function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, isLoading, error } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'id' | 'pw' | null>(null);
  const pwRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    try {
      const user = await login({ identifier: identifier.trim(), password });
      if (!validateRole(user, ['REP'])) {
        appAlert(t('common.error'), t('auth.invalidRole'), undefined, { tone: 'danger' });
        useAuthStore.getState().logout();
      }
    } catch {
      // surfaced via the store's error
    }
  };

  const inputBox = (active: boolean) => [
    styles.inputBox,
    { backgroundColor: colors.background, borderColor: active ? colors.brandAccent : colors.input },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
          <LinearGradient
            colors={['#000F45', '#001E72', '#1B5FA8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 40 }]}
          >
            <View pointerEvents="none" style={styles.ringA} />
            <View pointerEvents="none" style={styles.ringB} />
            <Image source={logoBadge} style={styles.logo} />
            <Text style={styles.brand}>
              iTour <Text style={styles.brandAccent}>Rep</Text>
            </Text>
            <Text style={styles.tagline}>{t('repApp.appTagline')}</Text>
          </LinearGradient>

          <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
            <Text style={[styles.welcome, { color: colors.foreground }]}>{t('repApp.welcome')}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('repApp.signInHint')}</Text>

            <Text style={[styles.label, { color: colors.foreground }]}>{t('auth.identifier')}</Text>
            <View style={inputBox(focus === 'id')}>
              <Icon name="person-outline" size={19} color={focus === 'id' ? colors.brandAccent : colors.mutedForeground} />
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                onFocus={() => setFocus('id')}
                onBlur={() => setFocus(null)}
                placeholder="name@itour.com / 01xxxxxxxxx"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>

            <Text style={[styles.label, { color: colors.foreground }]}>{t('auth.password')}</Text>
            <View style={inputBox(focus === 'pw')}>
              <Icon name="lock-closed-outline" size={19} color={focus === 'pw' ? colors.brandAccent : colors.mutedForeground} />
              <TextInput
                ref={pwRef}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('pw')}
                onBlur={() => setFocus(null)}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!show}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                style={[styles.input, { color: colors.foreground }]}
              />
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} accessibilityLabel={show ? t('repApp.hidePassword') : t('repApp.showPassword')}>
                <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {error ? (
              <View style={[styles.error, { backgroundColor: colors.destructiveSoft }]}>
                <Icon name="alert-circle" size={17} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : null}

            <ActionButton
              size="lg"
              label={t('auth.login')}
              icon="log-in-outline"
              loading={isLoading}
              disabled={!identifier.trim() || !password.trim()}
              onPress={handleLogin}
              style={styles.submit}
            />
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
            <Icon name="code-slash-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {t('repApp.secure')} · v{APP_VERSION}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingBottom: 72,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
  },
  ringA: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 36,
    borderColor: 'rgba(255,255,255,0.05)',
    top: -120,
    right: -100,
  },
  ringB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(39,138,204,0.2)',
    bottom: -60,
    left: -50,
  },
  logo: { width: 108, height: 108 },
  brand: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 16, letterSpacing: -0.4 },
  brandAccent: { color: '#7CC4F2' },
  tagline: { color: 'rgba(255,255,255,0.72)', fontSize: 14, marginTop: 4 },
  card: {
    marginHorizontal: 20,
    marginTop: -44,
    borderRadius: 24,
    padding: 22,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  welcome: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  hint: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  input: { flex: 1, fontSize: 15.5, paddingVertical: 0 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500' },
  submit: { marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'auto', paddingTop: 24 },
  footerText: { fontSize: 12 },
});
