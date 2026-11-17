import { create } from 'zustand';
import { driverPortalApi, unwrapData, unwrapList, type PortalNotification } from '@itour/shared';

/**
 * Unread notification count for the header bell. One poll (30 s) runs from
 * the tab navigator; the Notifications screen updates it as items are read.
 */
interface NotificationsState {
  unread: number;
  refresh: () => Promise<void>;
  set: (n: number) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unread: 0,
  set: (n) => set({ unread: Math.max(0, n) }),
  refresh: async () => {
    try {
      const { data } = await driverPortalApi.getNotifications();
      const inner = unwrapData<{ unreadCount?: number }>(data);
      const count =
        typeof inner?.unreadCount === 'number'
          ? inner.unreadCount
          : unwrapList<PortalNotification>(data, 'notifications').filter((n) => !n.isRead).length;
      set({ unread: count });
    } catch {
      // badge only — ignore
    }
  },
}));
