import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apiErrorMessage,
  getCurrentPosition,
  pickPhoto,
  repPortalApi,
  t,
  takePhoto,
  tf,
  useColors,
  type CapturedPhoto,
  type GPSPosition,
} from '@itour/shared';
import { ActivityIndicator } from 'react-native';
import { Icon } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { ActionButton, GradientHeader, Surface } from '../ui/kit';

type Props = StackScreenProps<RootStackParamList, 'Evidence'>;
export type EvidenceKind = 'IN_PLACE' | 'COMPLETED' | 'NO_SHOW';

/** Photo rules per submission — the same the server and the web portal apply. */
const RULES: Record<EvidenceKind, { min: number; max: number; title: string; hint: string; icon: string; tone: 'primary' | 'success' | 'danger' }> = {
  IN_PLACE: { min: 2, max: 2, title: 'repApp.evidenceInPlaceTitle', hint: 'repApp.evidenceInPlaceHint', icon: 'location', tone: 'primary' },
  COMPLETED: { min: 1, max: 10, title: 'repApp.evidenceCompletedTitle', hint: 'repApp.evidenceCompletedHint', icon: 'checkmark-done', tone: 'success' },
  NO_SHOW: { min: 1, max: 10, title: 'repApp.evidenceNoShowTitle', hint: 'repApp.evidenceNoShowHint', icon: 'person-remove', tone: 'danger' },
};

/**
 * Evidence capture for IN PLACE, COMPLETED and NO SHOW: photos from the
 * camera (or gallery), a GPS fix taken up front and refreshed on demand, then
 * one multipart upload. The server stamps the photos and runs the geofence.
 */
