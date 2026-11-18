import { apiErrorMessage, appAlert, repPortalApi, t, type RepPortalJob } from '@itour/shared';

/**
 * The escort question, asked right after IN PLACE (and again until answered):
 * escorting → the rep completes at the drop-off (geofenced there, drop-off
 * alarm armed); not escorting → completes at the airport. Same rule as the web
 * rep portal (components/rep-escort-dialog.tsx). Not for DEP — its drop-off is
 * the airport the rep is already at.
 */
export function needsEscortAnswer(job: Pick<RepPortalJob, 'repStatus' | 'serviceType'> & { repEscort?: boolean | null }) {
  return job.repStatus === 'IN_PLACE' && job.repEscort == null && job.serviceType !== 'DEP';
}

/** Ask (not dismissable) and save; `onAnswered` runs once the server has it. */
export function askEscort(jobId: string, jobRef: string, onAnswered?: (escort: boolean) => void) {
  const save = async (escort: boolean) => {
    try {
      await repPortalApi.setEscort(jobId, escort);
      onAnswered?.(escort);
    } catch (err) {
      appAlert(t('escort.failed'), apiErrorMessage(err, t('common.error')), [
        { text: t('common.retry'), onPress: () => askEscort(jobId, jobRef, onAnswered) },
      ], { tone: 'danger', cancelable: false });
    }
  };
  appAlert(
    t('escort.title'),
    `${t('escort.desc').replace('{ref}', jobRef)}\n\n${t('escort.yesHint')}\n${t('escort.noHint')}`,
    [
      { text: t('escort.no'), style: 'cancel', onPress: () => save(false) },
      { text: t('escort.yes'), onPress: () => save(true) },
    ],
    { tone: 'info', icon: 'car-sport', cancelable: false },
  );
}
