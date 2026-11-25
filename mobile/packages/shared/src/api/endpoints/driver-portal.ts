import api from '../client';
import type { AxiosResponse } from 'axios';
import { cachedGet, overlayJobs, queueForm, queueJson } from '../../native/outbox';
import type { DriverPortalJob, DriverProfile, PortalNotification, PortalComplaint, PortalDeduction } from '../../types';

/**
 * Driver portal API. Bodies are wrapped `{ success, data }`; job and
 * notification lists sit one level deeper (`data.jobs`, `data.notifications`)
 * — read them with `unwrapList` (utils/response).
 *
 * Flow (server-enforced, mirrored from the web driver portal):
 *   PENDING → IN_PROGRESS  POST /in-progress  (1–10 photos + GPS, from job time)
 *   IN_PROGRESS → COMPLETED POST /completed   (1–10 photos + GPS, job time +15 min, cash collected)
 *   NO SHOW                POST /no-show      (1–10 photos + GPS, after noShowAvailableFrom)
 *   CANCELLED              PATCH /status      (GPS)
 */
export const driverPortalApi = {
  /** Saved on the phone; with no signal the saved list comes back (`fromCache`) — offline jobs, 1.9.0. */
  getJobs(date: string) {
    return cachedGet(`driver:jobs:${date}`, () => api.get('/driver-portal/jobs', { params: { date } }), overlayJobs<DriverPortalJob>('driverStatus')) as Promise<
      AxiosResponse<{ data: { date: string; jobs: DriverPortalJob[] } }>
    >;
  },

  getJobHistory(dateFrom: string, dateTo: string) {
    return api.get<{ data: { jobs: DriverPortalJob[] } }>('/driver-portal/jobs/history', {
      params: { dateFrom, dateTo },
    });
  },

  /** One job's full record (driverStatus lives on assignment; no noShowAvailableFrom). */
  getJobDetail(jobId: string) {
    return cachedGet(`driver:job:${jobId}`, () => api.get(`/driver-portal/jobs/${jobId}`));
  },

  updateJobStatus(jobId: string, status: string, latitude?: number, longitude?: number) {
    return queueJson('driver', jobId, 'STATUS', 'patch', `/driver-portal/jobs/${jobId}/status`, { status, latitude, longitude }, status);
  },

  markCollection(jobId: string) {
    return queueJson('driver', jobId, 'COLLECTED', 'patch', `/driver-portal/jobs/${jobId}/collection`, { collected: true });
  },

  submitInProgress(jobId: string, formData: FormData) {
    return queueForm('driver', jobId, 'IN_PROGRESS', `/driver-portal/jobs/${jobId}/in-progress`, formData, 'IN_PROGRESS');
  },

  submitCompleted(jobId: string, formData: FormData) {
    return queueForm('driver', jobId, 'COMPLETED', `/driver-portal/jobs/${jobId}/completed`, formData, 'COMPLETED');
  },

  /** Owned car → completing needs an odometer photo; what was read so far. */
  getOdometer(jobId: string) {
    return cachedGet(`driver:odo:${jobId}`, () => api.get(`/driver-portal/jobs/${jobId}/odometer`));
  },

  /** Odometer photo (field `image`): the server reads the km with AI and returns the status. */
  captureOdometer(jobId: string, formData: FormData) {
    // Offline: the photo is sent (and read) later; the driver types the km meanwhile.
    return queueForm('driver', jobId, 'ODOMETER', `/driver-portal/jobs/${jobId}/odometer`, formData, undefined, 90000);
  },

  submitNoShow(jobId: string, formData: FormData) {
    return queueForm('driver', jobId, 'NO_SHOW', `/driver-portal/jobs/${jobId}/no-show`, formData, 'NO_SHOW');
  },

  getComplaints() {
    return api.get<{ data: PortalComplaint[] }>('/driver-portal/complaints');
  },

  /** Posted deductions against me on jobs dated in [dateFrom, dateTo], with the reason. */
  getDeductions(dateFrom?: string, dateTo?: string) {
    return api.get<{ data: PortalDeduction[] }>('/driver-portal/deductions', { params: { dateFrom, dateTo } });
  },

  getNotifications() {
    // Timer-driven badge poll: keeps the session seen, never counts as activity.
    return api.get<{ data: { notifications: PortalNotification[]; unreadCount: number } }>(
      '/driver-portal/notifications',
      { headers: { 'X-Background-Poll': '1' } },
    );
  },

  markNotificationRead(notificationId: string) {
    return api.patch(`/driver-portal/notifications/${notificationId}/read`);
  },

  markAllNotificationsRead() {
    return api.patch('/driver-portal/notifications/read-all');
  },

  getProfile() {
    return api.get<{ data: DriverProfile }>('/driver-portal/profile');
  },
};
