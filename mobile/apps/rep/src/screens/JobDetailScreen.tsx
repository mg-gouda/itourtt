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
  formatDayLabel,
  formatTimeCairo,
  openJobNavigation,
  openWhatsApp,
  repPortalApi,
  t,
  unwrapData,
  unwrapList,
  useColors,
  type RepPortalJob,
  appAlert,
} from '@itour/shared';
import { Icon, LoadingSpinner, EmptyState } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  ActionButton,
  HeaderIconButton,
  InfoLine,
  SectionTitle,
  ServicePill, ChannelPill,
  StatusPill,
  Surface,
  TileAction,
  brandGradient,
} from '@itour/ui';
import {
  canComplete,
  canOfferInPlace,
  destinationLabel,
  destinationSub,
  driverLine,
  inPlaceWindow,
  isTerminal,
  jobDay,
  jobTimeLabel,
  driverTimeLabel,
  noShowGate,
  originLabel,
  originSub,
} from '../lib/job-rules';
import { askEscort, needsEscortAnswer } from '../lib/escort';

type Props = StackScreenProps<RootStackParamList, 'JobDetail'>;

/**
 * Loads one job the way the day list sees it (repStatus, noShowAvailableFrom,
 * guestSurvey are only on the list). Without a date — e.g. opened from a
 * notification — the detail endpoint supplies the jobDate first.
 */
async function loadJob(jobId: string, date?: string): Promise<RepPortalJob | null> {
  let day = date;
  let detail: (RepPortalJob & { assignment?: { repStatus?: string; repEscort?: boolean | null } }) | null = null;
  if (!day) {
    const { data } = await repPortalApi.getJobDetail(jobId);
    detail = unwrapData(data);
    day = detail ? jobDay(detail) : undefined;
  }
  if (day) {
    const { data } = await repPortalApi.getJobs(day);
    const found = unwrapList<RepPortalJob>(data, 'jobs').find((j) => j.id === jobId);
    if (found) return found;
  }
  if (!detail) {
    const { data } = await repPortalApi.getJobDetail(jobId);
    detail = unwrapData(data);
  }
  return detail
    ? ({
        ...detail,
        repStatus: (detail.assignment?.repStatus ?? 'PENDING') as RepPortalJob['repStatus'],
        repEscort: detail.assignment?.repEscort ?? null,
      } as RepPortalJob)
    : null;
}

const STEPS = ['PENDING', 'IN_PLACE', 'COMPLETED'] as const;

export function JobDetailScreen({ route, navigation }: Props) {
  const { jobId, date } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState<RepPortalJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const window = inPlaceWindow(job);
  const noShow = noShowGate(job);
  const driver = driverLine(job);
  const stepIndex = job.repStatus === 'COMPLETED' ? 2 : job.repStatus === 'IN_PLACE' ? 1 : 0;
  const extras = job.jobExtras?.filter((e) => e.qty > 0) ?? [];
  const evidence = (kind: 'IN_PLACE' | 'COMPLETED' | 'NO_SHOW') => {
    // Completing needs the escort answer first: it decides where COMPLETED is geofenced.
    if (kind === 'COMPLETED' && needsEscortAnswer(job)) {
      askEscort(job.id, job.internalRef, () => {
        fetchJob();
        navigation.navigate('Evidence', { jobId: job.id, jobRef: job.internalRef, kind });
      });
      return;
    }
    navigation.navigate('Evidence', { jobId: job.id, jobRef: job.internalRef, kind });
  };

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
        <LinearGradient colors={brandGradient(colors)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 8 }]}>
          <View style={styles.heroTop}>
            <HeaderIconButton icon="arrow-back" onPress={() => navigation.goBack()} label="Back" />
            <View style={{ flex: 1 }} />
            <ServicePill serviceType={job.serviceType} />
