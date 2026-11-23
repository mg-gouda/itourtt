import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, Vibration, View } from 'react-native';
import {
  acknowledgeAlarm,
  alarmTitle,
  evaluateDueAlarms,
  formatTimeCairo,
  getPendingAlarms,
  onAlarmsChange,
  refreshJobAlerts,
  t,
  useColors,
  watchAlarmActions,
  type AlarmPortal,
  type PendingAlarm,
} from '@itour/shared';
import { Icon } from '../Icon';
import { AppModal } from './AppDialog';
import { ActionButton } from './kit';

const POLL_MS = 30_000;
const TICK_MS = 15_000;

/**
 * Mount once in App.tsx (signed in). Polls the job alarms while the app is on
 * screen and shows each due alarm — 1 h / 30 min start reminders, drop-off
 * arrived / left — as a modal that only closes with "I've seen it", which is
 * saved and activity-logged. Vibrates until acknowledged.
 */
export function JobAlarmHost({ portal, onOpenJob }: { portal: AlarmPortal; onOpenJob?: (jobId: string) => void }) {
  const colors = useColors();
  const [queue, setQueue] = useState<PendingAlarm[]>(getPendingAlarms());
  const [acking, setAcking] = useState(false);

  useEffect(() => onAlarmsChange(() => setQueue(getPendingAlarms())), []);
  // "I've seen it" pressed on the notification while the app is open.
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

  // Buzz until acknowledged.
  useEffect(() => {
    if (!current) return;
    Vibration.vibrate([0, 400, 300, 400, 2500], true);
    return () => Vibration.cancel();
  }, [current]);

  if (!current) return null;
  const { kind, job } = current;
  const isStart = kind === 'START_90' || kind === 'START_60' || kind === 'START_30';
  const left = kind === 'DROPOFF_LEFT';
  const fg = left ? colors.destructive : isStart ? colors.warning : colors.info;
  const bg = left ? colors.destructiveSoft : isStart ? colors.warningSoft : colors.infoSoft;
  const desc = (
    isStart ? t('alarm.startDesc') : t(kind === 'DROPOFF_ARRIVED' ? 'alarm.dropoffArrivedDesc' : 'alarm.dropoffLeftDesc')
  ).replace('{ref}', job.internalRef);

  const rows: [string, string][] = [
    [t('alarm.job'), job.internalRef],
    [t('alarm.startTime'), job.startsAt ? formatTimeCairo(job.startsAt) : '—'],
    ...(job.flightNo ? ([[t('alarm.flight'), job.flightNo]] as [string, string][]) : []),
    [t('alarm.pax'), String(job.paxCount ?? '—')],
    [t('alarm.route'), [job.from, job.to].filter(Boolean).join(' → ') || '—'],
    ...(!isStart && job.target ? ([[t('alarm.dropoff'), job.target.label]] as [string, string][]) : []),
  ];

  const ack = async (open: boolean) => {
    setAcking(true);
    try {
      await acknowledgeAlarm(current);
    } finally {
      setAcking(false);
    }
    if (open) onOpenJob?.(job.jobId);
  };

  return (
    <AppModal visible>
      <View style={[styles.disc, { backgroundColor: bg }]}>
        <Icon name={isStart ? 'alarm' : left ? 'warning' : 'location'} size={30} color={fg} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{alarmTitle(kind)}</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>{desc}</Text>
      <View style={[styles.box, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
            <Text style={[styles.value, { color: colors.foreground }]} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        {!isStart && onOpenJob ? (
          <ActionButton
            label={t('alarm.completeNow')}
            icon="checkmark-done"
            tone={left ? 'danger' : 'success'}
            loading={acking}
            onPress={() => ack(true)}
          />
        ) : null}
        <ActionButton
          label={isStart ? t('alarm.onTheWay') : t('alarm.acknowledge')}
          icon={isStart ? 'car' : 'eye'}
          variant={!isStart && onOpenJob ? 'soft' : 'solid'}
          loading={acking}
          onPress={() => ack(false)}
        />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  box: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  label: { width: 84, fontSize: 12, fontWeight: '600' },
  value: { flex: 1, fontSize: 14, fontWeight: '700' },
  actions: { gap: 10, marginTop: 18 },
});
