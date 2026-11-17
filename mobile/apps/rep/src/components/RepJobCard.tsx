import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t, useColors, type RepPortalJob } from '@itour/shared';
import { Icon } from '@itour/ui';
import { ActionButton, ServicePill, StatusPill, Surface, serviceTone, statusTone } from '@itour/ui';
import {
  canComplete,
  canOfferInPlace,
  destinationLabel,
  inPlaceWindow,
  isTerminal,
  jobTimeLabel,
  originLabel,
} from '../lib/job-rules';

/**
 * One job on the day list: big time, service + status, a two-stop route,
 * key facts as chips, and the single next step as a full-width button.
 * Everything else (no show, delay, survey, cancel) lives on the detail screen.
 */
export function RepJobCard({
  job,
  onOpen,
  onInPlace,
  onComplete,
}: {
  job: RepPortalJob;
  onOpen: () => void;
  onInPlace: () => void;
  onComplete: () => void;
}) {
  const colors = useColors();
  const tone = serviceTone(job.serviceType, colors);
  const status = statusTone(job.repStatus, colors);
  const closed = isTerminal(job);
  const window = inPlaceWindow(job);
  const isArr = job.serviceType === 'ARR';

  return (
    <Surface onPress={onOpen} padded={false} style={[styles.card, closed && { opacity: 0.72 }]}>
      <View style={[styles.accent, { backgroundColor: status.fg }]} />
      <View style={styles.body}>
        {/* Time + badges */}
        <View style={styles.top}>
          <View style={[styles.timeBox, { backgroundColor: tone.bg }]}>
            <Icon name={tone.icon} size={16} color={tone.fg} />
            <Text style={[styles.time, { color: tone.fg }]}>{jobTimeLabel(job)}</Text>
            <Text style={[styles.timeLabel, { color: tone.fg }]}>
              {isArr ? t('repApp.driverArrives') : t('repApp.pickup')}
            </Text>
          </View>
          <View style={styles.topRight}>
            <View style={styles.pills}>
              <ServicePill serviceType={job.serviceType} />
              <StatusPill status={job.repStatus} />
            </View>
            <Text style={[styles.ref, { color: colors.foreground }]} numberOfLines={1}>
              {job.internalRef}
              {job.agentRef ? <Text style={{ color: colors.mutedForeground, fontWeight: '500' }}>  ·  {job.agentRef}</Text> : null}
            </Text>
          </View>
        </View>

        {/* Route */}
        <View style={styles.route}>
          <View style={styles.rail}>
            <View style={[styles.dotHollow, { borderColor: colors.brandAccent }]} />
            <View style={[styles.railLine, { backgroundColor: colors.border }]} />
            <View style={[styles.dotSolid, { backgroundColor: colors.primary }]} />
          </View>
          <View style={styles.stops}>
            <Text style={[styles.stop, { color: colors.foreground }]} numberOfLines={1}>
              {originLabel(job)}
            </Text>
            <Text style={[styles.stop, { color: colors.foreground }]} numberOfLines={1}>
              {destinationLabel(job)}
            </Text>
          </View>
        </View>

        {/* Facts */}
        <View style={styles.chips}>
          <Chip icon="people" text={`${job.paxCount} ${t('repApp.pax')}`} />
          {job.flight?.flightNo ? (
            <Chip icon="airplane" text={`${job.flight.carrier ?? ''} ${job.flight.flightNo}`.trim()} />
          ) : null}
          {job.assignment?.vehicle?.plateNumber ? <Chip icon="car" text={job.assignment.vehicle.plateNumber} /> : null}
          {job.clientName ? <Chip icon="person" text={job.clientName} /> : null}
        </View>

        {/* Next step */}
        {closed ? (
          <View style={[styles.closed, { backgroundColor: status.bg }]}>
            <Icon name={status.icon} size={16} color={status.fg} />
            <Text style={[styles.closedText, { color: status.fg }]}>
              {t(`status.${job.repStatus}`)} · {t('repApp.jobDone')}
            </Text>
          </View>
        ) : canComplete(job) ? (
          <ActionButton label={t('repApp.complete')} icon="checkmark-done" tone="success" onPress={onComplete} style={styles.cta} />
        ) : canOfferInPlace(job) ? (
          <ActionButton
            label={t('repApp.inPlace')}
            icon="location"
            tone="primary"
            onPress={onInPlace}
            disabled={!window.open}
            hint={window.hint || undefined}
            style={styles.cta}
          />
        ) : (
          <ActionButton
            label={t('repApp.details')}
            icon="open-outline"
            tone="primary"
            variant="soft"
            onPress={onOpen}
            style={styles.cta}
          />
        )}
      </View>
    </Surface>
  );
}

function Chip({ icon, text }: { icon: string; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.chip, { backgroundColor: colors.muted }]}>
      <Icon name={icon} size={13} color={colors.mutedForeground} />
      <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, overflow: 'hidden', flexDirection: 'row' },
  accent: { width: 4 },
  body: { flex: 1, padding: 14 },
  top: { flexDirection: 'row', gap: 12 },
  timeBox: { width: 78, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  time: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  timeLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 },
  topRight: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ref: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  route: { flexDirection: 'row', marginTop: 14, gap: 12 },
  rail: { width: 14, alignItems: 'center', paddingVertical: 4 },
  dotHollow: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  railLine: { width: 2, flex: 1, marginVertical: 3, borderRadius: 1 },
  dotSolid: { width: 12, height: 12, borderRadius: 3 },
  stops: { flex: 1, gap: 12 },
  stop: { fontSize: 14.5, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: '100%',
  },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  cta: { marginTop: 14 },
  closed: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  closedText: { fontSize: 13, fontWeight: '700' },
});
