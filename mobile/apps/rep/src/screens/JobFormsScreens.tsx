import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addDays,
  apiErrorMessage,
  formatDayLabel,
  formatTimeCairo,
  repPortalApi,
  t,
  unwrapData,
  useColors,
  type GuestSurveyInput,
  type GuestSurveyPayload,
} from '@itour/shared';
import { Icon, LoadingSpinner } from '@itour/ui';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { ActionButton, GradientHeader, Segmented, Surface } from '../ui/kit';
import { Choice, Counter, Field } from '../ui/form';

/**
 * Cairo wall-clock date + time → UTC ISO, DST-aware without a tz library:
 * guess UTC, read what Cairo shows for that instant, correct by the gap.
 */
export function cairoWallclockToISO(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target - 2 * 3600000;
  for (let i = 0; i < 2; i++) {
    const shown = new Date(guess).toLocaleString('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [dp, tp] = shown.split(', ');
    const [sy, sm, sd] = dp.split('-').map(Number);
    const [sh, smin] = tp.split(':').map(Number);
    const shownUtc = Date.UTC(sy, sm - 1, sd, sh % 24, smin);
    guess += target - shownUtc;
  }
  return new Date(guess).toISOString();
}

// ─── Flight delay ───────────────────────────────────────────────

type DelayProps = StackScreenProps<RootStackParamList, 'FlightDelay'>;

export function FlightDelayScreen({ route, navigation }: DelayProps) {
  const { jobId, jobRef, jobDate, arrivalTime } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [dayOffset, setDayOffset] = useState<'0' | '1'>('0');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);
  const valid = /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
  const newDate = addDays(jobDate, Number(dayOffset));

  const onTime = (v: string) => {
    // Accept "1435" → "14:35" as the rep types.
    const digits = v.replace(/[^\d]/g, '').slice(0, 4);
    setTime(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  };

  const submit = async () => {
    if (!valid) {
      Alert.alert(t('repApp.invalidTime'));
      return;
    }
    const [h, m] = time.split(':');
    setSending(true);
    try {
      await repPortalApi.submitFlightDelay(jobId, cairoWallclockToISO(newDate, `${h.padStart(2, '0')}:${m}`));
      Alert.alert(t('repApp.delaySent'), jobRef, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert(t('common.error'), apiErrorMessage(err, t('common.error')));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader eyebrow={jobRef} title={t('repApp.delayTitle')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Surface style={styles.hint}>
          <Icon name="time" size={20} color={colors.warning} />
          <Text style={[styles.hintText, { color: colors.foreground }]}>{t('repApp.delayHint')}</Text>
        </Surface>
        <Surface style={styles.current}>
          <Text style={[styles.currentLabel, { color: colors.mutedForeground }]}>{t('repApp.currentArrival')}</Text>
          <Text style={[styles.currentValue, { color: colors.foreground }]}>
            {formatDayLabel(jobDate)}  ·  {formatTimeCairo(arrivalTime)}
          </Text>
        </Surface>
        <Text style={[styles.label, { color: colors.foreground }]}>{t('repApp.newDate')}</Text>
        <Segmented
          value={dayOffset}
          onChange={setDayOffset}
          options={[
            { value: '0', label: formatDayLabel(jobDate) },
            { value: '1', label: formatDayLabel(addDays(jobDate, 1)) },
          ]}
        />
        <View style={{ height: 16 }} />
        <Field
          label={t('repApp.newTime')}
          icon="alarm-outline"
          value={time}
          onChangeText={onTime}
          keyboardType="number-pad"
          placeholder="14:35"
          maxLength={5}
          required
          style={styles.timeInput}
        />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <ActionButton size="lg" label={t('repApp.submit')} icon="send" tone="warning" loading={sending} disabled={!valid} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Free-text update ───────────────────────────────────────────

type UpdateProps = StackScreenProps<RootStackParamList, 'JobUpdate'>;

export function JobUpdateScreen({ route, navigation }: UpdateProps) {
  const { jobId, jobRef } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    try {
      await repPortalApi.submitUpdate(jobId, message.trim());
      Alert.alert(t('repApp.updateSent'), jobRef, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert(t('common.error'), apiErrorMessage(err, t('common.error')));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader eyebrow={jobRef} title={t('repApp.updateTitle')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Surface style={styles.hint}>
          <Icon name="chatbox-ellipses" size={20} color={colors.primary} />
          <Text style={[styles.hintText, { color: colors.foreground }]}>{t('repApp.updateHint')}</Text>
        </Surface>
        <Field
          label={t('repApp.notes')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('repApp.updatePlaceholder')}
          multiline
          maxLength={1000}
          autoFocus
          required
        />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <ActionButton size="lg" label={t('repApp.submit')} icon="send" loading={sending} disabled={!message.trim()} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Arrival guest survey ───────────────────────────────────────

type SurveyProps = StackScreenProps<RootStackParamList, 'Survey'>;

interface SurveyForm {
  ageRange: GuestSurveyInput['ageRange'] | '';
  noOfAdults: number;
  noOfChildren: number;
  noOfInfants: number;
  flightNo: string;
  stayLength: string;
  repeaterGuest: GuestSurveyInput['repeaterGuest'] | '';
  guestNationality: string;
  localTravelAgent: string;
  hotelName: string;
  email: string;
  generalComment: string;
  contactNumber: string;
}

const EMPTY: SurveyForm = {
  ageRange: '',
  noOfAdults: 1,
  noOfChildren: 0,
  noOfInfants: 0,
  flightNo: '',
  stayLength: '',
  repeaterGuest: '',
  guestNationality: '',
  localTravelAgent: '',
  hotelName: '',
  email: '',
  generalComment: '',
  contactNumber: '',
};

/** Native version of the web GuestSurveyDialog — same fields, same required set. */
export function SurveyScreen({ route, navigation }: SurveyProps) {
  const { jobId, jobRef } = route.params;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<SurveyForm>(EMPTY);
  const [isUpdate, setIsUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof SurveyForm>(k: K, v: SurveyForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const { data } = await repPortalApi.getSurvey(jobId);
        const { survey, prefill } = unwrapData<GuestSurveyPayload>(data) ?? { survey: null };
        if (survey) {
          setIsUpdate(true);
          setForm({
            ageRange: survey.ageRange ?? '',
            noOfAdults: survey.noOfAdults ?? 1,
            noOfChildren: survey.noOfChildren ?? 0,
            noOfInfants: survey.noOfInfants ?? 0,
            flightNo: survey.flightNo ?? '',
            stayLength: survey.stayLength ?? '',
            repeaterGuest: survey.repeaterGuest ?? '',
            guestNationality: survey.guestNationality ?? '',
            localTravelAgent: survey.localTravelAgent ?? '',
            hotelName: survey.hotelName ?? '',
            email: survey.email ?? '',
            generalComment: survey.generalComment ?? '',
            contactNumber: survey.contactNumber ?? '',
          });
        } else {
          setForm({
            ...EMPTY,
            flightNo: prefill?.flightNo ?? '',
            hotelName: prefill?.hotelName ?? '',
            noOfAdults: prefill?.paxCount ?? 1,
          });
        }
      } catch {
        // empty form
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const valid =
    !!form.ageRange &&
    !!form.flightNo.trim() &&
    !!form.repeaterGuest &&
    !!form.guestNationality.trim() &&
    !!form.hotelName.trim() &&
    !!form.generalComment.trim() &&
    !!form.contactNumber.trim();

  const submit = async () => {
    setTried(true);
    if (!valid) {
      Alert.alert(t('repApp.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await repPortalApi.submitSurvey(jobId, {
        ageRange: form.ageRange as GuestSurveyInput['ageRange'],
        noOfAdults: form.noOfAdults,
        noOfChildren: form.noOfChildren,
        noOfInfants: form.noOfInfants,
        flightNo: form.flightNo.trim(),
        stayLength: form.stayLength.trim() || undefined,
        repeaterGuest: form.repeaterGuest as GuestSurveyInput['repeaterGuest'],
        guestNationality: form.guestNationality.trim(),
        localTravelAgent: form.localTravelAgent.trim() || undefined,
        hotelName: form.hotelName.trim(),
        email: form.email.trim() || undefined,
        generalComment: form.generalComment.trim(),
        contactNumber: form.contactNumber.trim(),
      });
      Alert.alert(t('repApp.surveySent'), jobRef, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert(t('common.error'), apiErrorMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const err = (v: string) => tried && !v.trim();

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader eyebrow={jobRef} title={t('repApp.surveyTitle')} onBack={() => navigation.goBack()} />
      {loading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
          <Choice
            label={t('repApp.ageRange')}
            required
            value={form.ageRange}
            onChange={(v) => set('ageRange', v)}
            options={[
              { value: '20-30', label: '20 – 30' },
              { value: '30-45', label: '30 – 45' },
              { value: '45-60', label: '45 – 60' },
            ]}
          />
          <View style={styles.counters}>
            <Counter label={t('repApp.adults')} required value={form.noOfAdults} onChange={(n) => set('noOfAdults', n)} />
            <Counter label={t('repApp.children')} value={form.noOfChildren} onChange={(n) => set('noOfChildren', n)} />
            <Counter label={t('repApp.infants')} value={form.noOfInfants} onChange={(n) => set('noOfInfants', n)} />
          </View>
          <Choice
            label={t('repApp.repeater')}
            required
            value={form.repeaterGuest}
            onChange={(v) => set('repeaterGuest', v)}
            options={[
              { value: 'YES', label: t('repApp.yes') },
              { value: 'NO', label: t('repApp.no') },
            ]}
          />
          <Field label={t('repApp.flightNo')} icon="airplane-outline" required error={err(form.flightNo)} value={form.flightNo} onChangeText={(v) => set('flightNo', v)} autoCapitalize="characters" />
          <Field label={t('repApp.nationality')} icon="flag-outline" required error={err(form.guestNationality)} value={form.guestNationality} onChangeText={(v) => set('guestNationality', v)} />
          <Field label={t('repApp.hotel')} icon="bed-outline" required error={err(form.hotelName)} value={form.hotelName} onChangeText={(v) => set('hotelName', v)} />
          <Field label={t('repApp.stayLength')} icon="moon-outline" value={form.stayLength} onChangeText={(v) => set('stayLength', v)} placeholder="7 nights" />
          <Field label={t('repApp.travelAgent')} icon="business-outline" value={form.localTravelAgent} onChangeText={(v) => set('localTravelAgent', v)} />
          <Field label={t('repApp.contact')} icon="logo-whatsapp" required error={err(form.contactNumber)} value={form.contactNumber} onChangeText={(v) => set('contactNumber', v)} keyboardType="phone-pad" />
          <Field label={t('repApp.email')} icon="mail-outline" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />
          <Field label={t('repApp.comment')} required error={err(form.generalComment)} value={form.generalComment} onChangeText={(v) => set('generalComment', v)} multiline />
        </ScrollView>
      )}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <ActionButton
          size="lg"
          label={isUpdate ? t('repApp.surveyUpdate') : t('repApp.surveySubmit')}
          icon="checkmark-circle"
          tone="info"
          loading={saving}
          disabled={loading}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  hint: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 },
  hintText: { flex: 1, fontSize: 14, lineHeight: 20 },
  current: { marginBottom: 18 },
  currentLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  timeInput: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  counters: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