export function EvidenceScreen({ route, navigation }: Props) {
  const { jobId, jobRef, kind } = route.params;
  const rules = RULES[kind];
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [gps, setGps] = useState<GPSPosition | null>(null);
  const [gpsState, setGpsState] = useState<'locating' | 'ready' | 'failed'>('locating');
  const [submitting, setSubmitting] = useState(false);

  const locate = useCallback(async () => {
    setGpsState('locating');
    try {
      const pos = await getCurrentPosition(30000);
      setGps(pos);
      setGpsState('ready');
    } catch {
      setGpsState('failed');
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const add = async (source: 'camera' | 'gallery') => {
    if (photos.length >= rules.max) return;
    const p = source === 'camera' ? await takePhoto() : await pickPhoto();
    if (p) setPhotos((prev) => (prev.length >= rules.max ? prev : [...prev, p]));
  };

  const chooseSource = () => {
    Alert.alert(t('repApp.addPhoto'), undefined, [
      { text: t('repApp.camera'), onPress: () => add('camera') },
      { text: t('repApp.gallery'), onPress: () => add('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const missing = Math.max(0, rules.min - photos.length);
  const canSubmit = missing === 0 && !!gps && !submitting;

  const submit = async () => {
    if (!gps) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      photos.forEach((p, i) =>
        form.append('images', { uri: p.uri, name: p.fileName || `photo_${i}.jpg`, type: p.type || 'image/jpeg' } as unknown as Blob),
      );
      form.append('latitude', String(gps.lat));
      form.append('longitude', String(gps.lng));
      if (kind === 'IN_PLACE') await repPortalApi.submitInPlace(jobId, form);
      else if (kind === 'COMPLETED') await repPortalApi.submitCompleted(jobId, form);
      else await repPortalApi.submitNoShow(jobId, form);
      Alert.alert(t('repApp.submitted'), `${jobRef} · ${t(`status.${kind}`)}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert(t('common.error'), apiErrorMessage(err, t('common.error')));
    } finally {
      setSubmitting(false);
    }
  };

  const tileSize = '31%';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <GradientHeader eyebrow={jobRef} title={t(rules.title)} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Surface style={styles.hintCard}>
          <View style={[styles.hintIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name={rules.icon} size={20} color={colors.primary} />
          </View>
          <Text style={[styles.hintText, { color: colors.foreground }]}>{t(rules.hint)}</Text>
        </Surface>

        {/* GPS */}
        <Surface style={styles.gpsCard}>
          <View
            style={[
              styles.gpsIcon,
              {
                backgroundColor:
                  gpsState === 'ready' ? colors.successSoft : gpsState === 'failed' ? colors.destructiveSoft : colors.infoSoft,
              },
            ]}
          >
            {gpsState === 'locating' ? (
              <ActivityIndicator color={colors.info} />
            ) : (
              <Icon
                name={gpsState === 'ready' ? 'locate' : 'warning'}
                size={20}
                color={gpsState === 'ready' ? colors.success : colors.destructive}
              />
            )}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.gpsTitle, { color: colors.foreground }]}>
              {gpsState === 'ready' ? t('repApp.gpsReady') : gpsState === 'failed' ? t('repApp.gpsFailed') : t('repApp.gpsLocating')}
            </Text>
            {gps && gpsState === 'ready' ? (
              <Text style={[styles.gpsSub, { color: colors.mutedForeground }]}>
                {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                {gps.accuracy ? `  ·  ±${Math.round(gps.accuracy)} m` : ''}
              </Text>
            ) : null}
          </View>
          {gpsState !== 'locating' ? (
            <Pressable onPress={locate} hitSlop={8} style={[styles.gpsRetry, { backgroundColor: colors.muted }]}>
              <Icon name="refresh" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
        </Surface>

        {/* Photos */}
        <View style={styles.photosHead}>
          <Text style={[styles.photosTitle, { color: colors.foreground }]}>{t('repApp.photos')}</Text>
          <Text style={[styles.photosCount, { color: missing ? colors.warning : colors.success }]}>
            {photos.length}/{rules.max}
          </Text>
        </View>
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={[styles.thumbWrap, { width: tileSize }]}>
              <Image source={{ uri: p.uri }} style={styles.thumb} />
              <Pressable
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                style={styles.remove}
                hitSlop={8}
                accessibilityLabel="Remove photo"
              >
                <Icon name="close" size={14} color="#fff" />
              </Pressable>
              <View style={styles.thumbIndex}>
                <Text style={styles.thumbIndexText}>{i + 1}</Text>
              </View>
            </View>
          ))}
          {photos.length < rules.max ? (
            <Pressable
              onPress={() => add('camera')}
              onLongPress={chooseSource}
              style={({ pressed }) => [
                styles.addTile,
                { width: tileSize, borderColor: colors.brandAccent, backgroundColor: colors.accent },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon name="camera" size={28} color={colors.brandAccent} />
              <Text style={[styles.addText, { color: colors.brandAccent }]}>{t('repApp.camera')}</Text>
            </Pressable>
          ) : null}
          {photos.length < rules.max ? (
            <Pressable
              onPress={() => add('gallery')}
              style={({ pressed }) => [
                styles.addTile,
                { width: tileSize, borderColor: colors.border, backgroundColor: colors.card },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon name="images-outline" size={26} color={colors.mutedForeground} />
              <Text style={[styles.addText, { color: colors.mutedForeground }]}>{t('repApp.gallery')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <ActionButton
          size="lg"
          label={submitting ? t('repApp.submitting') : t('repApp.submit')}
          icon="cloud-upload"
          tone={rules.tone}
          loading={submitting}
          disabled={!canSubmit}
          hint={missing ? tf('repApp.needPhotos', { n: missing }) : !gps ? t('repApp.gpsLocating') : undefined}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14 },
  hintCard: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  hintIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hintText: { flex: 1, fontSize: 14, lineHeight: 20 },
  gpsCard: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  gpsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gpsTitle: { fontSize: 14, fontWeight: '700' },
  gpsSub: { fontSize: 12, marginTop: 2 },
  gpsRetry: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  photosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  photosTitle: { fontSize: 16, fontWeight: '800' },
  photosCount: { fontSize: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { aspectRatio: 1, borderRadius: 14, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIndex: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIndexText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  addTile: {
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addText: { fontSize: 12, fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
