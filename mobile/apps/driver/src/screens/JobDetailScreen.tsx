import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apiErrorMessage,
  callPhone,
  canNavigate,
  driverPortalApi,
  formatCurrency,
  formatDayLabel,
  formatTimeCairo,
  openJobNavigation,
  t,
  tf,
  unwrapData,
  unwrapList,
  useColors,
  type DriverPortalJob,
  appAlert,
} from '@itour/shared';
import {
  ActionButton,
  EmptyState,
  HeaderIconButton,
  Icon,
  InfoLine,
  LoadingSpinner,
  SectionTitle,
  ServicePill, ChannelPill,
  StatusPill,
  Surface,
  TileAction,
  brandGradient,
} from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { CollectionCard } from '../components/CollectionCard';
import {
  collectionAmount,
  completeGate,
  destinationLabel,
  destinationSub,
  isTerminal,
  jobDay,
  jobTimeLabel,
  driverTimeLabel,
  noShowGate,
  originLabel,
  originSub,
  repLine,
  startGate,
} from '../lib/job-rules';

type Props = StackScreenProps<RootStackParamList, 'JobDetail'>;

/**
 * Loads the job as the day list sees it (driverStatus, noShowAvailableFrom).
 * Without a date — e.g. opened from a notification — the detail endpoint
 * supplies the jobDate first. (The old screen only ever searched today's list.)
 */
async function loadJob(jobId: string, date?: string): Promise<DriverPortalJob | null> {
  let day = date;
  let detail: (DriverPortalJob & { assignment?: { driverStatus?: string } }) | null = null;
  if (!day) {
    const { data } = await driverPortalApi.getJobDetail(jobId);
    detail = unwrapData(data);
    day = detail ? jobDay(detail) : undefined;
  }
  if (day) {
    const { data } = await driverPortalApi.getJobs(day);
    const found = unwrapList<DriverPortalJob>(data, 'jobs').find((j) => j.id === jobId);
    if (found) return found;
  }
  if (!detail) {
    const { data } = await driverPortalApi.getJobDetail(jobId);
    detail = unwrapData(data);
  }
  return detail
    ? ({ ...detail, driverStatus: (detail.assignment?.driverStatus ?? 'PENDING') as DriverPortalJob['driverStatus'] } as DriverPortalJob)
    : null;
}

const STEPS = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const;

export function JobDetailScreen({ route, navigation }: Props) {
  const { jobId, date } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<DriverPortalJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collecting, setCollecting] = useState(false);

  const fetchJob = useCallback(async () => {
    try {
      setJob(await loadJob(jobId, date));
    } catch (err) {
      appAlert(t('common.error'), apiErrorMessage(err, t('common.error')), undefined, { tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [jobId, date]);

  useFocusEffect(
    useCallback(() => {
      fetchJob();
    }, [fetchJob]),
  );

  const markCollected = () => {
    if (!job) return;
    const amount = formatCurrency(collectionAmount(job), job.collectionCurrency || 'EGP');
    appAlert(t('driverApp.markCollected'), tf('driverApp.confirmCollected', { amount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          setCollecting(true);
          try {
            await driverPortalApi.markCollection(job.id);
            await fetchJob();
          } catch (err) {
            appAlert(t('common.error'), apiErrorMessage(err, t('common.error')), undefined, { tone: 'danger' });
          } finally {
            setCollecting(false);
          }
        },
      },
    ]);
  };


  if (loading) return <LoadingSpinner fullScreen />;
  if (!job) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <EmptyState icon="alert-circle-outline" title={t('common.noData')} />
      </View>
    );
  }

  const closed = isTerminal(job);
  const isArr = job.serviceType === 'ARR';
  const start = startGate(job);
  const complete = completeGate(job);
  const noShow = noShowGate(job);
  const rep = repLine(job);
  const navEnd = job.driverStatus === 'IN_PROGRESS' ? 'destination' : 'origin';
  const stepIndex = job.driverStatus === 'COMPLETED' ? 2 : job.driverStatus === 'IN_PROGRESS' ? 1 : 0;
  const extras = job.jobExtras?.filter((e) => e.qty > 0) ?? [];
  const evidence = (kind: 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW') =>
    navigation.navigate('Evidence', { jobId: job.id, jobRef: job.internalRef, kind });

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[colors.primary]}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchJob();
              setRefreshing(false);
            }}
          />
        }
      >
        {/* Hero */}
        <LinearGradient
          colors={brandGradient(colors)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.heroTop}>
            <HeaderIconButton icon="arrow-back" onPress={() => navigation.goBack()} label="Back" />
            <View style={{ flex: 1 }} />
            <ServicePill serviceType={job.serviceType} />
