import api from '../client';
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
  getJobs(date: string) {
    return api.get<{ data: { date: string; jobs: DriverPortalJob[] } }>('/driver-portal/jobs', { params: { date } });
  },

  getJobHistory(dateFrom: string, dateTo: string) {
    return api.get<{ data: { jobs: DriverPortalJob[] } }>('/driver-portal/jobs/history', {
      params: { dateFrom, dateTo },
    });
  },

  /** One job's full record (driverStatus lives on assignment; no noShowAvailableFrom). */
  getJobDetail(jobId: string) {
    return api.get(`/driver-portal/jobs/${jobId}`);
  },

  updateJobStatus(jobId: string, status: string, latitude?: number, longitude?: number) {
    return api.patch(`/driver-portal/jobs/${jobId}/status`, { status, latitude, longitude });
  },

  markCollection(jobId: string) {
    return api.patch(`/driver-portal/jobs/${jobId}/collection`, { collected: true });
  },

  submitInProgress(jobId: string, formData: FormData) {
    return api.post(`/driver-portal/jobs/${jobId}/in-progress`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  submitCompleted(jobId: string, formData: FormData) {
    return api.post(`/driver-portal/jobs/${jobId}/completed`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  submitNoShow(jobId: string, formData: FormData) {
    return api.post(`/driver-portal/jobs/${jobId}/no-show`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
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
