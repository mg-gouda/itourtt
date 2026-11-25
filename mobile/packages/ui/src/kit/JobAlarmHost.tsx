import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, Vibration, View } from 'react-native';
import {
  acknowledgeAlarm,
  alarmTitle,
  evaluateDueAlarms,
  formatTimeCairo,
  getPendingAlarms,
  isSeenAlarm,
  isStartAlarm,
  minutesLeftText,
  onAlarmsChange,
  refreshJobAlerts,
  reloadForNewSounds,
  soundUpdateAvailable,
  t,
  unsentAnswerCount,
  watchAlarmActions,
  type AlarmPortal,
  type PendingAlarm,
} from '@itour/shared';
import { Icon } from '../Icon';

const POLL_MS = 30_000;
const TICK_MS = 15_000;

// Alarm colours are fixed (not theme): the screen must read the same in sun and at night.
const AMBER = '#92400E';
const RED = '#991B1B';
const BLUE = '#1E40AF';

/**
 * Mount once in App.tsx (signed in). Polls the job alarms while the app is on screen and shows each
 * due alarm full screen (UI review 2a): amber for the earlier start alarms, red for the last one and
 * for leaving the drop-off; one 68 dp button — "Seen" on the earlier alarms, "On the way" on the last.
 * Answering closes the screen at once; the answer is saved on the phone and sent in the background,
 * retried until the office has it (2b). Vibrates until answered.
 */
export function JobAlarmHost({ portal, onOpenJob }: { portal: AlarmPortal; onOpenJob?: (jobId: string) => void }) {
  const [queue, setQueue] = useState<PendingAlarm[]>(getPendingAlarms());
  const [unsent, setUnsent] = useState(unsentAnswerCount());
  const [newSound, setNewSound] = useState(soundUpdateAvailable());

  useEffect(
    () =>
      onAlarmsChange(() => {
        setQueue(getPendingAlarms());
        setUnsent(unsentAnswerCount());
        setNewSound(soundUpdateAvailable());
      }),
    [],
  );
  // The button pressed on the notification while the app is open.
  useEffect(() => watchAlarmActions(), []);

  useEffect(() => {
    refreshJobAlerts(portal);
    const poll = setInterval(() => AppState.currentState === 'active' && refreshJobAlerts(portal), POLL_MS);
    const tick = setInterval(() => AppState.currentState === 'active' && evaluateDueAlarms(), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshJobAlerts(portal));
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      sub.remove();
    };
  }, [portal]);

  const current = queue[0];

  // Buzz until answered.
  useEffect(() => {
    if (!current) return;
    Vibration.vibrate([0, 400, 300, 400, 2500], true);
    return () => Vibration.cancel();
  }, [current]);

  const unsentNote =
    unsent > 0 && !current ? (
      <View pointerEvents="none" style={styles.unsent}>
        <Text style={styles.unsentText}>{t('alarm.pendingSend')}</Text>
      </View>
    ) : null;

  // Alarm sounds changed in Company › Alerts: one tap restarts the app and fetches them.
  const soundNote = newSound && !current ? (
    <View style={[styles.unsent, styles.soundNote]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.soundTitle}>{t('repApp.soundUpdateTitle')}</Text>
        <Text style={styles.unsentText}>{t('repApp.soundUpdateBody')}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={reloadForNewSounds} style={({ pressed }) => [styles.reloadBtn, { opacity: pressed ? 0.85 : 1 }]}>
        <Text style={styles.reloadText}>{t('repApp.soundUpdateReload')}</Text>
      </Pressable>
    </View>
  ) : null;

  if (!current) return soundNote ?? unsentNote;
  const { kind, job } = current;
  const isStart = isStartAlarm(kind);
  const seen = isStart && isSeenAlarm(kind);
  const left = kind === 'DROPOFF_LEFT';
  const bg = left || (isStart && !seen) ? RED : isStart ? AMBER : BLUE;
  const countdown = isStart ? minutesLeftText(job.startsAt) : null;
  const route = [job.from, job.to].filter(Boolean).join(' → ');
  const meta = [
    job.startsAt ? `${t('alarm.startTime')} ${formatTimeCairo(job.startsAt)}` : null,
    job.flightNo,
    job.paxCount ? `${job.paxCount} ${t('alarm.pax')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const answer = (open: boolean) => {
    acknowledgeAlarm(current);
    if (open) onOpenJob?.(job.jobId);
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />
      <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={styles.screen}>
        <Icon name={isStart ? 'alarm' : left ? 'warning' : 'location'} size={56} color="#FFFFFF" />
        <Text style={styles.title} accessibilityRole="header">
          {isStart ? t('alarm.pickupIn') : alarmTitle(kind)}
        </Text>
        {countdown ? <Text style={styles.countdown}>{countdown}</Text> : null}
        {!isStart ? (
          <Text style={styles.desc}>
            {t(kind === 'DROPOFF_ARRIVED' ? 'alarm.dropoffArrivedDesc' : 'alarm.dropoffLeftDesc').replace('{ref}', job.internalRef)}
          </Text>
        ) : null}
        <Text style={styles.ref}>{job.internalRef}</Text>
        {route ? <Text style={styles.line}>{route}</Text> : null}
        {meta ? <Text style={styles.lineSoft}>{meta}</Text> : null}
        {!isStart && job.target ? <Text style={styles.lineSoft}>{job.target.label}</Text> : null}

        <View style={styles.actions}>
          {!isStart && onOpenJob ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => answer(true)}
              style={({ pressed }) => [styles.big, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.bigText, { color: bg }]}>{t('alarm.completeNow')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => answer(false)}
            style={({ pressed }) => [
              styles.big,
              !isStart && onOpenJob ? styles.bigOutline : null,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.bigText, { color: !isStart && onOpenJob ? '#FFFFFF' : bg }]}>
              {isStart ? (seen ? t('alarm.seen') : t('alarm.onTheWay')) : t('alarm.acknowledge')}
            </Text>
          </Pressable>
          {seen ? <Text style={styles.hint}>{t('alarm.seenHint')}</Text> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 14, textAlign: 'center', opacity: 0.95 },
  countdown: { color: '#FFFFFF', fontSize: 56, fontWeight: '900', lineHeight: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  desc: { color: '#FFFFFF', fontSize: 17, lineHeight: 24, textAlign: 'center', marginTop: 8 },
  ref: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 20, fontFamily: 'monospace' },
  line: { color: '#FFFFFF', fontSize: 18, lineHeight: 26, textAlign: 'center', marginTop: 6 },
  lineSoft: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 4, opacity: 0.92 },
  actions: { alignSelf: 'stretch', gap: 12, marginTop: 32 },
  big: { minHeight: 68, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bigOutline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#FFFFFF' },
  bigText: { fontSize: 21, fontWeight: '900' },
  hint: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, textAlign: 'center', opacity: 0.9 },
  unsent: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unsentText: { color: '#FEF3C7', fontSize: 14, lineHeight: 20 },
  soundNote: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  soundTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  reloadBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' },
  reloadText: { color: '#1C1003', fontSize: 14, fontWeight: '900' },
});