<ChannelPill channel={job.bookingChannel} />
          </View>
          <Text style={styles.heroRef}>{job.internalRef}</Text>
          <Text style={styles.heroSub}>
            {formatDayLabel(jobDay(job))}
            {job.agentRef ? `  ·  ${job.agentRef}` : ''}
          </Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroTimeLabel}>{isArr ? t('repApp.driverArrives') : t('repApp.pickup')}</Text>
              <Text style={styles.heroTime}>{jobTimeLabel(job)}</Text>
            </View>
            {driverTimeLabel(job) ? (
              <>
                <View style={styles.heroDivider} />
                <View>
                  <Text style={styles.heroTimeLabel}>{t('repApp.driverTime')}</Text>
                  <Text style={styles.heroTime}>{driverTimeLabel(job)}</Text>
                </View>
              </>
            ) : null}
            <View style={styles.heroDivider} />
            <View>
              <Text style={styles.heroTimeLabel}>{t('jobs.pax')}</Text>
              <Text style={styles.heroTime}>{job.paxCount}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <StatusPill status={job.driverStatus} />
          </View>

          {!['CANCELLED', 'NO_SHOW'].includes(job.driverStatus) ? (
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const done = i <= stepIndex;
                return (
                  <React.Fragment key={s}>
                    {i > 0 ? <View style={[styles.stepLine, done && styles.stepLineDone]} /> : null}
                    <View style={styles.step}>
                      <View style={[styles.stepDot, done && styles.stepDotDone]}>
                        {done ? <Icon name="checkmark" size={12} color={colors.brand} /> : null}
                      </View>
                      <Text style={[styles.stepText, done && styles.stepTextDone]}>
                        {s === 'IN_PROGRESS' ? t('driverApp.onTrip') : t(`status.${s}`)}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.sections}>
          {/* Cash collection comes first: it gates Complete. */}
          {job.collectionRequired ? (
            <CollectionCard
              amount={collectionAmount(job)}
              currency={job.collectionCurrency}
              collected={job.collectionCollected}
              onMarkCollected={closed ? undefined : markCollected}
              busy={collecting}
            />
          ) : null}

          {/* Primary action */}
          {!closed ? (
            job.driverStatus === 'IN_PROGRESS' ? (
              <ActionButton
                size="lg"
                label={t('driverApp.completeTrip')}
                icon="flag"
                tone="success"
                onPress={() => evidence('COMPLETED')}
                disabled={!complete.open}
                hint={complete.hint || undefined}
              />
            ) : (
              <ActionButton
                size="lg"
                label={t('driverApp.startTrip')}
                icon="play"
                onPress={() => evidence('IN_PROGRESS')}
                disabled={!start.open}
                hint={start.hint || undefined}
              />
            )
          ) : (
            <Surface style={styles.closedCard}>
              <Icon name="lock-closed" size={18} color={colors.mutedForeground} />
              <Text style={[styles.closedText, { color: colors.mutedForeground }]}>{t('repApp.jobDone')}</Text>
            </Surface>
          )}

          {/* Secondary actions */}
          {!closed ? (
            <View style={styles.tiles}>
              <TileAction
                label={t('repApp.noShow')}
                icon="person-remove-outline"
                tone="danger"
                disabled={!noShow.open}
                hint={noShow.hint || undefined}
                onPress={() => evidence('NO_SHOW')}
              />
              {/* Before the trip starts: to the pickup; on the trip: to the drop-off. */}
              <TileAction
                label={t('repApp.navigate')}
                icon="navigate-outline"
                tone="info"
                disabled={!canNavigate(job, navEnd)}
                onPress={() => openJobNavigation(job, navEnd)}
              />
              <TileAction
                label={t('driverApp.callRep')}
                icon="call-outline"
                tone="success"
                disabled={!rep?.phone}
                onPress={() => rep?.phone && callPhone(rep.phone, rep.name)}
              />
            </View>
          ) : null}

          {/* Route */}
          <Surface>
            <SectionTitle title={t('jobs.route')} icon="navigate" />
            <Stop
              kind="from"
              label={originLabel(job)}
              sub={originSub(job)}
              onNavigate={canNavigate(job, 'origin') ? () => openJobNavigation(job, 'origin') : undefined}
            />
            <View style={[styles.stopDivider, { backgroundColor: colors.border }]} />
            <Stop
              kind="to"
              label={destinationLabel(job)}
              sub={destinationSub(job)}
              onNavigate={canNavigate(job, 'destination') ? () => openJobNavigation(job, 'destination') : undefined}
            />
          </Surface>

          {/* Flight */}
          {job.flight ? (
            <Surface>
              <SectionTitle title={t('repApp.flight')} icon="airplane" />
              <View style={styles.flightRow}>
                <View style={[styles.flightBadge, { backgroundColor: colors.infoSoft }]}>
                  <Icon name={isArr ? 'mc:airplane-landing' : 'mc:airplane-takeoff'} size={22} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flightNo, { color: colors.foreground }]}>
                    {job.flight.carrier ? `${job.flight.carrier} ` : ''}
                    {job.flight.flightNo}
                  </Text>
                  <Text style={[styles.flightMeta, { color: colors.mutedForeground }]}>
                    {job.flight.terminal ? `${t('repApp.terminal')} ${job.flight.terminal}` : isArr ? t('jobs.arrivalTime') : t('jobs.departureTime')}
                  </Text>
                </View>
                <Text style={[styles.flightTime, { color: colors.foreground }]}>
                  {formatTimeCairo(isArr ? job.flight.arrivalTime : job.flight.departureTime)}
                </Text>
              </View>
            </Surface>
          ) : null}

          {/* Guest */}
          {job.clientName ? (
            <Surface>
              <SectionTitle title={t('repApp.guest')} icon="person" />
              <InfoLine icon="person-outline" label={t('jobs.clientName')} value={job.clientName} />
            </Surface>
          ) : null}

          {/* Rep & vehicle */}
          {rep || job.assignment?.vehicle ? (
            <Surface>
              <SectionTitle title={t('driverApp.repAndVehicle')} icon="car" />
              {rep ? (
                <InfoLine
                  icon="id-card-outline"
                  label={t('driverApp.rep')}
                  value={rep.name}
                  actionIcon="call"
                  onPress={rep.phone ? () => callPhone(rep.phone!, rep.name) : undefined}
                />
              ) : null}
              <InfoLine
                icon="car-outline"
                label={job.assignment?.vehicle?.vehicleType?.name ?? t('jobs.vehicle')}
                value={job.assignment?.vehicle?.plateNumber}
              />
            </Surface>
          ) : null}

          {/* Extras + notes */}
          {extras.length || job.notes ? (
            <Surface>
              <SectionTitle title={t('repApp.details')} icon="document-text" />
              {extras.length ? (
                <View style={styles.extras}>
                  {extras.map((e) => (
                    <View key={e.name} style={[styles.extra, { backgroundColor: colors.violetSoft }]}>
                      <Text style={[styles.extraText, { color: colors.violet }]}>
                        {e.qty}× {e.name}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {job.notes ? (
                <View style={[styles.notes, { backgroundColor: colors.warningSoft }]}>
                  <Icon name="information-circle" size={16} color={colors.warning} />
                  <Text style={[styles.notesText, { color: colors.foreground }]}>{job.notes}</Text>
                </View>
              ) : null}
            </Surface>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Stop({
  kind,
  label,
  sub,
  onNavigate,
}: {
  kind: 'from' | 'to';
  label: string;
  sub: string | null;
  onNavigate?: () => void;
}) {
  const colors = useColors();
  const tint = kind === 'from' ? colors.brandAccent : colors.primary;
  return (
    <View style={styles.stopRow}>
      <View style={[styles.stopIcon, { backgroundColor: `${tint}1F` }]}>
        <Icon name={kind === 'from' ? 'radio-button-on' : 'location'} size={16} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stopKind, { color: colors.mutedForeground }]}>
          {kind === 'from' ? t('repApp.from') : t('repApp.to')}
        </Text>
        <Text style={[styles.stopLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.stopSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {onNavigate ? (
        <ActionButton label={t('repApp.navigate')} icon="navigate" size="sm" variant="soft" tone="info" onPress={onNavigate} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  heroRef: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 0.2 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 16 },
  heroDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)' },
  heroTimeLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTime: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 20 },
  step: { alignItems: 'center', width: 76 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: '#fff', borderColor: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 10, marginHorizontal: -22 },
  stepLineDone: { backgroundColor: '#fff' },
  stepText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 6 },
  stepTextDone: { color: '#fff' },
  sections: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  closedCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closedText: { fontSize: 14, fontWeight: '600' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  stopIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stopKind: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  stopLabel: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  stopSub: { fontSize: 12, marginTop: 1 },
  stopDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10, marginLeft: 48 },
  flightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flightBadge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flightNo: { fontSize: 17, fontWeight: '800' },
  flightMeta: { fontSize: 12, marginTop: 2 },
  flightTime: { fontSize: 20, fontWeight: '800' },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  extra: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  extraText: { fontSize: 12, fontWeight: '700' },
  notes: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, marginTop: 10 },
  notesText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
