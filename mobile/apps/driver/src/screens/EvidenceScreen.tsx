import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apiErrorMessage,
  getCurrentPosition,
  driverPortalApi,
  t,
  takePhoto,
  tf,
  useColors,
  type CapturedPhoto,
  type GPSPosition,
  appAlert,
  isQueued,
} from '@itour/shared';
import { ActivityIndicator } from 'react-native';
import { Icon } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { ActionButton, GradientHeader, Surface } from '@itour/ui';

type Props = StackScreenProps<RootStackParamList, 'Evidence'>;

/** GET /driver-portal/jobs/:id/odometer */
interface OdometerStatus {
  required: boolean;
  plateNumber: string | null;
  readingKm: number | null;
  source: string | null;
  aiAttempts: number;
  hasPhoto: boolean;
  canType: boolean;
}
export type EvidenceKind = 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW';

/** Photo rules per submission — the same the server and the web portal apply. */
const RULES: Record<EvidenceKind, { min: number; max: number; title: string; hint: string; icon: string; tone: 'primary' | 'success' | 'danger' }> = {
  IN_PROGRESS: { min: 1, max: 10, title: 'driverApp.evidenceStartTitle', hint: 'driverApp.evidenceStartHint', icon: 'play', tone: 'primary' },
  COMPLETED: { min: 1, max: 10, title: 'driverApp.evidenceCompleteTitle', hint: 'driverApp.evidenceCompleteHint', icon: 'flag', tone: 'success' },
  NO_SHOW: { min: 1, max: 10, title: 'repApp.evidenceNoShowTitle', hint: 'repApp.evidenceNoShowHint', icon: 'person-remove', tone: 'danger' },
};

/**
 * Driver evidence capture for START (IN_PROGRESS), COMPLETED and NO SHOW: photos from the
 * camera only (no gallery — evidence must be taken on the spot), a GPS fix taken up front and refreshed on demand, then
 * one multipart upload.  The server stamps the photos, runs the geofence and (on COMPLETED) the collection + 15-min gates.
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
  // Owned car on COMPLETED: odometer photo → the server's AI reads the km (read-only below it).
  const [odo, setOdo] = useState<OdometerStatus | null>(null);
  const [odoBusy, setOdoBusy] = useState(false);
  const [typedKm, setTypedKm] = useState('');

  useEffect(() => {
    if (kind !== 'COMPLETED') return;
    driverPortalApi
      .getOdometer(jobId)
      .then(({ data }) => setOdo(data.data))
      .catch(() => setOdo(null));
  }, [kind, jobId]);

  const captureOdometer = async () => {
    const p = await takePhoto();
    if (!p) return;
    setOdoBusy(true);
    try {
      const form = new FormData();
      form.append('image', { uri: p.uri, name: p.fileName || 'odometer.jpg', type: p.type || 'image/jpeg' } as unknown as Blob);
      const res = await driverPortalApi.captureOdometer(jobId, form);
      // Offline: the photo is read when it reaches the server; type the km now.
      if (isQueued(res)) setOdo((o) => (o ? { ...o, hasPhoto: true, canType: true } : o));
      else setOdo(res.data.data);
    } catch (err) {
      appAlert(t('common.error'), apiErrorMessage(err, t('driverApp.odometerUnreadable')), undefined, { tone: 'danger' });
    } finally {
      setOdoBusy(false);
    }
  };

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

  // Camera only: a gallery pick could be an old or someone else's photo.
  // takePhoto() already shrinks to the evidence size rule (1600 px, JPEG 0.82).
  const add = async () => {
    if (photos.length >= rules.max) return;
    const p = await takePhoto();
    if (p) setPhotos((prev) => (prev.length >= rules.max ? prev : [...prev, p]));
  };

  const missing = Math.max(0, rules.min - photos.length);
  const odoReady = !odo?.required || odo.readingKm != null || (odo.canType && Number(typedKm) > 0);
  const canSubmit = missing === 0 && !!gps && !submitting && odoReady && !odoBusy;

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
      if (odo?.required && odo.readingKm == null && typedKm) form.append('odometerKm', typedKm);
      const res =
        kind === 'IN_PROGRESS'
          ? await driverPortalApi.submitInProgress(jobId, form)
          : kind === 'COMPLETED'
            ? await driverPortalApi.submitCompleted(jobId, form)
            : await driverPortalApi.submitNoShow(jobId, form);
      if (isQueued(res)) {
        navigation.goBack(); // saved on the phone — sent when the signal is back (1.9.0)
        return;
      }
      appAlert(t('repApp.submitted'), `${jobRef} · ${t(`status.${kind}`)}`, [{ text: t('common.ok'), onPress: () => navigation.goBack() }], { tone: 'success' });
    } catch (err) {
      appAlert(t('common.error'), apiErrorMessage(err, t('common.error')), undefined, { tone: 'danger' });
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

        {/* Odometer — owned cars, on completion */}
        {odo?.required ? (
          <Surface style={styles.odoCard}>
            <View style={styles.odoHead}>
              <Icon name="speedometer-outline" size={20} color={colors.primary} />
              <Text style={[styles.photosTitle, { color: colors.foreground }]}>{t('driverApp.odometer')}</Text>
              {odo.plateNumber ? <Text style={[styles.gpsSub, { color: colors.mutedForeground }]}>{odo.plateNumber}</Text> : null}
            </View>
            <ActionButton
              label={odoBusy ? t('driverApp.odometerReadingNow') : odo.hasPhoto ? t('driverApp.odometerRetake') : t('driverApp.odometerPhoto')}
              icon="camera"
              variant="soft"
              loading={odoBusy}
              disabled={odoBusy || submitting}
              onPress={captureOdometer}
            />
            <Text style={[styles.odoLabel, { color: colors.mutedForeground }]}>{t('driverApp.odometerReading')}</Text>
            {odo.readingKm != null ? (
              <View style={[styles.odoValue, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.odoValueText, { color: colors.foreground }]}>{odo.readingKm.toLocaleString('en-US')}</Text>
              </View>
            ) : odo.canType ? (
              <TextInput
                value={typedKm}
                onChangeText={(v) => setTypedKm(v.replace(/[^\d]/g, ''))}
                keyboardType="number-pad"
                placeholder={t('driverApp.odometerType')}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.odoInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              />
            ) : (
              <View style={[styles.odoValue, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.odoValueText, { color: colors.mutedForeground }]}>—</Text>
              </View>
            )}
            {odo.readingKm == null && odo.aiAttempts > 0 && !odo.canType ? (
              <Text style={[styles.gpsSub, { color: colors.destructive }]}>{t('driverApp.odometerUnreadable')}</Text>
            ) : null}
            {!odo.hasPhoto ? <Text style={[styles.gpsSub, { color: colors.mutedForeground }]}>{t('driverApp.odometerRequired')}</Text> : null}
          </Surface>
        ) : null}

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
              onPress={add}
              style={({ pressed }) => [
                styles.addTile,
                { width: tileSize, borderColor: colors.brandAccent, backgroundColor: colors.accent },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon name="camera" size={28} color={colors.brandAccent} />
              <Text style={[styles.addText, { color: colors.brandAccent }]}>{t('repApp.takePhoto')}</Text>
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
  odoCard: { gap: 8 },
  odoHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  odoLabel: { fontSize: 12, marginTop: 4 },
  odoValue: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  odoValueText: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  odoInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
