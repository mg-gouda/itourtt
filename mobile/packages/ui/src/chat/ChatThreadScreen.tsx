import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CHAT_THREAD_POLL_MS,
  captureOrPick,
  chatApi,
  clearChatNotifications,
  getColors,
  getCurrentPosition,
  refreshChat,
  spacing,
  stopVoicePlayback,
  useT,
  useVoiceRecorder,
  type ChatKind,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatThreadHeader,
  appAlert,
} from '@itour/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble } from './ChatBubble';
import { Icon } from '../Icon';

const cairoDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

/** "Today" / "Yesterday" / "Mon, 16 Nov" chip between days. */
export function DaySeparator({ iso }: { iso: string }) {
  const colors = getColors();
  const day = cairoDay(iso);
  const today = cairoDay(new Date().toISOString());
  const yesterday = cairoDay(new Date(Date.now() - 86400000).toISOString());
  const label =
    day === today
      ? 'Today'
      : day === yesterday
        ? 'Yesterday'
        : new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', day: '2-digit', month: 'short' });
  return (
    <View style={styles.dayWrap}>
      <View style={[styles.dayChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.dayText, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
    </View>
  );
}

const errMessage = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message;

function statusFor(m: ChatMessage, h: ChatThreadHeader | null): ChatMessageStatus | null {
  if (!m.fromMe || m.pending || m.failed) return null;
  if (h?.otherLastReadAt && h.otherLastReadAt >= m.createdAt) return 'SEEN';
  if (h?.otherLastDeliveredAt && h.otherLastDeliveredAt >= m.createdAt) return 'DELIVERED';
  return 'SENT';
}

/** Full-screen view of a chat photo (auth headers passed through). */
export function ChatImageViewer({
  image,
  onClose,
}: {
  image: { uri: string; headers?: Record<string, string> } | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!image} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewer} onPress={onClose}>
        {image ? (
          <Image source={{ uri: image.uri, headers: image.headers }} style={styles.viewerImage} resizeMode="contain" />
        ) : null}
      </Pressable>
    </Modal>
  );
}

/**
 * One 1:1 conversation: history (paged), 5 s polling, read receipts, and a
 * composer for text, photos (camera or gallery) and the current location.
 * `onHeader` lets the screen put the other person's name in the nav header.
 */
