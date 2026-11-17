import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CHAT_POLL_MS,
  chatApi,
  getColors,
  onChatRefresh,
  spacing,
  useT,
  type ChatAnnouncementsSummary,
  type ChatConversationSummary,
  type ChatKind,
  type ChatPerson,
} from '@itour/shared';
import { StatusTicks, chatTime } from './ChatBubble';

function kindPreview(kind: ChatKind, body: string | null, t: (k: string) => string): string {
  if (kind === 'IMAGE') return `📷 ${body || t('chat.photo')}`;
  if (kind === 'VOICE') return `🎤 ${t('chat.voiceNote')}`;
  if (kind === 'LOCATION') return `📍 ${body || t('chat.location')}`;
  return body ?? '';
}

function Avatar({ name, online, icon }: { name: string; online?: boolean; icon?: string }) {
  const colors = getColors();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
      <Text style={[styles.avatarText, { color: colors.foreground }]}>{icon ?? (initials || '?')}</Text>
      {online ? <View style={[styles.onlineDot, { borderColor: colors.card }]} /> : null}
    </View>
  );
}

function UnreadBadge({ n }: { n: number }) {
  const colors = getColors();
  if (n <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.destructive }]}>
      <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

/**
 * The rep/driver chat inbox: pinned Announcements row, then every 1:1
 * thread (newest first) with unread badges and delivery ticks, plus a
 * "New chat" picker listing the office staff the caller may message.
 */
export function ChatInboxScreen({
  onOpenThread,
  onOpenAnnouncements,
}: {
  onOpenThread: (conversationId: string, title: string) => void;
  onOpenAnnouncements: () => void;
}) {
  const colors = getColors();
  const t = useT();
  const [convs, setConvs] = useState<ChatConversationSummary[] | null>(null);
  const [ann, setAnn] = useState<ChatAnnouncementsSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const [c, a] = await Promise.allSettled([chatApi.conversations(), chatApi.announcementsSummary()]);
    if (c.status === 'fulfilled') setConvs(c.value);
    else setConvs((prev) => prev ?? []);
    if (a.status === 'fulfilled') setAnn(a.value ?? null);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => AppState.currentState === 'active' && load(), CHAT_POLL_MS);
    const off = onChatRefresh(load);
    return () => {
      clearInterval(id);
      off();
    };
  }, [load]);

  if (picking) {
    return (
      <ContactPicker
        onBack={() => setPicking(false)}
        onPick={async (p) => {
          const { id } = await chatApi.open(p.userId);
          setPicking(false);
          onOpenThread(id, p.name);
        }}
      />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          onPress={() => setPicking(true)}
          style={[styles.newBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.newBtnText, { color: colors.primaryForeground }]}>＋ {t('chat.newChat')}</Text>
        </Pressable>
      </View>
      {convs === null ? (
        <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          ListHeaderComponent={
            ann ? (
              <Pressable
                onPress={onOpenAnnouncements}
                style={[styles.row, { backgroundColor: colors.muted, borderBottomColor: colors.border }, styles.annRow]}
              >
                <Avatar name="" icon="📢" />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, { color: colors.foreground }, ann.unread > 0 && styles.bold]} numberOfLines={1}>
                      {t('chat.announcements')}
                    </Text>
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>{chatTime(ann.last.createdAt)}</Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.preview, { color: ann.unread ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                      {ann.last.senderName}: {kindPreview(ann.last.kind, ann.last.body, t)}
                    </Text>
                    <UnreadBadge n={ann.unread} />
                  </View>
                </View>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            ann ? null : (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t('chat.noChats')}</Text>
                <Pressable onPress={() => setPicking(true)}>
                  <Text style={[styles.link, { color: colors.foreground }]}>{t('chat.startFirst')}</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item: c }) => (
            <Pressable
              onPress={() => onOpenThread(c.id, c.other.name)}
              style={[styles.row, { backgroundColor: colors.card }]}
            >
              <Avatar name={c.other.name} online={c.other.online} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.foreground }, c.unread > 0 && styles.bold]} numberOfLines={1}>
                    {c.other.name}
                  </Text>
                  {c.lastMessage ? (
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>{chatTime(c.lastMessage.createdAt)}</Text>
                  ) : null}
                </View>
                <View style={styles.rowTop}>
                  <View style={styles.previewRow}>
                    {c.lastMessage?.fromMe && c.lastMessage.status ? <StatusTicks status={c.lastMessage.status} /> : null}
                    <Text
                      style={[styles.preview, { color: c.unread ? colors.foreground : colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {c.lastMessage
                        ? `${c.lastMessage.fromMe ? `${t('chat.you')}: ` : ''}${kindPreview(c.lastMessage.kind, c.lastMessage.body, t)}`
                        : c.other.roleName}
                    </Text>
                  </View>
                  <UnreadBadge n={c.unread} />
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ContactPicker({ onBack, onPick }: { onBack: () => void; onPick: (p: ChatPerson) => Promise<void> }) {
  const colors = getColors();
  const t = useT();
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => {
      chatApi
        .contacts(search.trim())
        .then((list) => alive && setPeople(list))
        .catch(() => alive && setPeople([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [search]);

  const sorted = useMemo(() => people ?? [], [people]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Text style={[styles.backText, { color: colors.foreground }]}>‹</Text>
        </Pressable>
        <TextInput
          autoFocus
          value={search}
          onChangeText={setSearch}
          placeholder={t('chat.search')}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.search, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]}
        />
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('chat.pickHint')}</Text>
      {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
      {people === null ? (
        <ActivityIndicator style={styles.loading} color={colors.mutedForeground} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(p) => p.userId}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
          ListEmptyComponent={<Text style={[styles.emptyText, styles.emptyBox, { color: colors.mutedForeground }]}>{t('chat.noContacts')}</Text>}
          renderItem={({ item: p }) => (
            <Pressable
              disabled={!!opening}
              onPress={async () => {
                setOpening(p.userId);
                setError(null);
                try {
                  await onPick(p);
                } catch (e) {
                  setError(
                    (e as { response?: { data?: { message?: string } } })?.response?.data?.message || t('chat.openFailed'),
                  );
                } finally {
                  setOpening(null);
                }
              }}
              style={[styles.row, { backgroundColor: colors.card }]}
            >
              <Avatar name={p.name} online={p.online} />
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {p.roleName}
                  {p.online ? ` · ${t('chat.online')}` : ''}
                </Text>
              </View>
              {opening === p.userId ? <ActivityIndicator color={colors.mutedForeground} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing[8] },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newBtn: { marginLeft: 'auto', paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: 8 },
  newBtnText: { fontSize: 14, fontWeight: '600' },
  backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, lineHeight: 32 },
  search: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing[3], fontSize: 15 },
  hint: { fontSize: 12, paddingHorizontal: spacing[3], paddingTop: spacing[2], paddingBottom: spacing[1] },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[2.5] },
  annRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flex: 1, fontSize: 15, fontWeight: '500' },
  bold: { fontWeight: '700' },
  time: { fontSize: 11 },
  preview: { flexShrink: 1, fontSize: 13, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '600' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: '#22C55E',
  },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyBox: { alignItems: 'center', padding: spacing[8] },
  emptyText: { fontSize: 14, textAlign: 'center' },
  link: { marginTop: spacing[2], fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
