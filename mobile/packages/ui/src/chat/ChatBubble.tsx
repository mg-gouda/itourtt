import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  api,
  borderRadius,
  getColors,
  secureStorage,
  spacing,
  useT,
  type ChatMessage,
  type ChatMessageStatus,
} from '@itour/shared';

/** "14:05" (today) or "16 Nov 14:05", always Cairo time. */
export function chatTime(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    ...(day(d) === day(new Date()) ? {} : { day: '2-digit', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const fmtDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const SEEN_ON_DARK = '#38BDF8';
const SEEN_ON_LIGHT = '#0284C7';

/** ✓ sent · ✓✓ delivered · blue ✓✓ seen. */
export function StatusTicks({ status, onPrimary }: { status: ChatMessageStatus; onPrimary?: boolean }) {
  const colors = getColors();
  const t = useT();
  const base = onPrimary ? colors.primaryForeground : colors.mutedForeground;
  return (
    <Text
      accessibilityLabel={t(status === 'SEEN' ? 'chat.seen' : status === 'DELIVERED' ? 'chat.delivered' : 'chat.sent')}
      style={[
        styles.ticks,
        { color: status === 'SEEN' ? (onPrimary ? SEEN_ON_DARK : SEEN_ON_LIGHT) : base },
        status === 'SEEN' && styles.ticksSeen,
      ]}
    >
      {status === 'SENT' ? '✓' : '✓✓'}
    </Text>
  );
}

/**
 * An auth-gated chat image: streamed from the API with the bearer token
 * (attachments are never public). Retries once with a fresh token.
 */
function AuthImage({ path, localUri, onPress }: { path: string | null; localUri?: string; onPress: (uri: string, headers?: Record<string, string>) => void }) {
  const t = useT();
  const colors = getColors();
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    if (localUri || !path) return;
    let alive = true;
    secureStorage.getAccessToken().then((tk) => alive && setToken(tk));
    return () => {
      alive = false;
    };
  }, [path, localUri, failed]);

  if (localUri) {
    return (
      <Pressable onPress={() => onPress(localUri)}>
        <Image source={{ uri: localUri }} style={styles.image} resizeMode="cover" />
      </Pressable>
    );
  }
  if (!path || !token) {
    return (
      <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }
  if (failed > 1) {
    return (
      <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{t('chat.attachmentFailed')}</Text>
      </View>
    );
  }
  const uri = `${api.defaults.baseURL}${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  return (
    <Pressable onPress={() => onPress(uri, headers)}>
      <Image
        source={{ uri, headers }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed((n) => n + 1)}
      />
    </Pressable>
  );
}

/**
 * One chat bubble: photo / voice note / location / text, time and — on the
 * caller's own messages — the delivery ticks.
 */
export function ChatBubble({
  m,
  status,
  attachmentPath,
  heading,
  onRetry,
  onOpenImage,
}: {
  m: ChatMessage;
  status: ChatMessageStatus | null;
  attachmentPath: string | null;
  heading?: string;
  onRetry?: () => void;
  onOpenImage: (uri: string, headers?: Record<string, string>) => void;
}) {
  const colors = getColors();
  const t = useT();
  const mine = m.fromMe;
  const fg = mine ? colors.primaryForeground : colors.foreground;
  const sub = mine ? colors.primaryForeground : colors.mutedForeground;

  const body = (
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
          : { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        m.pending && styles.pending,
        m.failed && { borderColor: colors.destructive, borderWidth: 2 },
      ]}
    >
      {heading ? <Text style={[styles.heading, { color: sub }]}>{heading}</Text> : null}
      {m.kind === 'IMAGE' && <AuthImage path={attachmentPath} localUri={m.localUri} onPress={onOpenImage} />}
      {m.kind === 'VOICE' && (
        <View style={styles.voice}>
          <Text style={{ color: fg, fontSize: 14 }}>
            🎤 {t('chat.voiceNote')}
            {m.durationSec ? ` · ${fmtDuration(m.durationSec)}` : ''}
          </Text>
          <Text style={[styles.voiceHint, { color: sub }]}>{t('chat.voiceWebOnly')}</Text>
        </View>
      )}
      {m.kind === 'LOCATION' && m.latitude != null && m.longitude != null && (
        <LocationCard lat={m.latitude} lng={m.longitude} accuracyM={m.accuracyM ?? null} />
      )}
      {m.body ? <Text style={[styles.text, { color: fg }]}>{m.body}</Text> : null}
      <View style={styles.meta}>
        <Text style={[styles.time, { color: sub }]}>{chatTime(m.createdAt)}</Text>
        {mine && m.pending ? <ActivityIndicator size="small" color={sub} style={styles.spinner} /> : null}
        {mine && !m.pending && !m.failed && status ? <StatusTicks status={status} onPrimary /> : null}
      </View>
      {m.failed ? <Text style={[styles.failed, { color: mine ? colors.primaryForeground : colors.destructive }]}>{t('chat.notSent')}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {m.failed && onRetry ? <Pressable onPress={onRetry}>{body}</Pressable> : body}
    </View>
  );
}

/** Coordinates + Open in Maps / Directions (Google Maps app or browser). */
function LocationCard({ lat, lng, accuracyM }: { lat: number; lng: number; accuracyM: number | null }) {
  const colors = getColors();
  const t = useT();
  const q = `${lat.toFixed(7)},${lng.toFixed(7)}`;
  return (
    <View style={[styles.location, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Pressable
        onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)}
        style={styles.locationTop}
      >
        <Text style={styles.pin}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: 13 }}>{t('chat.location')}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
            {accuracyM ? ` · ±${accuracyM} m` : ''}
          </Text>
        </View>
      </Pressable>
      <View style={[styles.locationActions, { borderTopColor: colors.border }]}>
        <Pressable
          style={styles.locationBtn}
          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '500' }}>{t('chat.openInMaps')}</Text>
        </Pressable>
        <Pressable
          style={[styles.locationBtn, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`)}
        >
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '500' }}>{t('chat.directions')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 3 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: borderRadius['2xl'],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  pending: { opacity: 0.7 },
  heading: { fontSize: 11, fontWeight: '700', marginBottom: 2, opacity: 0.9 },
  text: { fontSize: 15, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  time: { fontSize: 10, opacity: 0.8 },
  spinner: { marginLeft: 4, transform: [{ scale: 0.6 }] },
  ticks: { fontSize: 11, marginLeft: 4, letterSpacing: -3, paddingRight: 3 },
  ticksSeen: { fontWeight: '800' },
  failed: { fontSize: 11, marginTop: 2, textAlign: 'right' },
  image: { width: 220, height: 220, borderRadius: borderRadius.xl, marginBottom: 4 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  voice: { paddingVertical: 4 },
  voiceHint: { fontSize: 11, marginTop: 2, opacity: 0.8 },
  location: { width: 230, borderRadius: borderRadius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 4 },
  locationTop: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing[2] },
  pin: { fontSize: 22 },
  locationActions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  locationBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing[2] },
});
