import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  api,
  apiErrorMessage,
  appAlert,
  formatCurrency,
  formatDayLabel,
  pickPhoto,
  secureStorage,
  t,
  takePhoto,
  tf,
  unwrapList,
  useColors,
  type CapturedPhoto,
  type Currency,
  type PortalComplaint,
} from '@itour/shared';
import { EmptyState } from '../EmptyState';
import { Icon } from '../Icon';
import { SkeletonList } from '../SkeletonList';
import { GradientHeader, HeaderStat, Pill, ServicePill, Surface } from '../kit';
import { ChatImageViewer } from '../chat/ChatThreadScreen';
import { chatTime } from '../chat/ChatBubble';

/**
 * Rep / driver app › Complaints. Every complaint that names this person (as soon as it does), the
 * story without the claim amounts, and their own answer thread with the office: text + evidence
 * photos (camera or gallery, e.g. WhatsApp screenshots). A closed complaint's thread is read-only.
 * Backend: complaints/complaint-thread.service.ts.
 */
type Portal = 'rep' | 'driver';

interface ThreadAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
}
interface ThreadMessage {
  id: string;
  authorType: 'REP' | 'DRIVER' | 'STAFF';
  authorName: string | null;
  message: string;
  createdAt: string;
  attachments: ThreadAttachment[];
}
interface ComplaintDetail {
  id: string;
  complaintNo: string;
  subject: string;
  description: string;
  status: string;
  open: boolean;
  categoryEn: string;
  categoryAr: string;
  job: { internalRef: string; jobDate: string; serviceType: string; route: string | null; from: string | null; to: string | null; guest: string | null; pax: number };
  messages: ThreadMessage[];
}

const MAX_FILES = 10;

function useToken() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    secureStorage.getAccessToken().then(setToken);
  }, []);
  return token;
}

