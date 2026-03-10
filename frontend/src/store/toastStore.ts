import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;    // notification text: "Alice commented on PRD-001"
  content: string;    // actual message body for inline preview/reply
  type: string;
  link: string | null;
  entityType: string;
  entityId: number;
  senderName: string; // display name of the person who triggered the event
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (toast) => {
    if (get().toasts.some((t) => t.message === toast.message && t.senderName === toast.senderName)) return;
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 10000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
