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
import { Icon } from '../Icon';

const PREVIEW_ICON: Partial<Record<ChatKind, string>> = { IMAGE: 'camera', VOICE: 'mic', LOCATION: 'location' };

function kindPreview(kind: ChatKind, body: string | null, t: (k: string) => string): string {
  if (kind === 'IMAGE') return body || t('chat.photo');
  if (kind === 'VOICE') return t('chat.voiceNote');
  if (kind === 'LOCATION') return body || t('chat.location');
  return body ?? '';
}

const AVATAR_TINTS = ['#278ACC', '#0B2A7A', '#0F766E', '#7C3AED', '#C2620A', '#BE185D', '#15803D', '#4338CA'];

/** Stable tint per name so a person keeps their colour across screens. */
export function avatarTint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function ChatAvatar({
  name,
  online,
  icon,
  size = 48,
}: {
  name: string;
  online?: boolean;
  icon?: string;
  size?: number;
}) {
  const colors = getColors();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const tint = icon ? colors.brand : avatarTint(name);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint }]}>
      {icon ? (
        <Icon name={icon} size={size * 0.46} color="#fff" />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
      )}
      {online ? <View style={[styles.onlineDot, { borderColor: colors.card }]} /> : null}
    </View>
  );
}

function UnreadBadge({ n }: { n: number }) {
  const colors = getColors();
  if (n <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.brandAccent }]}>
      <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

function Preview({
  kind,
  body,
  prefix,
  unread,
  status,
}: {
  kind: ChatKind;
  body: string | null;
  prefix?: string;
  unread: boolean;
  status?: React.ReactNode;
}) {
  const colors = getColors();
  const t = useT();
  const icon = PREVIEW_ICON[kind];
  const color = unread ? colors.foreground : colors.mutedForeground;
  return (
    <View style={styles.previewRow}>
      {status}
      {icon ? <Icon name={icon} size={14} color={color} style={styles.previewIcon} /> : null}
      <Text style={[styles.preview, { color }, unread && styles.previewUnread]} numberOfLines={1}>
        {prefix}
        {kindPreview(kind, body, t)}
      </Text>
    </View>
  );
}

/**
 * The rep/driver chat inbox: search, pinned Announcements card, then every
 * 1:1 thread (newest first) with unread badges and delivery ticks, plus a
 * floating "New chat" button listing the office staff the caller may message.
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
  const [query, setQuery] = useState('');

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!convs || !q) return convs;
    return convs.filter((c) => c.other.name.toLowerCase().includes(q) || c.other.roleName?.toLowerCase().includes(q));
  }, [convs, query]);

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
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Icon name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('chat.search')}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Icon name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {visible === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              colors={[colors.primary]}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={
            ann && !query ? (
              <Pressable
                onPress={onOpenAnnouncements}
                style={({ pressed }) => [
                  styles.annCard,
                  { backgroundColor: colors.card, borderColor: ann.unread ? colors.brandAccent : colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <ChatAvatar name="" icon="megaphone" size={46} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.name, { color: colors.foreground }, styles.bold]} numberOfLines={1}>
                      {t('chat.announcements')}
                    </Text>
                    <Text style={[styles.time, { color: ann.unread ? colors.brandAccent : colors.mutedForeground }]}>
                      {chatTime(ann.last.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Preview
                      kind={ann.last.kind}
                      body={ann.last.body}
                      prefix={`${ann.last.senderName}: `}
                      unread={ann.unread > 0}
                    />
                    <UnreadBadge n={ann.unread} />
                  </View>
                </View>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            ann && !query ? null : (
              <View style={styles.emptyBox}>
                <View style={[styles.emptyHalo, { backgroundColor: `${colors.brandAccent}18` }]}>
                  <Icon name="chatbubbles-outline" size={40} color={colors.brandAccent} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('chat.noChats')}</Text>
                <Pressable
                  onPress={() => setPicking(true)}
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.emptyBtnText, { color: colors.primaryForeground }]}>{t('chat.startFirst')}</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item: c }) => (
            <Pressable
              onPress={() => onOpenThread(c.id, c.other.name)}
              style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && styles.pressed]}
            >
              <ChatAvatar name={c.other.name} online={c.other.online} />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.foreground }, c.unread > 0 && styles.bold]} numberOfLines={1}>
                    {c.other.name}
                  </Text>
                  {c.lastMessage ? (
                    <Text style={[styles.time, { color: c.unread ? colors.brandAccent : colors.mutedForeground }]}>
                      {chatTime(c.lastMessage.createdAt)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rowTop}>
                  {c.lastMessage ? (
                    <Preview
                      kind={c.lastMessage.kind}
                      body={c.lastMessage.body}
                      prefix={c.lastMessage.fromMe ? `${t('chat.you')}: ` : ''}
                      unread={c.unread > 0}
                      status={c.lastMessage.fromMe && c.lastMessage.status ? <StatusTicks status={c.lastMessage.status} /> : null}
                    />
                  ) : (
                    <Text style={[styles.preview, { color: colors.mutedForeground, flex: 1 }]} numberOfLines={1}>
                      {c.other.roleName}
                    </Text>
                  )}
                  <UnreadBadge n={c.unread} />
                </View>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.border }]} />}
        />
      )}

      <Pressable
        onPress={() => setPicking(true)}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('chat.newChat')}
      >
        <Icon name="create-outline" size={22} color={colors.primaryForeground} />
        <Text style={[styles.fabText, { color: colors.primaryForeground }]}>{t('chat.newChat')}</Text>
      </Pressable>
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
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" hitSlop={8}>
          <Icon name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={[styles.searchBox, styles.flex, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Icon name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder={t('chat.search')}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('chat.pickHint')}</Text>
      {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
      {people === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
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
              style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && styles.pressed]}
            >
              <ChatAvatar name={p.name} online={p.online} />
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <View style={styles.roleRow}>
                  <View style={[styles.roleChip, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.roleText, { color: colors.primary }]} numberOfLines={1}>
                      {p.roleName}
                    </Text>
                  </View>
                  {p.online ? <Text style={[styles.onlineText, { color: colors.success }]}>● {t('chat.online')}</Text> : null}
                </View>
              </View>
              {opening === p.userId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Icon name="chevron-forward" size={18} color={colors.mutedForeground} />
              )}
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[2] },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  hint: { fontSize: 12, paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1] },
  listContent: { paddingBottom: 110, flexGrow: 1 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  pressed: { opacity: 0.75 },
  annCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    padding: spacing[3],
    borderRadius: 16,
    borderWidth: 1,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  previewRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  previewIcon: { marginRight: 4 },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, fontWeight: '500' },
  preview: { flexShrink: 1, fontSize: 14 },
  previewUnread: { fontWeight: '600' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 2 },
  roleChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, maxWidth: 180 },
  roleText: { fontSize: 11, fontWeight: '600' },
  onlineText: { fontSize: 11, fontWeight: '600' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    backgroundColor: '#22C55E',
  },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingHorizontal: spacing[8], paddingVertical: spacing[12] },
  emptyHalo: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  emptyBtn: { marginTop: spacing[4], paddingHorizontal: spacing[5], paddingVertical: spacing[2.5], borderRadius: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    height: 52,
    borderRadius: 26,
    shadowColor: '#0B1530',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  fabPressed: { transform: [{ scale: 0.97 }] },
  fabText: { fontSize: 15, fontWeight: '700' },
});
