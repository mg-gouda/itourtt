import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t, useColors, type DriverPortalJob } from '@itour/shared';
import { ActionButton, Icon, ServicePill, ChannelPill, StatusPill, Surface, serviceTone, statusTone } from '@itour/ui';
import { CollectionCard } from './CollectionCard';
import {
  collectionAmount,
  completeGate,
  startGate,
  destinationLabel,
  isTerminal,
  jobTimeLabel,
  driverTimeLabel,
  originLabel,
} from '../lib/job-rules';

/**
 * Driver variant of the rep app's job card (same design). One job on the day list: big time, service + status, a two-stop route,
 * key facts as chips, and the single next step as a full-width button.
 * Collection, no show and cancel live on the detail screen; the card shows what's owed.
 */
export function DriverJobCard({
  job,
  onOpen,
  onStart,
  onComplete,
}: {
  job: DriverPortalJob;
  onOpen: () => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  const colors = useColors();
  const tone = serviceTone(job.serviceType, colors);
  const status = statusTone(job.driverStatus, colors);
  const closed = isTerminal(job);
  const start = startGate(job);
  const complete = completeGate(job);
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
            {driverTimeLabel(job) ? (
              <Text style={[styles.driverTime, { color: tone.fg }]}>
                {t('repApp.driverShort')} {driverTimeLabel(job)}
              </Text>
            ) : null}
          </View>
          <View style={styles.topRight}>
            <View style={styles.pills}>
              <ServicePill serviceType={job.serviceType} />
<ChannelPill channel={job.bookingChannel} />
              <StatusPill status={job.driverStatus} />
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
          {(job.assignment as { rep?: { name: string } | null } | undefined)?.rep?.name ? (
            <Chip icon="id-card" text={(job.assignment as { rep: { name: string } }).rep.name} />
          ) : null}
          {job.clientName ? <Chip icon="person" text={job.clientName} /> : null}
        </View>

        {job.collectionRequired ? (
          <View style={styles.cta}>
            <CollectionCard
              compact
              amount={collectionAmount(job)}
              currency={job.collectionCurrency}
              collected={job.collectionCollected}
            />
          </View>
        ) : null}

        {/* Next step */}
        {closed ? (
          <View style={[styles.closed, { backgroundColor: status.bg }]}>
            <Icon name={status.icon} size={16} color={status.fg} />
            <Text style={[styles.closedText, { color: status.fg }]}>
              {t(`status.${job.driverStatus}`)} · {t('repApp.jobDone')}
            </Text>
          </View>
        ) : job.driverStatus === 'IN_PROGRESS' ? (
          <ActionButton
            label={t('driverApp.completeTrip')}
            icon="flag"
            tone="success"
            onPress={onComplete}
            disabled={!complete.open}
            hint={complete.hint || undefined}
            style={styles.cta}
          />
        ) : job.driverStatus === 'PENDING' ? (
          <ActionButton
            label={t('driverApp.startTrip')}
            icon="play"
            tone="primary"
            onPress={onStart}
            disabled={!start.open}
            hint={start.hint || undefined}
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
  driverTime: { fontSize: 11, fontWeight: '800', marginTop: 3 },
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