export function ChatThreadScreen({
  conversationId,
  onHeader,
}: {
  conversationId: string;
  onHeader?: (title: string, subtitle: string) => void;
}) {
  const colors = getColors();
  const t = useT();
  // The thread sits on the root stack (no tab bar), so without this the composer
  // lands under Android's gesture/3-button nav. While the keyboard is up the
  // window is resized above it and the inset would only leave a gap.
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);
  // Android 15 runs every targetSdk-35 app edge-to-edge, and the translucent
  // status bar does the same on older phones: `adjustResize` then no longer
  // shrinks the window, so the keyboard covered the composer. Measure how far
  // the keyboard overlaps this screen and lift the content by exactly that much
  // (0 on phones where the window did resize).
  const rootRef = useRef<View>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardUp(true);
      if (Platform.OS !== 'android') return;
      const keyboardTop = e.endCoordinates.screenY;
      requestAnimationFrame(() =>
        rootRef.current?.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h - keyboardTop;
          setKeyboardLift(overlap > 1 ? Math.round(overlap) : 0);
        }),
      );
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardUp(false);
      setKeyboardLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [header, setHeader] = useState<ChatThreadHeader | null>(null);
  // Newest first: the FlatList is inverted so it starts at the bottom.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [viewer, setViewer] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const lastServerAt = useRef<string | null>(null);
  const retryForms = useRef(new Map<string, FormData>());
  const onHeaderRef = useRef(onHeader);
  onHeaderRef.current = onHeader;

  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    chatApi
      .markRead(conversationId)
      .then(() => {
        clearChatNotifications(conversationId);
        refreshChat();
      })
      .catch(() => {});
  }, [conversationId]);

  // Initial load.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([chatApi.conversation(conversationId), chatApi.messages(conversationId, { limit: 40 })])
      .then(([h, page]) => {
        if (!alive) return;
        setHeader(h);
        onHeaderRef.current?.(h.other.name, h.other.roleName);
        setMessages([...page.messages].reverse());
        setHasMore(page.hasMore);
        lastServerAt.current = page.messages.at(-1)?.createdAt ?? null;
        if (!h.other.active) setBlocked(t('chat.unavailable'));
        markRead();
      })
      .catch(() => alive && setBlocked(t('chat.loadFailed')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [conversationId, markRead, t]);

  // Live polling while the app is in the foreground.
  useEffect(() => {
    if (loading) return;
    const poll = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const page = await chatApi.messages(
          conversationId,
          lastServerAt.current ? { after: lastServerAt.current } : { limit: 40 },
          true,
        );
        setHeader((h) =>
          h ? { ...h, otherLastReadAt: page.otherLastReadAt, otherLastDeliveredAt: page.otherLastDeliveredAt } : h,
        );
        if (page.messages.length) {
          lastServerAt.current = page.messages.at(-1)!.createdAt;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = page.messages.filter((m) => !seen.has(m.id)).reverse();
            return [...fresh, ...prev];
          });
          if (page.messages.some((m) => !m.fromMe)) markRead();
        }
      } catch {
        /* next tick */
      }
    };
    const id = setInterval(poll, CHAT_THREAD_POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        poll();
        markRead();
      }
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [conversationId, loading, markRead]);

  const loadOlder = async () => {
    if (!hasMore || loadingOlder) return;
    const oldest = [...messages].reverse().find((m) => !m.pending);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(conversationId, { before: oldest.createdAt, limit: 40 });
      setMessages((prev) => [...prev, ...[...page.messages].reverse()]);
      setHasMore(page.hasMore);
    } catch {
      /* try again on next scroll */
    } finally {
      setLoadingOlder(false);
    }
  };

  // ─── Sending (optimistic, tap a failed bubble to retry) ───

  const send = useCallback(
    async (msg: ChatMessage, form: FormData) => {
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev.map((m) => (m.id === msg.id ? { ...msg, pending: true, failed: false } : m))
          : [{ ...msg, pending: true }, ...prev],
      );
      try {
        const saved = await chatApi.send(conversationId, form);
        retryForms.current.delete(msg.id);
        setMessages((prev) => [
          { ...saved, localUri: msg.localUri },
          ...prev.filter((m) => m.id !== msg.id && m.id !== saved.id),
        ]);
        if (!lastServerAt.current || saved.createdAt > lastServerAt.current) lastServerAt.current = saved.createdAt;
        setBlocked(null);
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 403) setBlocked(errMessage(e) || t('chat.unavailable'));
        retryForms.current.set(msg.id, form);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, pending: false, failed: true } : m)));
      }
    },
    [conversationId, t],
  );

  const local = (kind: ChatKind, extra: Partial<ChatMessage>): ChatMessage => ({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fromMe: true,
    kind,
    body: null,
    hasAttachment: kind === 'IMAGE',
    attachmentMime: null,
    attachmentSize: null,
    durationSec: null,
    createdAt: new Date().toISOString(),
    ...extra,
  });

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    const form = new FormData();
    form.append('kind', 'TEXT');
    form.append('body', body);
    setText('');
    send(local('TEXT', { body }), form);
  };

  const sendPhoto = async () => {
    const photo = await captureOrPick();
    if (!photo) return;
    const form = new FormData();
    form.append('kind', 'IMAGE');
    form.append('file', { uri: photo.uri, name: photo.fileName || 'photo.jpg', type: photo.type || 'image/jpeg' } as unknown as Blob);
    const caption = text.trim();
    if (caption) form.append('body', caption);
    setText('');
    send(local('IMAGE', { body: caption || null, localUri: photo.uri }), form);
  };

  const sendLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition(20000);
      const accuracyM = pos.accuracy != null && Number.isFinite(pos.accuracy) ? Math.round(pos.accuracy) : null;
      const form = new FormData();
      form.append('kind', 'LOCATION');
      form.append('latitude', String(pos.lat));
      form.append('longitude', String(pos.lng));
      if (accuracyM !== null) form.append('accuracyM', String(accuracyM));
      const caption = text.trim();
      if (caption) form.append('body', caption);
      setText('');
      send(local('LOCATION', { body: caption || null, latitude: pos.lat, longitude: pos.lng, accuracyM }), form);
    } catch (e) {
      appAlert(t('chat.location'), (e as Error)?.message || t('chat.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const recorder = useVoiceRecorder((uri, secs) => {
    const form = new FormData();
    form.append('kind', 'VOICE');
    form.append('durationSec', String(secs));
    form.append('file', { uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
    send(local('VOICE', { durationSec: secs, localUri: uri, hasAttachment: true }), form);
  });
  const recording = recorder.state === 'recording';
  useEffect(() => {
    if (recorder.state === 'denied') {
      appAlert(t('chat.voiceNote'), t('chat.micDenied'));
      recorder.reset();
    }
  }, [recorder, recorder.state, t]);
  // Leaving the thread stops whatever is playing.
  useEffect(() => () => stopVoicePlayback(), []);

  const retry = (m: ChatMessage) => {
    appAlert(t('chat.notSent'), undefined, [
      {
        text: t('chat.retry'),
        onPress: () => {
          const form = retryForms.current.get(m.id);
          if (form) send(m, form);
        },
      },
      {
        text: t('chat.discard'),
        style: 'destructive',
        onPress: () => {
          retryForms.current.delete(m.id);
          setMessages((prev) => prev.filter((x) => x.id !== m.id));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[styles.flex, { backgroundColor: colors.background }, keyboardLift > 0 && { paddingBottom: keyboardLift }]}
    >
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          // Inverted: the next item is the older one. A day chip sits above the first message of each day.
          const older = messages[index + 1];
          const newDay = !older || cairoDay(older.createdAt) !== cairoDay(item.createdAt);
          return (
            <View>
              {newDay ? <DaySeparator iso={item.createdAt} /> : null}
              <ChatBubble
                m={item}
                status={statusFor(item, header)}
                attachmentPath={item.id.startsWith('local-') ? null : chatApi.messageAttachmentPath(item.id)}
                onRetry={() => retry(item)}
                onOpenImage={(uri, headers) => setViewer({ uri, headers })}
              />
            </View>
          );
        }}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.mutedForeground} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyHalo, { backgroundColor: `${colors.brandAccent}18` }]}>
              <Icon name="hand-left-outline" size={34} color={colors.brandAccent} />
            </View>
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('chat.emptyThread')}</Text>
          </View>
        }
      />

      {blocked ? (
        <View style={[styles.blocked, { backgroundColor: colors.destructiveSoft }]}>
          <Icon name="alert-circle" size={16} color={colors.destructive} />
          <Text style={[styles.blockedText, { color: colors.destructive }]}>{blocked}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.composer,
          { backgroundColor: colors.card, borderTopColor: colors.border },
          !keyboardUp && insets.bottom > 0 && { paddingBottom: spacing[2] + insets.bottom },
        ]}
      >
        {recording ? (
          <>
            <Pressable
              onPress={() => recorder.stop(true)}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={t('chat.cancelRecording')}
            >
              <Icon name="trash-outline" size={22} color={colors.destructive} />
            </Pressable>
            <View style={[styles.recordingBox, { backgroundColor: colors.destructiveSoft }]}>
              <View style={[styles.recDot, { backgroundColor: colors.destructive }]} />
              <Text style={[styles.recTime, { color: colors.foreground }]}>
                {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}
              </Text>
              <Text style={[styles.recHint, { color: colors.mutedForeground }]} numberOfLines={1}>
                {t('chat.recording')}
              </Text>
            </View>
            <Pressable
              onPress={() => recorder.stop()}
              style={[styles.sendBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('chat.sendVoice')}
            >
              <Icon name="send" size={18} color={colors.primaryForeground} />
            </Pressable>
          </>
        ) : (
          <>
            <View style={[styles.inputPill, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Pressable
                onPress={sendPhoto}
                style={styles.pillBtn}
                accessibilityRole="button"
                accessibilityLabel={t('chat.attachPhoto')}
                hitSlop={6}
              >
                <Icon name="camera-outline" size={22} color={colors.mutedForeground} />
              </Pressable>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('chat.placeholder')}
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={4000}
                style={[styles.input, { color: colors.foreground }]}
              />
              <Pressable
                onPress={sendLocation}
                disabled={locating}
                style={styles.pillBtn}
                accessibilityRole="button"
                accessibilityLabel={t('chat.shareLocation')}
                hitSlop={6}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name="location-outline" size={22} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {text.trim() ? (
              <Pressable
                onPress={sendText}
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
              >
                <Icon name="send" size={18} color={colors.primaryForeground} />
              </Pressable>
            ) : (
              <Pressable
                onPress={recorder.start}
                style={[styles.sendBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={t('chat.recordVoice')}
              >
                <Icon name="mic" size={20} color={colors.primaryForeground} />
              </Pressable>
            )}
          </>
        )}
      </View>

      <ChatImageViewer image={viewer} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], flexGrow: 1 },
  older: { marginVertical: spacing[3] },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing[10], transform: [{ scaleY: -1 }] },
  emptyHalo: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[3] },
  empty: { textAlign: 'center', fontSize: 14 },
  dayWrap: { alignItems: 'center', marginVertical: spacing[3] },
  dayChip: { paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  dayText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  blocked: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  blockedText: { fontSize: 12, fontWeight: '500', flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  pillBtn: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  recordingBox: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    gap: 8,
  },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  recTime: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  recHint: { flex: 1, fontSize: 12 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
});
