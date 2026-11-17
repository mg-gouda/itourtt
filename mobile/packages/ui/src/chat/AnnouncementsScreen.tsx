import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, StyleSheet, Text, View } from 'react-native';
import {
  CHAT_THREAD_POLL_MS,
  chatApi,
  getColors,
  refreshChat,
  spacing,
  useT,
  type ChatAnnouncement,
} from '@itour/shared';
import { ChatBubble } from './ChatBubble';
import { ChatImageViewer } from './ChatThreadScreen';

/**
 * Read-only thread of the broadcasts the rep/driver received. Opening it
 * marks them all seen (the sender sees that in the broadcast's receipts).
 */
export function AnnouncementsScreen() {
  const colors = getColors();
  const t = useT();
  // Newest first (inverted list).
  const [items, setItems] = useState<ChatAnnouncement[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [viewer, setViewer] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const itemsRef = useRef<ChatAnnouncement[] | null>(null);

  const markRead = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    chatApi
      .markAnnouncementsRead()
      .then(() => refreshChat())
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (poll: boolean) => {
      try {
        const page = await chatApi.announcements({ limit: 40 }, poll);
        const newestFirst = [...page.announcements].reverse();
        const prev = itemsRef.current;
        let fresh: boolean;
        if (!prev) {
          setHasMore(page.hasMore);
          fresh = newestFirst.some((a) => !a.read);
          itemsRef.current = newestFirst;
        } else {
          const known = new Set(prev.map((a) => a.id));
          const added = newestFirst.filter((a) => !known.has(a.id));
          fresh = added.length > 0;
          if (fresh) itemsRef.current = [...added, ...prev];
        }
        setItems(itemsRef.current);
        if (fresh || !poll) markRead();
      } catch {
        itemsRef.current ??= [];
        setItems(itemsRef.current);
      }
    },
    [markRead],
  );

  useEffect(() => {
    load(false);
    const id = setInterval(() => AppState.currentState === 'active' && load(true), CHAT_THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const loadOlder = async () => {
    const oldest = itemsRef.current?.at(-1);
    if (!hasMore || loadingOlder || !oldest) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.announcements({ before: oldest.createdAt, limit: 40 });
      itemsRef.current = [...(itemsRef.current ?? []), ...[...page.announcements].reverse()];
      setItems(itemsRef.current);
      setHasMore(page.hasMore);
    } catch {
      /* retry on next scroll */
    } finally {
      setLoadingOlder(false);
    }
  };

  if (items === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.mutedForeground} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        inverted
        data={items}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: a }) => (
          <ChatBubble
            m={{ ...a, fromMe: false }}
            status={null}
            attachmentPath={chatApi.broadcastAttachmentPath(a.id)}
            heading={`${a.senderName} · ${t(`chat.audience${a.audience}`)}`}
            onOpenImage={(uri, headers) => setViewer({ uri, headers })}
          />
        )}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.mutedForeground} /> : null}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>{t('chat.noAnnouncements')}</Text>
        }
      />
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{t('chat.announcementsReadOnly')}</Text>
      </View>
      <ChatImageViewer image={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], flexGrow: 1 },
  older: { marginVertical: spacing[3] },
  empty: { textAlign: 'center', fontSize: 13, paddingVertical: spacing[10], transform: [{ scaleY: -1 }] },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  footerText: { fontSize: 11, textAlign: 'center' },
});