export function PortalComplaintsScreen({ portal }: { portal: Portal }) {
  const colors = useColors();
  const base = `/${portal}-portal/complaints`;
  const [items, setItems] = useState<PortalComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await api.get(base);
      setItems(unwrapList<PortalComplaint>(data));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('common.error')));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const totals = useMemo(() => {
    const open = items.filter((c) => c.open).length;
    const waiting = items.filter((c) => c.awaitingYou).length;
    const points = items.reduce((s, c) => s + (c.scorePenalty || 0), 0);
    return { open, waiting, points };
  }, [items]);

  const tone = (c: PortalComplaint) =>
    c.open
      ? { label: t(`repApp.cStatus_${c.status}`), fg: colors.warning, bg: colors.warningSoft, icon: 'chatbubble-ellipses' }
      : c.status === 'WON' || c.status === 'CANCELLED'
        ? { label: c.status === 'WON' ? t('repApp.inYourFavour') : t('repApp.cStatus_CANCELLED'), fg: colors.success, bg: colors.successSoft, icon: 'shield-checkmark' }
        : c.status === 'PARTIALLY_LOST'
          ? { label: t('repApp.partial'), fg: colors.warning, bg: colors.warningSoft, icon: 'alert-circle' }
          : { label: t('repApp.upheld'), fg: colors.destructive, bg: colors.destructiveSoft, icon: 'warning' };

  if (openId) {
    return (
      <ComplaintDetailView
        base={base}
        id={openId}
        me={portal === 'rep' ? 'REP' : 'DRIVER'}
        onBack={() => {
          setOpenId(null);
          fetchAll();
        }}
      />
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[colors.primary]}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchAll();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <>
            <GradientHeader title={t('repApp.complaintsTitle')} subtitle={t('repApp.complaintsIntro')}>
              <View style={styles.stats}>
                <HeaderStat value={items.length} label={t('repApp.total')} />
                <HeaderStat value={totals.waiting} label={t('repApp.answerNeeded')} accent="#FBBF5B" />
                <HeaderStat value={totals.points ? `−${totals.points}` : '0'} label="Score" accent="#FCA5A5" />
              </View>
            </GradientHeader>
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            {loading ? (
              <View style={{ marginTop: 16 }}>
                <SkeletonList count={3} />
              </View>
            ) : null}
            {!loading && items.length ? <View style={{ height: 16 }} /> : null}
          </>
        }
        renderItem={({ item }) => {
          const s = tone(item);
          return (
            <Pressable onPress={() => setOpenId(item.id)}>
              <Surface padded={false} style={[styles.card, item.awaitingYou ? { borderColor: colors.warning, borderWidth: 1.5 } : null]}>
                <View style={[styles.strip, { backgroundColor: s.fg }]} />
                <View style={styles.body}>
                  <View style={styles.top}>
                    <View style={[styles.icon, { backgroundColor: s.bg }]}>
                      <Icon name={s.icon} size={18} color={s.fg} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.subject, { color: colors.foreground }]} numberOfLines={2}>
                        {item.subject}
                      </Text>
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {item.complaintNo} · {item.categoryEn}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.mutedForeground} />
                  </View>
                  <View style={styles.pills}>
                    <Pill label={s.label} color={s.fg} bg={s.bg} />
                    {item.awaitingYou ? <Pill label={t('repApp.answerNeeded')} color="#FFFFFF" bg={colors.warning} /> : null}
                    {item.messageCount ? <Pill label={`💬 ${item.messageCount}`} color={colors.mutedForeground} bg={colors.muted} /> : null}
                    {item.serviceType ? <ServicePill serviceType={item.serviceType} /> : null}
                  </View>
                  <View style={[styles.jobRow, { backgroundColor: colors.muted }]}>
                    <Icon name="briefcase-outline" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.jobText, { color: colors.foreground }]}>{item.jobRef}</Text>
                    <Text style={[styles.jobDate, { color: colors.mutedForeground }]}>{formatDayLabel(item.jobDate)}</Text>
                  </View>
                  {!item.open && (item.scorePenalty > 0 || item.chargedAmount) ? (
                    <View style={[styles.impact, { borderTopColor: colors.border }]}>
                      {item.scorePenalty > 0 ? (
                        <View style={styles.impactItem}>
                          <Icon name="trending-down" size={15} color={colors.warning} />
                          <Text style={[styles.impactText, { color: colors.warning }]}>{tf('repApp.scorePoints', { n: item.scorePenalty })}</Text>
                        </View>
                      ) : null}
                      {item.chargedAmount ? (
                        <View style={styles.impactItem}>
                          <Icon name="cash-outline" size={15} color={colors.destructive} />
                          <Text style={[styles.impactText, { color: colors.destructive }]}>
                            {tf('repApp.deducted', {
                              amount: formatCurrency(Number(item.chargedAmount), (item.chargedCurrency || 'EGP') as Currency),
                            })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Surface>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyState
              icon="ribbon-outline"
              tint={colors.success}
              title={t('repApp.noComplaintsTitle')}
              message={t('repApp.noComplaintsBody')}
            />
          )
        }
      />
    </View>
  );
}

function ComplaintDetailView({ base, id, me, onBack }: { base: string; id: string; me: 'REP' | 'DRIVER'; onBack: () => void }) {
  const colors = useColors();
  const token = useToken();
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [viewer, setViewer] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`${base}/${id}`);
      setDetail(data.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('common.error')));
    }
  }, [base, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const addPhoto = (from: 'camera' | 'gallery') => async () => {
    if (photos.length >= MAX_FILES) {
      appAlert(t('repApp.complaintsTitle'), t('repApp.tooManyFiles'));
      return;
    }
    const p = from === 'camera' ? await takePhoto() : await pickPhoto();
    if (p) setPhotos((prev) => [...prev, p].slice(0, MAX_FILES));
  };

  const send = async () => {
    if (!text.trim() && !photos.length) {
      appAlert(t('repApp.complaintsTitle'), t('repApp.needAnswer'));
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append('message', text.trim());
      for (const p of photos) {
        form.append('files', { uri: p.uri, name: p.fileName, type: p.type } as unknown as Blob);
      }
      await api.post(`${base}/${id}/messages`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setText('');
      setPhotos([]);
      await load();
    } catch (err) {
      appAlert(t('common.error'), apiErrorMessage(err, t('common.error')));
    } finally {
      setSending(false);
    }
  };

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const fileUri = (attId: string) => `${api.defaults.baseURL}${base}/${id}/attachments/${attId}`;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.detailBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.detailTitle, { color: colors.foreground }]} numberOfLines={1}>
          {detail?.complaintNo ?? t('repApp.complaintsTitle')}
        </Text>
      </View>
      {!detail ? (
        <View style={styles.center}>
          {error ? <Text style={{ color: colors.destructive }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
          <Surface style={styles.block}>
            <Text style={[styles.subject, { color: colors.foreground }]}>{detail.subject}</Text>
            <View style={styles.pills}>
              <Pill
                label={t(`repApp.cStatus_${detail.status}`)}
                color={detail.open ? colors.warning : colors.mutedForeground}
                bg={detail.open ? colors.warningSoft : colors.muted}
              />
              {detail.job.serviceType ? <ServicePill serviceType={detail.job.serviceType} /> : null}
            </View>
            <Line label={t('repApp.cJob')} value={`${detail.job.internalRef} · ${formatDayLabel(detail.job.jobDate)}`} />
            {detail.job.route || detail.job.from ? (
              <Line label={t('repApp.cRoute')} value={detail.job.route ?? `${detail.job.from ?? '—'} → ${detail.job.to ?? '—'}`} />
            ) : null}
            {detail.job.guest ? <Line label={t('repApp.cGuest')} value={`${detail.job.guest} · ${detail.job.pax}`} /> : null}
            <Line label={t('repApp.cCategory')} value={detail.categoryEn} />
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('repApp.cWhatHappened')}</Text>
            <Text style={[styles.description, { color: colors.foreground }]}>{detail.description}</Text>
          </Surface>

          <Text style={[styles.sectionLabel, styles.threadLabel, { color: colors.mutedForeground }]}>{t('repApp.cYourAnswer')}</Text>
          {detail.messages.length === 0 ? (
            <Text style={[styles.emptyThread, { color: colors.mutedForeground }]}>{t('repApp.cNoAnswersYet')}</Text>
          ) : (
            detail.messages.map((m) => {
              const mine = m.authorType === me;
              return (
                <View key={m.id} style={[styles.msgRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View
                    style={[
                      styles.bubble,
                      mine ? { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' } : { backgroundColor: colors.muted, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.msgMeta, { color: colors.mutedForeground }]}>
                      {m.authorType === 'STAFF' ? `${t('repApp.cOffice')}${m.authorName ? ` · ${m.authorName}` : ''}` : m.authorName}
                      {' · '}
                      {chatTime(m.createdAt)}
                    </Text>
                    {m.message ? <Text style={[styles.msgText, { color: colors.foreground }]}>{m.message}</Text> : null}
                    {m.attachments.length ? (
                      <View style={styles.thumbs}>
                        {m.attachments.map((a) =>
                          (a.mimeType ?? '').startsWith('image/') && headers ? (
                            <Pressable key={a.id} onPress={() => setViewer({ uri: fileUri(a.id), headers })}>
                              <Image source={{ uri: fileUri(a.id), headers }} style={styles.thumb} resizeMode="cover" />
                            </Pressable>
                          ) : (
                            <View key={a.id} style={[styles.fileChip, { borderColor: colors.border }]}>
                              <Icon name="document-outline" size={14} color={colors.mutedForeground} />
                              <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
                                {a.fileName}
                              </Text>
                            </View>
                          ),
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          {detail.open ? (
            <Surface style={styles.block}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('repApp.cPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                multiline
                editable={!sending}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              />
              {photos.length ? (
                <View style={styles.thumbs}>
                  {photos.map((p, i) => (
                    <View key={`${p.uri}-${i}`}>
                      <Image source={{ uri: p.uri }} style={styles.thumb} />
                      <Pressable
                        style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
                        onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                        hitSlop={8}
                      >
                        <Icon name="close" size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.composerRow}>
                <Pressable style={[styles.toolBtn, { borderColor: colors.border }]} onPress={addPhoto('camera')} disabled={sending}>
                  <Icon name="camera-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.toolText, { color: colors.foreground }]}>{t('repApp.cCamera')}</Text>
                </Pressable>
                <Pressable style={[styles.toolBtn, { borderColor: colors.border }]} onPress={addPhoto('gallery')} disabled={sending}>
                  <Icon name="images-outline" size={18} color={colors.foreground} />
                  <Text style={[styles.toolText, { color: colors.foreground }]}>{t('repApp.cGallery')}</Text>
                </Pressable>
                <Pressable style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }]} onPress={send} disabled={sending}>
                  {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Icon name="send" size={16} color="#FFFFFF" />}
                  <Text style={styles.sendText}>{t('repApp.cSend')}</Text>
                </Pressable>
              </View>
            </Surface>
          ) : (
            <Text style={[styles.emptyThread, { color: colors.mutedForeground }]}>{t('repApp.cClosed')}</Text>
          )}
        </ScrollView>
      )}
      <ChatImageViewer image={viewer} onClose={() => setViewer(null)} />
    </KeyboardAvoidingView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 24, flexGrow: 1 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  error: { marginHorizontal: 20, marginTop: 16, fontSize: 13 },
  card: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', overflow: 'hidden' },
  strip: { width: 4 },
  body: { flex: 1, padding: 14 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  subject: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  pills: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  jobText: { fontSize: 13, fontWeight: '700' },
  jobDate: { fontSize: 12, marginLeft: 'auto' },
  impact: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  impactItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  impactText: { fontSize: 13, fontWeight: '700' },
  detailBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 2 },
  detailTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  detailContent: { padding: 16, paddingBottom: 40, gap: 12 },
  block: { gap: 8 },
  line: { flexDirection: 'row', gap: 10, marginTop: 4 },
  lineLabel: { width: 90, fontSize: 13 },
  lineValue: { flex: 1, fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  threadLabel: { marginHorizontal: 4 },
  description: { fontSize: 14, lineHeight: 20 },
  emptyThread: { fontSize: 13, marginHorizontal: 4 },
  msgRow: { flexDirection: 'row' },
  bubble: { maxWidth: '88%', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  msgMeta: { fontSize: 11, marginBottom: 2 },
  msgText: { fontSize: 14, lineHeight: 20 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, maxWidth: 180 },
  fileName: { fontSize: 12, flexShrink: 1 },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 80, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, textAlignVertical: 'top' },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  toolText: { fontSize: 13, fontWeight: '600' },
  sendBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  sendText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
