import { create } from 'zustand';
import { Toast } from '../types';
import { notificationsApi } from '../api/services';

interface NotificationStore {
  unreadCount: number;
  toasts: Toast[];
  chatScreenActive: boolean;
  listVersion: number;

  setUnreadCount: (n: number) => void;
  refreshUnreadCount: () => Promise<void>;
  bumpListVersion: () => void;
  setChatScreenActive: (v: boolean) => void;

  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  unreadCount: 0,
  toasts: [],
  chatScreenActive: false,
  listVersion: 0,

  setUnreadCount: (n) => set({ unreadCount: n }),
  bumpListVersion: () => set((s) => ({ listVersion: s.listVersion + 1 })),
  setChatScreenActive: (v) => set({ chatScreenActive: v }),
  refreshUnreadCount: async () => {
    try {
      const res = await notificationsApi.getUnreadCount();
      set({ unreadCount: res.data?.count ?? 0 });
    } catch {}
  },

  addToast: (toast) => {
    const existing = get().toasts;
    // Deduplicate
    if (existing.some((t) => t.message === toast.message && t.senderName === toast.senderName)) return;
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 6000);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
