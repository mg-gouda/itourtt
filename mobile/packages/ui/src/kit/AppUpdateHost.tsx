import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  appUpdate,
  checkForUpdate,
  installedVersion,
  t,
  tf,
  useColors,
  type AvailableUpdate,
  type UpdatableApp,
} from '@itour/shared';
import { Icon } from '../Icon';
import { AppModal } from './AppDialog';
import { ActionButton } from './kit';

const CHECK_EVERY_MS = 30 * 60_000;

type Phase = 'offer' | 'downloading' | 'ready' | 'needPermission' | 'failed' | 'wrongFile' | 'notInstalled';

/**
 * Mount once in App.tsx. Checks /api/public/apps/latest on start, whenever the app comes back
 * to the foreground (at most every 30 min) — and offers the newer APK: download with progress,
 * then the Android installer. A required update (minVersionCode) cannot be dismissed.
 *
 * Order matters: the "install unknown apps" permission is asked BEFORE downloading, because
 * Android 11+ kills the app when it is switched on. A finished download is remembered natively,
 * so a restart goes straight to Install instead of starting over (that restart-and-start-over
 * looked to reps like an endless "update again" loop in 1.2.8 → 1.3.0).
 */
export function AppUpdateHost({ app }: { app: UpdatableApp }) {
  const colors = useColors();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>('offer');
  const [progress, setProgress] = useState(0);
  const [dismissedCode, setDismissedCode] = useState<number | null>(null);
  const downloadId = useRef<string | null>(null);
  const lastCheck = useRef(0);
  const installerOpened = useRef(false);

  const check = useCallback(async () => {
    if (!appUpdate.available || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const found = await checkForUpdate(app);
      if (found) {
        const kept = await appUpdate.pendingDownload(found.versionCode);
        if (kept) {
          downloadId.current = kept;
          setPhase('ready');
        }
      }
      setUpdate(found);
    } catch {
      lastCheck.current = 0; // offline: try again on the next foreground
    }
  }, [app]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // Still running after the installer closed → it was cancelled or failed (a real update
      // replaces this process). Say so instead of silently offering the same dialog again.
      if (installerOpened.current) {
        installerOpened.current = false;
        setPhase((p) => (p === 'ready' ? 'notInstalled' : p));
      }
      check();
    });
    return () => sub.remove();
  }, [check]);

  const install = async () => {
    if (!downloadId.current || !update) return;
    if (!(await appUpdate.canInstall())) {
      setPhase('needPermission');
      return;
    }
    if (!(await appUpdate.downloadIsVersion(update.versionCode))) {
      downloadId.current = null;
      setPhase('wrongFile');
      return;
    }
    try {
      installerOpened.current = true;
      await appUpdate.install(downloadId.current);
    } catch {
      installerOpened.current = false;
      setPhase('failed');
    }
  };

  // Back from the "install unknown apps" settings screen (when Android did not close the app):
  // carry on — install a finished download, otherwise start downloading.
  useEffect(() => {
    if (phase !== 'needPermission') return;
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active' || !(await appUpdate.canInstall())) return;
      if (downloadId.current) {
        setPhase('ready');
        install();
      } else {
        start();
      }
    });
    return () => sub.remove();
  });

  const start = async () => {
    if (!update) return;
    // Ask first: switching the permission on can kill the app, which would waste the download.
    if (!(await appUpdate.canInstall())) {
      setPhase('needPermission');
      return;
    }
    setPhase('downloading');
    setProgress(0);
    try {
      const id = await appUpdate.download(update.url, tf('appUpdate.downloadTitle', { version: update.versionName }));
      downloadId.current = id;
      const timer = setInterval(async () => {
        try {
          const st = await appUpdate.status(id);
          if (st.total > 0) setProgress(Math.min(1, st.downloaded / st.total));
          if (st.status === 'done') {
            clearInterval(timer);
            setPhase('ready');
            install();
          } else if (st.status === 'failed') {
            clearInterval(timer);
            setPhase('failed');
          }
        } catch {
          clearInterval(timer);
          setPhase('failed');
        }
      }, 700);
    } catch {
      setPhase('failed');
    }
  };

  if (!update || (!update.required && dismissedCode === update.versionCode)) return null;
  const mine = installedVersion();
  const close = update.required || phase === 'downloading' ? undefined : () => setDismissedCode(update.versionCode);

  return (
    <AppModal visible onClose={close}>
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon name="cloud-download-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {update.required ? t('appUpdate.requiredTitle') : t('appUpdate.title')}
        </Text>
        <Text style={[styles.versions, { color: colors.mutedForeground }]}>
          {mine?.versionName} → {update.versionName}
        </Text>
        {update.notes ? <Text style={[styles.notes, { color: colors.foreground }]}>{update.notes}</Text> : null}

        {phase === 'downloading' ? (
          <View style={styles.progressWrap}>
            <View style={[styles.track, { backgroundColor: colors.muted }]}>
              <View style={[styles.bar, { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={[styles.pct, { color: colors.mutedForeground }]}>
              {t('appUpdate.downloading')} {Math.round(progress * 100)}%
            </Text>
          </View>
        ) : null}

        {phase === 'needPermission' ? (
          <Text style={[styles.hint, { color: colors.foreground }]}>{t('appUpdate.permissionHint')}</Text>
        ) : null}
        {phase === 'failed' ? <Text style={[styles.hint, { color: colors.destructive }]}>{t('appUpdate.failed')}</Text> : null}
        {phase === 'wrongFile' ? <Text style={[styles.hint, { color: colors.destructive }]}>{t('appUpdate.wrongFile')}</Text> : null}
        {phase === 'notInstalled' ? <Text style={[styles.hint, { color: colors.foreground }]}>{t('appUpdate.notInstalled')}</Text> : null}

        <View style={styles.actions}>
          {phase === 'offer' || phase === 'failed' || phase === 'wrongFile' ? (
            <ActionButton label={phase === 'offer' ? t('appUpdate.update') : t('appUpdate.retry')} icon="download-outline" onPress={start} />
          ) : null}
          {phase === 'ready' || phase === 'notInstalled' ? <ActionButton label={t('appUpdate.install')} icon="checkmark-circle-outline" onPress={install} /> : null}
          {phase === 'needPermission' ? (
            <ActionButton label={t('appUpdate.allow')} icon="settings-outline" onPress={() => appUpdate.openInstallSettings()} />
          ) : null}
          {close ? <ActionButton label={t('appUpdate.later')} variant="outline" onPress={close} /> : null}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 8 },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  versions: { fontSize: 13 },
  notes: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  progressWrap: { alignSelf: 'stretch', marginTop: 8, gap: 6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  pct: { fontSize: 12, textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  actions: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
});
