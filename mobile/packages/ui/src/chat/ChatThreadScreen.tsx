import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
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
  getColors,
  getCurrentPosition,
  refreshChat,
  spacing,
  useT,
  type ChatKind,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatThreadHeader,
} from '@itour/shared';
import { ChatBubble } from './ChatBubble';

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
      .then(() => refreshChat())
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
      Alert.alert(t('chat.location'), (e as Error)?.message || t('chat.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const retry = (m: ChatMessage) => {
    Alert.alert(t('chat.notSent'), undefined, [
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
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }

  return (
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
        renderItem={({ item }) => (
          <ChatBubble
            m={item}
            status={statusFor(item, header)}
            attachmentPath={item.id.startsWith('local-') ? null : chatApi.messageAttachmentPath(item.id)}
            onRetry={() => retry(item)}
            onOpenImage={(uri, headers) => setViewer({ uri, headers })}
          />
        )}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.mutedForeground} /> : null}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('chat.emptyThread')}</Text>
        }
      />

      {blocked ? (
        <View style={[styles.blocked, { backgroundColor: colors.destructive }]}>
          <Text style={styles.blockedText}>{blocked}</Text>
        </View>
      ) : null}

      <View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Pressable
          onPress={sendPhoto}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('chat.attachPhoto')}
        >
          <Text style={styles.icon}>📷</Text>
        </Pressable>
        <Pressable
          onPress={sendLocation}
          disabled={locating}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('chat.shareLocation')}
        >
          {locating ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : <Text style={styles.icon}>📍</Text>}
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={4000}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.input }]}
        />
        <Pressable
          onPress={sendText}
          disabled={!text.trim()}
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
        >
          <Text style={[styles.sendText, { color: colors.primaryForeground }]}>➤</Text>
        </Pressable>
      </View>

      <ChatImageViewer image={viewer} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], flexGrow: 1 },
  older: { marginVertical: spacing[3] },
  empty: { textAlign: 'center', fontSize: 13, paddingVertical: spacing[10], transform: [{ scaleY: -1 }] },
  blocked: { paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  blockedText: { color: '#fff', fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  iconBtn: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 21,
    paddingHorizontal: spacing[3],
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
});
