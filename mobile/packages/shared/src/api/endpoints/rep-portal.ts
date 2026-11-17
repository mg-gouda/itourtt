import api from '../client';
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
  getJobs(date: string) {
    return api.get<{ data: { date: string; jobs: RepPortalJob[] } }>('/rep-portal/jobs', { params: { date } });
  },

  getJobHistory(dateFrom: string, dateTo: string) {
    return api.get<{ data: { jobs: RepPortalJob[] } }>('/rep-portal/jobs/history', {
      params: { dateFrom, dateTo },
    });
  },

  /** One job's full record (no repStatus / noShowAvailableFrom — those come from the day list). */
  getJobDetail(jobId: string) {
    return api.get(`/rep-portal/jobs/${jobId}`);
  },

  /** GPS-stamped transition without evidence. The server only accepts COMPLETED / CANCELLED here. */
  updateJobStatus(jobId: string, status: string, latitude?: number, longitude?: number) {
    return api.patch(`/rep-portal/jobs/${jobId}/status`, { status, latitude, longitude });
  },

  /** PENDING → IN_PLACE: exactly 2 photos + GPS; ARR jobs only inside arrival −10 / +80 min. */
  submitInPlace(jobId: string, formData: FormData) {
    return api.post(`/rep-portal/jobs/${jobId}/in-place`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  /** IN_PLACE → COMPLETED: 1–10 photos + GPS. */
  submitCompleted(jobId: string, formData: FormData) {
    return api.post(`/rep-portal/jobs/${jobId}/completed`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  /** NO SHOW: 1–10 photos + GPS, after the server's noShowAvailableFrom. */
  submitNoShow(jobId: string, formData: FormData) {
    return api.post(`/rep-portal/jobs/${jobId}/no-show`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
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
