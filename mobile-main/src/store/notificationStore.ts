import { create } from 'zustand';
import { Toast } from '../types';

interface NotificationStore {
  unreadCount: number;
  toasts: Toast[];

  setUnreadCount: (n: number) => void;
  incrementUnread: () => void;

  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  unreadCount: 0,
  toasts: [],

  setUnreadCount: (n) => set({ unreadCount: n }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),

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
