import api from '../client';
import type { AxiosResponse } from 'axios';
import { cachedGet, overlayJobs, queueForm, queueJson } from '../../native/outbox';
import type {
  RepPortalJob,
  RepProfile,
  PortalNotification,
  PortalComplaint,
  PortalDeduction,
  GuestSurveyInput,
} from '../../types';

/**
 * Rep portal API. Every body is wrapped `{ success, data }` — read lists with
 * `unwrapList` (utils/response): the job and notification lists sit one level
 * deeper again (`data.jobs`, `data.notifications`).
 */
export const repPortalApi = {
  /** Saved on the phone; with no signal the saved list comes back (`fromCache`) — offline jobs, 1.9.0. */
  getJobs(date: string) {
    return cachedGet(`rep:jobs:${date}`, () => api.get('/rep-portal/jobs', { params: { date } }), overlayJobs<RepPortalJob>('repStatus')) as Promise<
      AxiosResponse<{ data: { date: string; jobs: RepPortalJob[] } }>
    >;
  },

  getJobHistory(dateFrom: string, dateTo: string) {
    return api.get<{ data: { jobs: RepPortalJob[] } }>('/rep-portal/jobs/history', {
      params: { dateFrom, dateTo },
    });
  },

  /** One job's full record (no repStatus / noShowAvailableFrom — those come from the day list). */
  getJobDetail(jobId: string) {
    return cachedGet(`rep:job:${jobId}`, () => api.get(`/rep-portal/jobs/${jobId}`));
  },

  /** GPS-stamped transition without evidence. The server only accepts COMPLETED / CANCELLED here. */
  updateJobStatus(jobId: string, status: string, latitude?: number, longitude?: number) {
    return queueJson('rep', jobId, 'STATUS', 'patch', `/rep-portal/jobs/${jobId}/status`, { status, latitude, longitude }, status);
  },

  /** After IN PLACE: will the rep escort the transfer (complete at the drop-off) or stay at the airport? */
  setEscort(jobId: string, escort: boolean) {
    return queueJson('rep', jobId, 'ESCORT', 'post', `/rep-portal/jobs/${jobId}/escort`, { escort });
  },

  /** PENDING → IN_PLACE: exactly 2 photos + GPS; ARR jobs only inside arrival −10 / +80 min. */
  submitInPlace(jobId: string, formData: FormData) {
    return queueForm('rep', jobId, 'IN_PLACE', `/rep-portal/jobs/${jobId}/in-place`, formData, 'IN_PLACE');
  },

  /** IN_PLACE → COMPLETED: 1–10 photos + GPS. */
  submitCompleted(jobId: string, formData: FormData) {
    return queueForm('rep', jobId, 'COMPLETED', `/rep-portal/jobs/${jobId}/completed`, formData, 'COMPLETED');
  },

  /** NO SHOW: 1–10 photos + GPS, after the server's noShowAvailableFrom. */
  submitNoShow(jobId: string, formData: FormData) {
    return queueForm('rep', jobId, 'NO_SHOW', `/rep-portal/jobs/${jobId}/no-show`, formData, 'NO_SHOW');
  },

  submitFlightDelay(jobId: string, arrivalTime: string) {
    return api.patch(`/rep-portal/jobs/${jobId}/flight-delay`, { arrivalTime });
  },

  submitUpdate(jobId: string, message: string) {
    return api.post(`/rep-portal/jobs/${jobId}/update`, { message });
  },

  getSurvey(jobId: string) {
    return api.get(`/rep-portal/jobs/${jobId}/survey`);
  },

  submitSurvey(jobId: string, body: GuestSurveyInput) {
    return api.post(`/rep-portal/jobs/${jobId}/survey`, body);
  },

  /** Full URL of a 5-minute download link for the submitted survey (6.2.1) — open it in the browser. */
  async surveyExportUrl(jobId: string, format: 'pdf' | 'xlsx'): Promise<string> {
    const { data } = await api.post(`/rep-portal/jobs/${jobId}/survey/export-link`, { format });
    const path: string = (data?.data ?? data).path;
    return `${api.defaults.baseURL}${path}`;
  },

  getComplaints() {
    return api.get<{ data: PortalComplaint[] }>('/rep-portal/complaints');
  },

  /** Posted deductions against me on jobs dated in [dateFrom, dateTo], with the reason. */
  getDeductions(dateFrom?: string, dateTo?: string) {
    return api.get<{ data: PortalDeduction[] }>('/rep-portal/deductions', { params: { dateFrom, dateTo } });
  },

  getNotifications() {
    // Timer-driven badge poll: keeps the session seen, never counts as activity.
    return api.get<{ data: { notifications: PortalNotification[]; unreadCount: number } }>(
      '/rep-portal/notifications',
      { headers: { 'X-Background-Poll': '1' } },
    );
  },

  markNotificationRead(notificationId: string) {
    return api.patch(`/rep-portal/notifications/${notificationId}/read`);
  },

  markAllNotificationsRead() {
    return api.patch('/rep-portal/notifications/read-all');
  },

  getProfile() {
    return api.get<{ data: RepProfile }>('/rep-portal/profile');
  },
};