<ChannelPill channel={job.bookingChannel} />
          </View>
          <Text style={styles.heroRef}>{job.internalRef}</Text>
          <Text style={styles.heroSub}>
            {formatDayLabel(jobDay(job))}
            {job.agentRef || job.customerJobId ? `  ·  ${job.agentRef ?? job.customerJobId}` : ''}
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
            <StatusPill status={job.repStatus} />
          </View>

          {/* Progress */}
          {!['CANCELLED', 'NO_SHOW'].includes(job.repStatus) ? (
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
                      <Text style={[styles.stepText, done && styles.stepTextDone]}>{t(`status.${s}`)}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.sections}>
          {/* Primary action */}
          {!closed ? (
            <View style={styles.primary}>
              {canComplete(job) ? (
                <ActionButton size="lg" label={t('repApp.complete')} icon="checkmark-done" tone="success" onPress={() => evidence('COMPLETED')} />
              ) : canOfferInPlace(job) ? (
                <ActionButton
                  size="lg"
                  label={t('repApp.inPlace')}
                  icon="location"
                  onPress={() => evidence('IN_PLACE')}
                  disabled={!window.open}
                  hint={window.hint || undefined}
                />
              ) : (
                <ActionButton
                  size="lg"
                  label={t('repApp.complete')}
                  icon="checkmark-done"
                  tone="success"
                  onPress={() => evidence('COMPLETED')}
                  disabled
                  hint={t('repApp.markInPlaceFirst')}
                />
              )}
            </View>
          ) : (
            <Surface style={styles.closedCard}>
              <Icon name="lock-closed" size={18} color={colors.mutedForeground} />
              <Text style={[styles.closedText, { color: colors.mutedForeground }]}>{t('repApp.jobDone')}</Text>
            </Surface>
          )}

          {/* Secondary actions */}
          <View style={styles.tiles}>
            {!closed ? (
              <TileAction
                label={t('repApp.noShow')}
                icon="person-remove-outline"
                tone="danger"
                disabled={!noShow.open}
                hint={noShow.hint || undefined}
                onPress={() => evidence('NO_SHOW')}
              />
            ) : null}
            {isArr && !closed ? (
              <TileAction
                label={t('repApp.flightDelay')}
                icon="time-outline"
                tone="warning"
                onPress={() =>
                  navigation.navigate('FlightDelay', {
                    jobId: job.id,
                    jobRef: job.internalRef,
                    jobDate: jobDay(job),
                    arrivalTime: job.flight?.arrivalTime ?? null,
                  })
                }
              />
            ) : null}
            {isArr ? (
              <TileAction
                label={job.guestSurvey ? t('repApp.surveyDone') : t('repApp.survey')}
                icon="clipboard-outline"
                tone="info"
                done={!!job.guestSurvey}
                onPress={() => navigation.navigate('Survey', { jobId: job.id, jobRef: job.internalRef })}
              />
            ) : null}
            <TileAction
              label={t('repApp.sendUpdate')}
              icon="chatbox-ellipses-outline"
              tone="primary"
              onPress={() => navigation.navigate('JobUpdate', { jobId: job.id, jobRef: job.internalRef })}
            />
          </View>

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
                    {job.flight.carrier} {job.flight.flightNo}
                  </Text>
                  <Text style={[styles.flightMeta, { color: colors.mutedForeground }]}>
                    {job.flight.terminal ? `${t('repApp.terminal')} ${job.flight.terminal}` : '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.flightTime, { color: colors.foreground }]}>
                    {formatTimeCairo(isArr ? job.flight.arrivalTime : job.flight.departureTime)}
                  </Text>
                  <Text style={[styles.flightMeta, { color: colors.mutedForeground }]}>
                    {isArr ? t('jobs.arrivalTime') : t('jobs.departureTime')}
                  </Text>
                </View>
              </View>
            </Surface>
          ) : null}

          {/* Guest */}
          {job.clientName || job.clientMobile ? (
            <Surface>
              <SectionTitle title={t('repApp.guest')} icon="person" />
              <InfoLine icon="person-outline" label={t('jobs.clientName')} value={job.clientName} />
              <InfoLine icon="call-outline" label={t('jobs.clientMobile')} value={job.clientMobile} />
              {job.clientMobile ? (
                <View style={styles.contactRow}>
                  <ActionButton
                    label={t('repApp.call')}
                    icon="call"
                    variant="soft"
                    size="sm"
                    style={styles.flex}
                    onPress={() => callPhone(job.clientMobile!, job.clientName ?? undefined)}
                  />
                  <ActionButton
                    label={t('repApp.whatsapp')}
                    icon="logo-whatsapp"
                    tone="success"
                    variant="soft"
                    size="sm"
                    style={styles.flex}
                    onPress={() => openWhatsApp(job.clientMobile!)}
                  />
                </View>
              ) : null}
            </Surface>
          ) : null}

          {/* Customer rep */}
          {job.custRepName || job.custRepMobile || job.custRepMeetingPoint || job.custRepMeetingTime ? (
            <Surface>
              <SectionTitle title={t('repApp.customerRep')} icon="briefcase" />
              <InfoLine icon="person-outline" label={t('rep.custRepName')} value={job.custRepName} />
              <InfoLine
                icon="call-outline"
                label={t('rep.custRepMobile')}
                value={job.custRepMobile}
                actionIcon="call"
                onPress={job.custRepMobile ? () => callPhone(job.custRepMobile!, job.custRepName ?? undefined) : undefined}
              />
              <InfoLine icon="flag-outline" label={t('repApp.meetingPoint')} value={job.custRepMeetingPoint} />
              <InfoLine
                icon="alarm-outline"
                label={t('repApp.meetingTime')}
                value={job.custRepMeetingTime ? formatTimeCairo(job.custRepMeetingTime) : null}
              />
            </Surface>
          ) : null}

          {/* Driver & vehicle */}
          {driver || job.assignment?.vehicle ? (
            <Surface>
              <SectionTitle title={t('repApp.driverAndVehicle')} icon="car" />
              {driver ? (
                <InfoLine
                  icon="person-circle-outline"
                  label={driver.supplier ? `${t('repApp.supplierDriver')} · ${driver.supplier}` : t('jobs.driver')}
                  value={driver.name}
                  actionIcon="call"
                  onPress={driver.phone ? () => callPhone(driver.phone!, driver.name) : undefined}
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
          {extras.length || job.notes || job.agentRef || job.customerJobId ? (
            <Surface>
              <SectionTitle title={t('repApp.details')} icon="document-text" />
              {/* Owner's rule (2026-11-19): reps see the agent's reference, not the agent's name. */}
              <InfoLine icon="pricetag-outline" label={t('repApp.agentRef')} value={job.agentRef ?? job.customerJobId ?? undefined} />
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
  primary: {},
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
  contactRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  extras: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  extra: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  extraText: { fontSize: 12, fontWeight: '700' },
  notes: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, marginTop: 10 },
  notesText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
